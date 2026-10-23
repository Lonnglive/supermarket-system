import { pool } from '../config/db.js';

export async function getDailySalesSummary(dateStr?: string) {
  let targetDate = dateStr;
  if (!targetDate) {
    const cdRes = await pool.query('SELECT CURRENT_DATE::text as today');
    targetDate = cdRes.rows[0].today;
  }

  // 1. Sales aggregates directly from sales table (exact, no duplication)
  const salesAggRes = await pool.query(
    `SELECT
      COUNT(id) as total_bills,
      COALESCE(SUM(subtotal), 0) as gross_sales,
      COALESCE(SUM(discount_amount), 0) as discounts,
      COALESCE(SUM(tax_amount), 0) as taxes,
      COALESCE(SUM(round_off), 0) as round_off,
      COALESCE(SUM(grand_total), 0) as net_sales
     FROM sales
     WHERE DATE(created_at) = $1 AND status = 'COMPLETED'`,
    [targetDate]
  );

  // 2. Items sold aggregates from sale_items
  const itemsAggRes = await pool.query(
    `SELECT
      COALESCE(SUM(si.quantity), 0) as total_items_sold,
      COUNT(DISTINCT si.product_id) as unique_products_sold
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE DATE(s.created_at) = $1 AND s.status = 'COMPLETED'`,
    [targetDate]
  );

  // 3. Payment-wise breakdown (Cash, Card, UPI / GPay)
  const paymentsRes = await pool.query(
    `SELECT 
      p.payment_method,
      COALESCE(SUM(p.amount), 0) as total_amount,
      COUNT(DISTINCT p.sale_id) as transaction_count
     FROM payments p
     JOIN sales s ON p.sale_id = s.id
     WHERE DATE(s.created_at) = $1 AND s.status = 'COMPLETED'
     GROUP BY p.payment_method`,
    [targetDate]
  );

  const paymentBreakdown: Record<string, number> = {
    CASH: 0,
    CARD: 0,
    UPI: 0,
    SPLIT: 0
  };
  const paymentCounts: Record<string, number> = {
    CASH: 0,
    CARD: 0,
    UPI: 0,
    SPLIT: 0
  };

  paymentsRes.rows.forEach(r => {
    paymentBreakdown[r.payment_method] = Number(r.total_amount);
    paymentCounts[r.payment_method] = parseInt(r.transaction_count, 10);
  });

  // 4. Top selling products
  const topProductsRes = await pool.query(
    `SELECT 
      si.product_id, si.product_name,
      SUM(si.quantity) as total_quantity,
      SUM(si.line_total) as total_revenue
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     WHERE DATE(s.created_at) = $1 AND s.status = 'COMPLETED'
     GROUP BY si.product_id, si.product_name
     ORDER BY total_quantity DESC
     LIMIT 10`,
    [targetDate]
  );

  // 5. Low stock count
  const lowStockRes = await pool.query(
    `SELECT COUNT(*) as count FROM products WHERE is_active = true AND current_stock <= min_stock_level`
  );

  // 6. Cashier performance
  const cashiersRes = await pool.query(
    `SELECT 
      u.full_name as cashier_name,
      COUNT(s.id) as bills_count,
      SUM(s.grand_total) as total_collected
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     WHERE DATE(s.created_at) = $1 AND s.status = 'COMPLETED'
     GROUP BY u.id, u.full_name
     ORDER BY total_collected DESC`,
    [targetDate]
  );

  const sRow = salesAggRes.rows[0] || {};
  const iRow = itemsAggRes.rows[0] || {};

  return {
    reportDate: targetDate,
    summary: {
      totalBills: parseInt(sRow.total_bills || '0', 10),
      grossSales: Number(sRow.gross_sales || 0),
      discounts: Number(sRow.discounts || 0),
      taxes: Number(sRow.taxes || 0),
      roundOff: Number(sRow.round_off || 0),
      netSales: Number(sRow.net_sales || 0),
      totalItemsSold: Number(iRow.total_items_sold || 0),
      uniqueProductsSold: parseInt(iRow.unique_products_sold || '0', 10),
      cashSales: paymentBreakdown.CASH || 0,
      cardSales: paymentBreakdown.CARD || 0,
      upiSales: paymentBreakdown.UPI || 0,
      gpaySales: paymentBreakdown.UPI || 0,
      lowStockCount: parseInt(lowStockRes.rows[0]?.count || '0', 10)
    },
    paymentBreakdown,
    paymentCounts,
    topProducts: topProductsRes.rows,
    cashierPerformance: cashiersRes.rows
  };
}

export async function getSoldItemsReport(params: {
  date?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  categoryId?: string;
}) {
  let targetStart = params.startDate || params.date;
  let targetEnd = params.endDate || params.date;
  if (!targetStart || !targetEnd) {
    const cdRes = await pool.query('SELECT CURRENT_DATE::text as today');
    const today = cdRes.rows[0].today;
    if (!targetStart) targetStart = today;
    if (!targetEnd) targetEnd = today;
  }

  const conditions: string[] = [
    "s.status = 'COMPLETED'",
    "DATE(s.created_at) >= $1",
    "DATE(s.created_at) <= $2"
  ];
  const values: any[] = [targetStart, targetEnd];

  if (params.categoryId) {
    values.push(params.categoryId);
    conditions.push(`p.category_id = $${values.length}`);
  }

  if (params.search) {
    values.push(`%${params.search.toLowerCase()}%`);
    conditions.push(`(LOWER(si.product_name) LIKE $${values.length} OR LOWER(p.barcode) LIKE $${values.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const res = await pool.query(
    `SELECT 
      si.product_id,
      si.product_name,
      COALESCE(p.barcode, 'N/A') as barcode,
      COALESCE(c.name, 'General') as category_name,
      COALESCE(u.name, 'pcs') as unit_name,
      COALESCE(p.current_stock, 0) as current_stock,
      SUM(si.quantity) as total_quantity_sold,
      ROUND(AVG(si.unit_price), 2) as avg_unit_price,
      SUM(si.discount_amount) as total_discount,
      SUM(si.tax_amount) as total_tax,
      SUM(si.line_total) as total_revenue,
      COUNT(DISTINCT si.sale_id) as bills_count
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     LEFT JOIN products p ON si.product_id = p.id
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN units u ON p.unit_id = u.id
     ${whereClause}
     GROUP BY si.product_id, si.product_name, p.barcode, c.name, u.name, p.current_stock
     ORDER BY total_revenue DESC, total_quantity_sold DESC`,
    values
  );

  let totalUnitsSold = 0;
  let totalRevenue = 0;
  let totalDiscounts = 0;
  let totalTaxes = 0;

  const items = res.rows.map(r => {
    const qty = Number(r.total_quantity_sold);
    const rev = Number(r.total_revenue);
    const disc = Number(r.total_discount);
    const tax = Number(r.total_tax);

    totalUnitsSold += qty;
    totalRevenue += rev;
    totalDiscounts += disc;
    totalTaxes += tax;

    return {
      productId: r.product_id,
      productName: r.product_name,
      barcode: r.barcode,
      categoryName: r.category_name,
      unitName: r.unit_name,
      currentStock: Number(r.current_stock),
      totalQuantitySold: qty,
      avgUnitPrice: Number(r.avg_unit_price),
      totalDiscount: disc,
      totalTax: tax,
      totalRevenue: rev,
      billsCount: parseInt(r.bills_count, 10)
    };
  });

  return {
    startDate: targetStart,
    endDate: targetEnd,
    totals: {
      uniqueProductsCount: items.length,
      totalUnitsSold,
      totalRevenue,
      totalDiscounts,
      totalTaxes
    },
    items
  };
}

export async function getDailySalesRecords(params: {
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  let endDate = params.endDate;
  let startDate = params.startDate;
  if (!endDate || !startDate) {
    const cdRes = await pool.query("SELECT CURRENT_DATE::text as today, (CURRENT_DATE - INTERVAL '30 days')::date::text as start_date");
    if (!endDate) endDate = cdRes.rows[0].today;
    if (!startDate) startDate = cdRes.rows[0].start_date;
  }

  const res = await pool.query(
    `WITH daily_sales AS (
       SELECT 
         DATE(created_at) as sale_date,
         COUNT(id) as total_bills,
         COALESCE(SUM(subtotal), 0) as gross_sales,
         COALESCE(SUM(discount_amount), 0) as discounts,
         COALESCE(SUM(tax_amount), 0) as taxes,
         COALESCE(SUM(round_off), 0) as round_off,
         COALESCE(SUM(grand_total), 0) as net_sales
       FROM sales
       WHERE status = 'COMPLETED'
         AND DATE(created_at) >= $1 AND DATE(created_at) <= $2
       GROUP BY DATE(created_at)
     ),
     daily_items AS (
       SELECT 
         DATE(s.created_at) as sale_date,
         COALESCE(SUM(si.quantity), 0) as total_items_sold,
         COUNT(DISTINCT si.product_id) as unique_products_sold
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE s.status = 'COMPLETED'
         AND DATE(s.created_at) >= $1 AND DATE(s.created_at) <= $2
       GROUP BY DATE(s.created_at)
     ),
     daily_payments AS (
       SELECT 
         DATE(s.created_at) as sale_date,
         COALESCE(SUM(CASE WHEN p.payment_method = 'CASH' THEN p.amount ELSE 0 END), 0) as cash_total,
         COALESCE(SUM(CASE WHEN p.payment_method = 'CARD' THEN p.amount ELSE 0 END), 0) as card_total,
         COALESCE(SUM(CASE WHEN p.payment_method = 'UPI' THEN p.amount ELSE 0 END), 0) as upi_gpay_total,
         COALESCE(COUNT(DISTINCT CASE WHEN p.payment_method = 'CASH' THEN p.sale_id END), 0) as cash_txns,
         COALESCE(COUNT(DISTINCT CASE WHEN p.payment_method = 'CARD' THEN p.sale_id END), 0) as card_txns,
         COALESCE(COUNT(DISTINCT CASE WHEN p.payment_method = 'UPI' THEN p.sale_id END), 0) as upi_gpay_txns
       FROM payments p
       JOIN sales s ON p.sale_id = s.id
       WHERE s.status = 'COMPLETED'
         AND DATE(s.created_at) >= $1 AND DATE(s.created_at) <= $2
       GROUP BY DATE(s.created_at)
     )
     SELECT 
       ds.sale_date::text as sale_date,
       ds.total_bills,
       COALESCE(di.total_items_sold, 0) as total_items_sold,
       COALESCE(di.unique_products_sold, 0) as unique_products_sold,
       ds.gross_sales,
       ds.discounts,
       ds.taxes,
       ds.round_off,
       ds.net_sales,
       COALESCE(dp.cash_total, 0) as cash_total,
       COALESCE(dp.card_total, 0) as card_total,
       COALESCE(dp.upi_gpay_total, 0) as upi_gpay_total,
       COALESCE(dp.cash_txns, 0) as cash_txns,
       COALESCE(dp.card_txns, 0) as card_txns,
       COALESCE(dp.upi_gpay_txns, 0) as upi_gpay_txns
     FROM daily_sales ds
     LEFT JOIN daily_items di ON ds.sale_date = di.sale_date
     LEFT JOIN daily_payments dp ON ds.sale_date = dp.sale_date
     ORDER BY ds.sale_date DESC
     LIMIT $3`,
    [startDate, endDate, params.limit || 60]
  );

  let periodBills = 0;
  let periodItems = 0;
  let periodRevenue = 0;
  let periodCash = 0;
  let periodCard = 0;
  let periodUpiGpay = 0;

  const records = res.rows.map(r => {
    const bills = parseInt(r.total_bills, 10);
    const items = Number(r.total_items_sold);
    const rev = Number(r.net_sales);
    const cash = Number(r.cash_total);
    const card = Number(r.card_total);
    const upi = Number(r.upi_gpay_total);

    periodBills += bills;
    periodItems += items;
    periodRevenue += rev;
    periodCash += cash;
    periodCard += card;
    periodUpiGpay += upi;

    return {
      saleDate: r.sale_date,
      totalBills: bills,
      totalItemsSold: items,
      uniqueProductsSold: parseInt(r.unique_products_sold, 10),
      grossSales: Number(r.gross_sales),
      discounts: Number(r.discounts),
      taxes: Number(r.taxes),
      roundOff: Number(r.round_off),
      netSales: rev,
      cashTotal: cash,
      cardTotal: card,
      upiGpayTotal: upi,
      cashTxns: parseInt(r.cash_txns, 10),
      cardTxns: parseInt(r.card_txns, 10),
      upiGpayTxns: parseInt(r.upi_gpay_txns, 10)
    };
  });

  return {
    startDate,
    endDate,
    totals: {
      totalDays: records.length,
      periodBills,
      periodItems,
      periodRevenue,
      periodCash,
      periodCard,
      periodUpiGpay
    },
    records
  };
}

export async function getSalesReport(params: {
  startDate?: string;
  endDate?: string;
  cashierId?: string;
  paymentMethod?: string;
}) {
  const conditions: string[] = ["s.status = 'COMPLETED'"];
  const values: any[] = [];

  if (params.startDate) {
    values.push(params.startDate);
    conditions.push(`DATE(s.created_at) >= $${values.length}`);
  }
  if (params.endDate) {
    values.push(params.endDate);
    conditions.push(`DATE(s.created_at) <= $${values.length}`);
  }
  if (params.cashierId) {
    values.push(params.cashierId);
    conditions.push(`s.cashier_id = $${values.length}`);
  }
  if (params.paymentMethod && params.paymentMethod !== 'ALL') {
    values.push(params.paymentMethod);
    conditions.push(`EXISTS (SELECT 1 FROM payments p WHERE p.sale_id = s.id AND p.payment_method = $${values.length})`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const res = await pool.query(
    `SELECT 
      s.id, s.invoice_number, s.subtotal, s.discount_amount, s.tax_amount,
      s.round_off, s.grand_total, s.status, s.created_at,
      u.full_name as cashier_name,
      c.name as customer_name,
      (SELECT string_agg(payment_method, ', ') FROM payments WHERE sale_id = s.id) as payment_methods,
      (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_id = s.id) as item_count
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     LEFT JOIN customers c ON s.customer_id = c.id
     ${whereClause}
     ORDER BY s.created_at DESC`,
    values
  );

  return res.rows;
}

export async function getHourlySalesBreakdown(dateStr?: string) {
  const targetDate = dateStr || new Date().toISOString().split('T')[0];

  const res = await pool.query(
    `SELECT 
      EXTRACT(HOUR FROM s.created_at)::INT as hour,
      COUNT(s.id) as bills_count,
      SUM(s.grand_total) as revenue
     FROM sales s
     WHERE DATE(s.created_at) = $1 AND s.status = 'COMPLETED'
     GROUP BY hour
     ORDER BY hour ASC`,
    [targetDate]
  );

  const hourlyData = [];
  const map = new Map(res.rows.map(r => [r.hour, r]));

  for (let h = 0; h < 24; h++) {
    const existing = map.get(h);
    hourlyData.push({
      hour: `${h.toString().padStart(2, '0')}:00`,
      billsCount: existing ? parseInt(existing.bills_count, 10) : 0,
      revenue: existing ? Number(existing.revenue) : 0
    });
  }

  return hourlyData;
}
