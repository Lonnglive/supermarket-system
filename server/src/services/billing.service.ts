import { pool } from '../config/db.js';
import { logAuditAction } from './audit.service.js';

export interface CartItemInput {
  productId: string;
  batchId?: string;
  quantity: number;
  unitPrice: number;
  mrp: number;
  discountAmount?: number;
  taxRate?: number;
}

export interface PaymentInput {
  paymentMethod: 'CASH' | 'CARD' | 'UPI' | 'SPLIT';
  amount: number;
  tenderedAmount?: number;
  changeAmount?: number;
  referenceNumber?: string;
}

export interface CreateSaleInput {
  clientTxnId?: string;
  customerId?: string;
  items: CartItemInput[];
  payments: PaymentInput[];
  discountAmount?: number;
  notes?: string;
  heldBillId?: string;
}

export async function searchProductsForPOS(params: {
  query?: string;
  barcode?: string;
  categoryId?: string;
  limit?: number;
}) {
  const limit = params.limit || 30;
  const conditions: string[] = ['p.is_active = true'];
  const values: any[] = [];

  if (params.barcode) {
    values.push(params.barcode.trim());
    conditions.push(`(p.barcode = $${values.length} OR p.sku = $${values.length})`);
  } else if (params.query) {
    values.push(`%${params.query.trim().toLowerCase()}%`);
    conditions.push(`(
      LOWER(p.name) LIKE $${values.length} OR
      LOWER(p.barcode) LIKE $${values.length} OR
      LOWER(p.sku) LIKE $${values.length} OR
      LOWER(COALESCE(p.short_name, '')) LIKE $${values.length}
    )`);
  }

  if (params.categoryId) {
    values.push(params.categoryId);
    conditions.push(`p.category_id = $${values.length}`);
  }

  values.push(limit);

  const query = `
    SELECT 
      p.id, p.sku, p.barcode, p.name, p.short_name,
      p.selling_price, p.mrp, p.tax_rate, p.current_stock,
      p.min_stock_level, p.has_expiry,
      u.name as unit_name, u.allow_decimals,
      c.id as category_id, c.name as category_name, c.color as category_color
    FROM products p
    LEFT JOIN units u ON p.unit_id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.name ASC
    LIMIT $${values.length}
  `;

  const res = await pool.query(query, values);
  return res.rows;
}

export async function createSaleTransaction(
  saleInput: CreateSaleInput,
  cashierId: string,
  ipAddress?: string
) {
  const { clientTxnId, customerId, items, payments, notes, heldBillId } = saleInput;

  if (!items || items.length === 0) {
    throw new Error('Cannot process an empty bill. Please add at least one product.');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check idempotency if clientTxnId provided
    if (clientTxnId) {
      const existingRes = await client.query(
        `SELECT id, invoice_number FROM sales WHERE client_txn_id = $1`,
        [clientTxnId]
      );
      if (existingRes.rowCount && existingRes.rowCount > 0) {
        await client.query('COMMIT');
        return getSaleByInvoiceNumber(existingRes.rows[0].invoice_number);
      }
    }

    // 2. Generate safe sequential invoice number
    const seqRes = await client.query(`SELECT get_next_document_number('INVOICE') as invoice_number`);
    const invoiceNumber = seqRes.rows[0].invoice_number;

    let subtotal = 0;
    let totalDiscount = saleInput.discountAmount || 0;
    let totalTax = 0;

    const validatedItems: Array<{
      productId: string;
      batchId: string | null;
      productName: string;
      quantity: number;
      unitPrice: number;
      mrp: number;
      discountAmount: number;
      taxRate: number;
      taxAmount: number;
      lineTotal: number;
      newStock: number;
    }> = [];

    // 3. Process each line item with row locks on products
    for (const item of items) {
      if (item.quantity <= 0) {
        throw new Error(`Invalid item quantity: ${item.quantity}`);
      }

      const prodRes = await client.query(
        `SELECT id, name, selling_price, mrp, tax_rate, current_stock
         FROM products
         WHERE id = $1
         FOR UPDATE`,
        [item.productId]
      );

      if (prodRes.rowCount === 0) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const product = prodRes.rows[0];
      const unitPrice = Number(item.unitPrice ?? product.selling_price);
      const mrp = Number(item.mrp ?? product.mrp);
      const taxRate = Number(item.taxRate ?? product.tax_rate);
      const discount = Number(item.discountAmount || 0);

      const rawLineTotal = (unitPrice * item.quantity) - discount;
      const taxAmount = (rawLineTotal * taxRate) / (100 + taxRate); // Tax inclusive standard
      const lineTotal = rawLineTotal;

      subtotal += (unitPrice * item.quantity);
      totalTax += taxAmount;

      const currentStock = Number(product.current_stock);
      const newStock = currentStock - item.quantity;

      validatedItems.push({
        productId: product.id,
        batchId: item.batchId || null,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        mrp,
        discountAmount: discount,
        taxRate,
        taxAmount,
        lineTotal,
        newStock
      });
    }

    const grandTotalBeforeRound = subtotal - totalDiscount;
    const roundedGrandTotal = Math.round(grandTotalBeforeRound);
    const roundOff = Number((roundedGrandTotal - grandTotalBeforeRound).toFixed(2));
    const grandTotal = roundedGrandTotal;

    // 4. Validate customer (default to walk-in if not provided)
    let finalCustomerId = customerId;
    if (!finalCustomerId) {
      const walkinRes = await client.query(
        `SELECT id FROM customers WHERE name = 'Walk-in Customer' LIMIT 1`
      );
      if (walkinRes.rowCount && walkinRes.rowCount > 0) {
        finalCustomerId = walkinRes.rows[0].id;
      }
    }

    // 5. Insert into sales table
    const saleInsertRes = await client.query(
      `INSERT INTO sales (
        client_txn_id, invoice_number, customer_id, cashier_id,
        subtotal, discount_amount, tax_amount, round_off, grand_total,
        status, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'COMPLETED', $10, CURRENT_TIMESTAMP)
      RETURNING id, invoice_number, created_at`,
      [
        clientTxnId || null,
        invoiceNumber,
        finalCustomerId || null,
        cashierId,
        subtotal,
        totalDiscount,
        totalTax,
        roundOff,
        grandTotal,
        notes || null
      ]
    );

    const saleId = saleInsertRes.rows[0].id;

    // 6. Insert sale items, update product stock & create inventory movements
    for (const vItem of validatedItems) {
      // Insert item
      await client.query(
        `INSERT INTO sale_items (
          sale_id, product_id, batch_id, product_name,
          quantity, unit_price, mrp, discount_amount, tax_rate, tax_amount, line_total
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          saleId,
          vItem.productId,
          vItem.batchId,
          vItem.productName,
          vItem.quantity,
          vItem.unitPrice,
          vItem.mrp,
          vItem.discountAmount,
          vItem.taxRate,
          vItem.taxAmount,
          vItem.lineTotal
        ]
      );

      // Deduct stock
      await client.query(
        `UPDATE products
         SET current_stock = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [vItem.newStock, vItem.productId]
      );

      // Record inventory movement ledger
      await client.query(
        `INSERT INTO inventory_movements (
          product_id, batch_id, movement_type, quantity_in, quantity_out,
          balance_after, reference_type, reference_id, user_id, notes
        ) VALUES ($1, $2, 'SALE', 0.000, $3, $4, 'SALE', $5, $6, $7)`,
        [
          vItem.productId,
          vItem.batchId,
          vItem.quantity,
          vItem.newStock,
          invoiceNumber,
          cashierId,
          `Sale invoice ${invoiceNumber}`
        ]
      );
    }

    // 7. Record payments
    for (const payment of payments) {
      await client.query(
        `INSERT INTO payments (
          sale_id, payment_method, amount, tendered_amount, change_amount, reference_number
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          saleId,
          payment.paymentMethod,
          payment.amount,
          payment.tenderedAmount || payment.amount,
          payment.changeAmount || 0,
          payment.referenceNumber || null
        ]
      );
    }

    // 8. If this completed a held bill, remove it
    if (heldBillId) {
      await client.query(`DELETE FROM held_bills WHERE id = $1`, [heldBillId]);
    }

    await client.query('COMMIT');

    // 9. Asynchronously audit log the sale creation
    logAuditAction({
      userId: cashierId,
      action: 'BILLING_SALE_CREATED',
      entity: 'sales',
      entityId: saleId,
      newValues: { invoiceNumber, grandTotal, itemCount: items.length },
      ipAddress
    });

    return getSaleByInvoiceNumber(invoiceNumber);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getSaleByInvoiceNumber(invoiceNumber: string) {
  const saleRes = await pool.query(
    `SELECT 
      s.id, s.invoice_number, s.subtotal, s.discount_amount, s.tax_amount,
      s.round_off, s.grand_total, s.status, s.notes, s.created_at,
      u.full_name as cashier_name, u.username as cashier_username,
      c.name as customer_name, c.phone as customer_phone
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.invoice_number = $1`,
    [invoiceNumber]
  );

  if (saleRes.rowCount === 0) {
    throw new Error(`Sale not found with invoice: ${invoiceNumber}`);
  }

  const sale = saleRes.rows[0];

  const itemsRes = await pool.query(
    `SELECT 
      si.id, si.product_id, si.product_name, si.quantity,
      si.unit_price, si.mrp, si.discount_amount, si.tax_rate, si.tax_amount, si.line_total,
      p.barcode, u.name as unit_name
    FROM sale_items si
    LEFT JOIN products p ON si.product_id = p.id
    LEFT JOIN units u ON p.unit_id = u.id
    WHERE si.sale_id = $1`,
    [sale.id]
  );

  const paymentsRes = await pool.query(
    `SELECT payment_method, amount, tendered_amount, change_amount, reference_number
     FROM payments
     WHERE sale_id = $1`,
    [sale.id]
  );

  const storeRes = await pool.query(`SELECT * FROM store_settings LIMIT 1`);
  const store = storeRes.rows[0] || {};

  return {
    sale: {
      ...sale,
      items: itemsRes.rows,
      payments: paymentsRes.rows
    },
    store
  };
}

export async function getRecentBills(params: { limit?: number; cashierId?: string }) {
  const limit = params.limit || 20;
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.cashierId) {
    values.push(params.cashierId);
    conditions.push(`s.cashier_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit);

  const query = `
    SELECT 
      s.id, s.invoice_number, s.subtotal, s.discount_amount,
      s.grand_total, s.status, s.created_at,
      u.full_name as cashier_name,
      c.name as customer_name,
      (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as item_count,
      (SELECT payment_method FROM payments WHERE sale_id = s.id LIMIT 1) as payment_method
    FROM sales s
    JOIN users u ON s.cashier_id = u.id
    LEFT JOIN customers c ON s.customer_id = c.id
    ${whereClause}
    ORDER BY s.created_at DESC
    LIMIT $${values.length}
  `;

  const res = await pool.query(query, values);
  return res.rows;
}

// -----------------------------------------------------------------------------
// HELD BILLS MANAGEMENT
// -----------------------------------------------------------------------------
export async function holdActiveBill(params: {
  cashierId: string;
  billReference?: string;
  customerId?: string;
  customerName?: string;
  cartData: any;
  subtotal: number;
}) {
  const { cashierId, billReference, customerId, customerName, cartData, subtotal } = params;
  const reference = billReference || `HOLD-${Date.now().toString().slice(-6)}`;

  const res = await pool.query(
    `INSERT INTO held_bills (
      bill_reference, cashier_id, customer_id, customer_name, cart_data, subtotal, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
    RETURNING id, bill_reference, created_at`,
    [
      reference,
      cashierId,
      customerId || null,
      customerName || 'Walk-in Customer',
      JSON.stringify(cartData),
      subtotal
    ]
  );

  return res.rows[0];
}

export async function getHeldBills(cashierId?: string) {
  let query = `
    SELECT id, bill_reference, customer_name, cart_data, subtotal, created_at
    FROM held_bills
  `;
  const values: any[] = [];
  if (cashierId) {
    values.push(cashierId);
    query += ` WHERE cashier_id = $1`;
  }
  query += ` ORDER BY created_at DESC`;

  const res = await pool.query(query, values);
  return res.rows;
}

export async function deleteHeldBill(id: string) {
  await pool.query(`DELETE FROM held_bills WHERE id = $1`, [id]);
  return { success: true };
}
