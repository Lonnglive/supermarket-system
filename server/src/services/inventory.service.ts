import { pool } from '../config/db.js';
import { logAuditAction } from './audit.service.js';

export async function getStockDashboard() {
  const summaryRes = await pool.query(`
    SELECT
      COUNT(*) as total_products,
      COUNT(*) FILTER (WHERE current_stock <= min_stock_level AND current_stock > 0) as low_stock,
      COUNT(*) FILTER (WHERE current_stock <= 0) as out_of_stock,
      COALESCE(SUM(current_stock * purchase_price), 0) as stock_valuation_cost,
      COALESCE(SUM(current_stock * selling_price), 0) as stock_valuation_retail
    FROM products
    WHERE is_active = true
  `);

  const todayStatsRes = await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(si.quantity), 0)
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       WHERE DATE(s.created_at) = CURRENT_DATE AND s.status = 'COMPLETED') as today_sales_qty,

      (SELECT COALESCE(SUM(p.grand_total), 0)
       FROM purchases p
       WHERE p.purchase_date = CURRENT_DATE) as today_purchases_amount,

      (SELECT COUNT(*)
       FROM stock_adjustments sa
       WHERE DATE(sa.created_at) = CURRENT_DATE) as today_adjustments_count
  `);

  const recentMovementsRes = await pool.query(`
    SELECT 
      im.id, im.movement_type, im.quantity_in, im.quantity_out,
      im.balance_after, im.reference_type, im.reference_id, im.notes, im.created_at,
      p.name as product_name, p.barcode,
      u.full_name as user_name
    FROM inventory_movements im
    JOIN products p ON im.product_id = p.id
    LEFT JOIN users u ON im.user_id = u.id
    ORDER BY im.created_at DESC
    LIMIT 10
  `);

  return {
    metrics: {
      ...summaryRes.rows[0],
      ...todayStatsRes.rows[0]
    },
    recentMovements: recentMovementsRes.rows
  };
}

export async function getMovementsLedger(params: {
  productId?: string;
  movementType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, params.limit || 50);
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: any[] = [];

  if (params.productId) {
    values.push(params.productId);
    conditions.push(`im.product_id = $${values.length}`);
  }
  if (params.movementType) {
    values.push(params.movementType);
    conditions.push(`im.movement_type = $${values.length}`);
  }
  if (params.startDate) {
    values.push(params.startDate);
    conditions.push(`DATE(im.created_at) >= $${values.length}`);
  }
  if (params.endDate) {
    values.push(params.endDate);
    conditions.push(`DATE(im.created_at) <= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM inventory_movements im ${whereClause}`,
    values
  );
  const total = parseInt(countRes.rows[0].count, 10);

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const res = await pool.query(
    `SELECT 
      im.id, im.movement_type, im.quantity_in, im.quantity_out,
      im.balance_after, im.reference_type, im.reference_id, im.notes, im.created_at,
      p.name as product_name, p.barcode, p.sku,
      un.name as unit_name,
      u.full_name as user_name
     FROM inventory_movements im
     JOIN products p ON im.product_id = p.id
     LEFT JOIN units un ON p.unit_id = un.id
     LEFT JOIN users u ON im.user_id = u.id
     ${whereClause}
     ORDER BY im.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );

  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    movements: res.rows
  };
}

export async function createStockAdjustment(params: {
  productId: string;
  newQuantity: number;
  adjustmentType: 'PHYSICAL_COUNT' | 'DAMAGED' | 'EXPIRED' | 'CORRECTION';
  reason: string;
  userId: string;
  ipAddress?: string;
}) {
  const { productId, newQuantity, adjustmentType, reason, userId, ipAddress } = params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock product row
    const prodRes = await client.query(
      `SELECT id, name, current_stock FROM products WHERE id = $1 FOR UPDATE`,
      [productId]
    );

    if (prodRes.rowCount === 0) {
      throw new Error(`Product not found: ${productId}`);
    }

    const product = prodRes.rows[0];
    const oldQty = Number(product.current_stock);
    const newQty = Number(newQuantity);
    const diffQty = newQty - oldQty;

    if (diffQty === 0) {
      throw new Error('New stock count is identical to existing stock count. No adjustment needed.');
    }

    // 2. Generate Adjustment document number
    const seqRes = await client.query(`SELECT get_next_document_number('ADJUSTMENT') as doc_num`);
    const adjustmentNumber = seqRes.rows[0].doc_num;

    // 3. Record in stock_adjustments
    const adjInsertRes = await client.query(
      `INSERT INTO stock_adjustments (
        adjustment_number, product_id, user_id, adjustment_type,
        old_quantity, new_quantity, difference_quantity, reason, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING id, adjustment_number`,
      [
        adjustmentNumber,
        productId,
        userId,
        adjustmentType,
        oldQty,
        newQty,
        diffQty,
        reason
      ]
    );

    // 4. Update product current_stock
    await client.query(
      `UPDATE products SET current_stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [newQty, productId]
    );

    // 5. Record movement in inventory_movements ledger
    const qtyIn = diffQty > 0 ? diffQty : 0;
    const qtyOut = diffQty < 0 ? Math.abs(diffQty) : 0;

    await client.query(
      `INSERT INTO inventory_movements (
        product_id, movement_type, quantity_in, quantity_out,
        balance_after, reference_type, reference_id, user_id, notes
      ) VALUES ($1, $2, $3, $4, $5, 'ADJUSTMENT', $6, $7, $8)`,
      [
        productId,
        adjustmentType,
        qtyIn,
        qtyOut,
        newQty,
        adjustmentNumber,
        userId,
        `Adjustment (${adjustmentType}): ${reason}`
      ]
    );

    await client.query('COMMIT');

    // 6. Audit log
    logAuditAction({
      userId,
      action: 'STOCK_ADJUSTMENT',
      entity: 'products',
      entityId: productId,
      oldValues: { stock: oldQty },
      newValues: { stock: newQty, diffQty, adjustmentType, reason },
      ipAddress
    });

    return {
      success: true,
      adjustmentNumber,
      productName: product.name,
      oldQuantity: oldQty,
      newQuantity: newQty,
      difference: diffQty
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createPurchaseOrder(params: {
  supplierId: string;
  supplierInvoiceNumber?: string;
  purchaseDate?: string;
  items: Array<{
    productId: string;
    quantity: number;
    purchaseRate: number;
    taxRate?: number;
    batchNumber?: string;
    expiryDate?: string;
  }>;
  notes?: string;
  userId: string;
  ipAddress?: string;
}) {
  const { supplierId, supplierInvoiceNumber, purchaseDate, items, notes, userId, ipAddress } = params;
  if (!items || items.length === 0) {
    throw new Error('Purchase order must contain at least one product item.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Generate purchase document number
    const seqRes = await client.query(`SELECT get_next_document_number('PURCHASE') as doc_num`);
    const invoiceNumber = seqRes.rows[0].doc_num;

    let subtotal = 0;
    let totalTax = 0;

    const validatedItems: any[] = [];

    // 2. Validate items
    for (const item of items) {
      const prodRes = await client.query(
        `SELECT id, name, current_stock FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId]
      );

      if (prodRes.rowCount === 0) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const product = prodRes.rows[0];
      const rate = Number(item.purchaseRate);
      const taxRate = Number(item.taxRate || 0);
      const lineSubtotal = rate * item.quantity;
      const taxAmount = (lineSubtotal * taxRate) / 100;
      const lineTotal = lineSubtotal + taxAmount;

      subtotal += lineSubtotal;
      totalTax += taxAmount;

      const currentStock = Number(product.current_stock);
      const newStock = currentStock + item.quantity;

      validatedItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        purchaseRate: rate,
        taxRate,
        taxAmount,
        lineTotal,
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
        newStock
      });
    }

    const grandTotal = subtotal + totalTax;

    // 3. Insert purchase record
    const purchRes = await client.query(
      `INSERT INTO purchases (
        invoice_number, supplier_invoice_number, supplier_id, user_id,
        purchase_date, subtotal, tax_amount, grand_total, payment_status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID', $9, CURRENT_TIMESTAMP)
      RETURNING id, invoice_number`,
      [
        invoiceNumber,
        supplierInvoiceNumber || null,
        supplierId,
        userId,
        purchaseDate || new Date().toISOString().split('T')[0],
        subtotal,
        totalTax,
        grandTotal,
        notes || null
      ]
    );

    const purchaseId = purchRes.rows[0].id;

    // 4. Insert items, update product stock, and record inventory movements
    for (const vItem of validatedItems) {
      await client.query(
        `INSERT INTO purchase_items (
          purchase_id, product_id, quantity, purchase_rate,
          tax_rate, tax_amount, line_total, batch_number, expiry_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          purchaseId,
          vItem.productId,
          vItem.quantity,
          vItem.purchaseRate,
          vItem.taxRate,
          vItem.taxAmount,
          vItem.lineTotal,
          vItem.batchNumber,
          vItem.expiryDate
        ]
      );

      // Update product current stock and purchase price
      await client.query(
        `UPDATE products
         SET current_stock = $1,
             purchase_price = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [vItem.newStock, vItem.purchaseRate, vItem.productId]
      );

      // Record inventory movement ledger
      await client.query(
        `INSERT INTO inventory_movements (
          product_id, movement_type, quantity_in, quantity_out,
          balance_after, reference_type, reference_id, user_id, notes
        ) VALUES ($1, 'PURCHASE', $2, 0.000, $3, 'PURCHASE', $4, $5, $6)`,
        [
          vItem.productId,
          vItem.quantity,
          vItem.newStock,
          invoiceNumber,
          userId,
          `Purchase received: Invoice ${invoiceNumber}`
        ]
      );
    }

    await client.query('COMMIT');

    logAuditAction({
      userId,
      action: 'PURCHASE_RECEIPT',
      entity: 'purchases',
      entityId: purchaseId,
      newValues: { invoiceNumber, supplierId, grandTotal, itemsCount: items.length },
      ipAddress
    });

    return {
      success: true,
      purchaseId,
      invoiceNumber,
      grandTotal
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getLowStockReport() {
  const res = await pool.query(`
    SELECT 
      p.id, p.sku, p.barcode, p.name, p.current_stock, p.min_stock_level, p.max_stock_level,
      p.purchase_price, p.selling_price,
      u.name as unit_name,
      c.name as category_name,
      s.name as supplier_name, s.phone as supplier_phone,
      GREATEST(0, (p.max_stock_level - p.current_stock)) as suggested_reorder_quantity,
      CASE 
        WHEN p.current_stock <= 0 THEN 'OUT_OF_STOCK'
        WHEN p.current_stock <= (p.min_stock_level / 2) THEN 'CRITICAL'
        ELSE 'LOW_STOCK'
      END as urgency_level
    FROM products p
    LEFT JOIN units u ON p.unit_id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.is_active = true AND p.current_stock <= p.min_stock_level
    ORDER BY p.current_stock ASC, urgency_level DESC
  `);

  return res.rows;
}
