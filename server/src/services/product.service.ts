import { pool } from '../config/db.js';
import { logAuditAction } from './audit.service.js';

export interface CreateProductInput {
  sku: string;
  barcode: string;
  name: string;
  shortName?: string;
  categoryId?: string;
  subcategoryId?: string;
  brandId?: string;
  unitId: string;
  supplierId?: string;
  purchasePrice: number;
  sellingPrice: number;
  mrp: number;
  taxRate?: number;
  openingStock?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
  hasExpiry?: boolean;
  hasBatch?: boolean;
}

export async function getAllProducts(params: {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  stockStatus?: 'ALL' | 'LOW' | 'OUT' | 'AVAILABLE';
  limit?: number;
  offset?: number;
}) {
  const limit = params.limit || 50;
  const offset = params.offset || 0;
  const conditions: string[] = ['p.is_active = true'];
  const values: any[] = [];

  if (params.search) {
    values.push(`%${params.search.trim().toLowerCase()}%`);
    conditions.push(`(
      LOWER(p.name) LIKE $${values.length} OR
      LOWER(p.barcode) LIKE $${values.length} OR
      LOWER(p.sku) LIKE $${values.length}
    )`);
  }

  if (params.categoryId) {
    values.push(params.categoryId);
    conditions.push(`p.category_id = $${values.length}`);
  }

  if (params.supplierId) {
    values.push(params.supplierId);
    conditions.push(`p.supplier_id = $${values.length}`);
  }

  if (params.stockStatus === 'LOW') {
    conditions.push(`p.current_stock <= p.min_stock_level AND p.current_stock > 0`);
  } else if (params.stockStatus === 'OUT') {
    conditions.push(`p.current_stock <= 0`);
  } else if (params.stockStatus === 'AVAILABLE') {
    conditions.push(`p.current_stock > p.min_stock_level`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const countRes = await pool.query(
    `SELECT COUNT(*) FROM products p ${whereClause}`,
    values
  );
  const total = parseInt(countRes.rows[0].count, 10);

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const query = `
    SELECT 
      p.id, p.sku, p.barcode, p.name, p.short_name,
      p.purchase_price, p.selling_price, p.mrp, p.tax_rate,
      p.current_stock, p.min_stock_level, p.max_stock_level,
      p.has_expiry, p.has_batch, p.is_active, p.created_at, p.updated_at,
      COALESCE((SELECT SUM(si.quantity) FROM sale_items si WHERE si.product_id = p.id), 0) as total_sold,
      u.id as unit_id, u.name as unit_name, u.allow_decimals,
      c.id as category_id, c.name as category_name, c.color as category_color,
      s.id as supplier_id, s.name as supplier_name
    FROM products p
    LEFT JOIN units u ON p.unit_id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ${whereClause}
    ORDER BY p.name ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const res = await pool.query(query, values);
  return {
    total,
    products: res.rows
  };
}

export async function createProduct(input: CreateProductInput, userId: string, ipAddress?: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check unique sku or barcode
    const existCheck = await client.query(
      `SELECT id, sku, barcode FROM products WHERE sku = $1 OR barcode = $2`,
      [input.sku.trim(), input.barcode.trim()]
    );

    if (existCheck.rowCount && existCheck.rowCount > 0) {
      const match = existCheck.rows[0];
      if (match.sku === input.sku.trim()) throw new Error(`Product with SKU "${input.sku}" already exists.`);
      if (match.barcode === input.barcode.trim()) throw new Error(`Product with Barcode "${input.barcode}" already exists.`);
    }

    const openingStock = Number(input.openingStock || 0);

    const insertRes = await client.query(
      `INSERT INTO products (
        sku, barcode, name, short_name, category_id, subcategory_id,
        brand_id, unit_id, supplier_id, purchase_price, selling_price,
        mrp, tax_rate, current_stock, min_stock_level, max_stock_level,
        has_expiry, has_batch, is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        input.sku.trim(),
        input.barcode.trim(),
        input.name.trim(),
        input.shortName?.trim() || null,
        input.categoryId || null,
        input.subcategoryId || null,
        input.brandId || null,
        input.unitId,
        input.supplierId || null,
        input.purchasePrice,
        input.sellingPrice,
        input.mrp,
        input.taxRate || 0,
        openingStock,
        input.minStockLevel || 5,
        input.maxStockLevel || 100,
        input.hasExpiry || false,
        input.hasBatch || false
      ]
    );

    const createdProduct = insertRes.rows[0];

    // If opening stock > 0, log movement
    if (openingStock > 0) {
      await client.query(
        `INSERT INTO inventory_movements (
          product_id, movement_type, quantity_in, quantity_out,
          balance_after, reference_type, reference_id, user_id, notes
        ) VALUES ($1, 'OPENING', $2, 0.000, $2, 'MANUAL_CREATE', 'OPENING', $3, 'Initial opening stock upon product creation')`,
        [createdProduct.id, openingStock, userId]
      );
    }

    await client.query('COMMIT');

    logAuditAction({
      userId,
      action: 'PRODUCT_CREATED',
      entity: 'products',
      entityId: createdProduct.id,
      newValues: { name: createdProduct.name, barcode: createdProduct.barcode, price: createdProduct.selling_price },
      ipAddress
    });

    return createdProduct;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateProduct(
  id: string,
  updates: Partial<CreateProductInput>,
  userId: string,
  ipAddress?: string
) {
  const currentRes = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
  if (currentRes.rowCount === 0) {
    throw new Error('Product not found.');
  }
  const oldProduct = currentRes.rows[0];

  const query = `
    UPDATE products
    SET sku = COALESCE($1, sku),
        barcode = COALESCE($2, barcode),
        name = COALESCE($3, name),
        short_name = COALESCE($4, short_name),
        category_id = COALESCE($5, category_id),
        unit_id = COALESCE($6, unit_id),
        supplier_id = COALESCE($7, supplier_id),
        purchase_price = COALESCE($8, purchase_price),
        selling_price = COALESCE($9, selling_price),
        mrp = COALESCE($10, mrp),
        tax_rate = COALESCE($11, tax_rate),
        min_stock_level = COALESCE($12, min_stock_level),
        max_stock_level = COALESCE($13, max_stock_level),
        has_expiry = COALESCE($14, has_expiry),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $15
    RETURNING *
  `;

  const values = [
    updates.sku?.trim() || null,
    updates.barcode?.trim() || null,
    updates.name?.trim() || null,
    updates.shortName?.trim() || null,
    updates.categoryId || null,
    updates.unitId || null,
    updates.supplierId || null,
    updates.purchasePrice,
    updates.sellingPrice,
    updates.mrp,
    updates.taxRate,
    updates.minStockLevel,
    updates.maxStockLevel,
    updates.hasExpiry,
    id
  ];

  const updateRes = await pool.query(query, values);
  const updatedProduct = updateRes.rows[0];

  logAuditAction({
    userId,
    action: 'PRODUCT_UPDATED',
    entity: 'products',
    entityId: id,
    oldValues: {
      price: oldProduct.selling_price,
      mrp: oldProduct.mrp,
      purchasePrice: oldProduct.purchase_price
    },
    newValues: {
      price: updatedProduct.selling_price,
      mrp: updatedProduct.mrp,
      purchasePrice: updatedProduct.purchase_price
    },
    ipAddress
  });

  return updatedProduct;
}

export async function deleteProduct(id: string, userId: string, ipAddress?: string) {
  // Soft delete / deactivate to maintain referential integrity for sales records
  const res = await pool.query(
    `UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, name`,
    [id]
  );

  if (res.rowCount === 0) {
    throw new Error('Product not found.');
  }

  logAuditAction({
    userId,
    action: 'PRODUCT_DEACTIVATED',
    entity: 'products',
    entityId: id,
    oldValues: { is_active: true },
    newValues: { is_active: false },
    ipAddress
  });

  return { success: true, message: `Product "${res.rows[0].name}" deactivated.` };
}

export async function deleteMultipleProducts(ids: string[], userId: string, ipAddress?: string) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('No product IDs provided.');
  }

  const res = await pool.query(
    `UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::uuid[]) RETURNING id, name`,
    [ids]
  );

  for (const row of res.rows) {
    logAuditAction({
      userId,
      action: 'PRODUCT_DEACTIVATED',
      entity: 'products',
      entityId: row.id,
      oldValues: { is_active: true },
      newValues: { is_active: false },
      ipAddress
    });
  }

  return {
    success: true,
    count: res.rowCount ?? res.rows.length,
    message: `${res.rowCount ?? res.rows.length} product(s) deactivated successfully.`
  };
}

// -----------------------------------------------------------------------------
// CATEGORIES, SUPPLIERS, CUSTOMERS, UNITS
// -----------------------------------------------------------------------------
export async function getCategories() {
  const res = await pool.query(
    `SELECT c.*, COUNT(p.id) as product_count
     FROM categories c
     LEFT JOIN products p ON c.id = p.category_id AND p.is_active = true
     GROUP BY c.id
     ORDER BY c.display_order ASC, c.name ASC`
  );
  return res.rows;
}

export async function createCategory(data: { name?: string; color?: string; position?: number }, userId: string, ipAddress?: string) {
  const name = data.name?.trim();
  if (!name) throw new Error('Category name is required.');

  const client = await pool.connect();
  let category: any;
  try {
    await client.query('BEGIN');
    const existing = await client.query(`SELECT id FROM categories ORDER BY display_order ASC, name ASC`);
    const existingCount = existing.rowCount ?? existing.rows.length;
    const requestedPosition = Number.isFinite(Number(data.position)) ? Math.floor(Number(data.position)) : existingCount + 1;
    const insertIndex = Math.min(Math.max(requestedPosition - 1, 0), existingCount);
    const res = await client.query(
      `INSERT INTO categories (name, color, display_order) VALUES ($1, $2, 0) RETURNING *`,
      [name, data.color || '#10b981']
    );
    category = res.rows[0];
    const orderedIds = existing.rows.map(row => row.id);
    orderedIds.splice(insertIndex, 0, category.id);
    await client.query(
      `UPDATE categories AS c
       SET display_order = ordered.position - 1
       FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, position)
       WHERE c.id = ordered.id`,
      [orderedIds]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  await logAuditAction({ userId, action: 'CATEGORY_CREATED', entity: 'categories', entityId: category.id, newValues: category, ipAddress });
  return category;
}

export async function updateCategory(id: string, data: { name?: string; color?: string }, userId: string, ipAddress?: string) {
  const name = data.name?.trim();
  if (!name) throw new Error('Category name is required.');

  const existing = await pool.query(`SELECT * FROM categories WHERE id = $1`, [id]);
  if (existing.rowCount === 0) throw new Error('Category not found.');

  const res = await pool.query(
    `UPDATE categories SET name = $1, color = $2 WHERE id = $3 RETURNING *`,
    [name, data.color || existing.rows[0].color, id]
  );
  const category = res.rows[0];
  await logAuditAction({ userId, action: 'CATEGORY_UPDATED', entity: 'categories', entityId: id, oldValues: existing.rows[0], newValues: category, ipAddress });
  return category;
}

export async function reorderCategories(categoryIds: string[], userId: string, ipAddress?: string) {
  if (!Array.isArray(categoryIds)) throw new Error('A category order is required.');
  const current = await pool.query(`SELECT id FROM categories ORDER BY display_order ASC, name ASC`);
  if (categoryIds.length !== current.rowCount || new Set(categoryIds).size !== categoryIds.length) {
    throw new Error('The complete category order is required. Refresh and try again.');
  }
  const currentIds = new Set(current.rows.map(row => row.id));
  if (categoryIds.some(id => !currentIds.has(id))) {
    throw new Error('One or more categories no longer exist. Refresh and try again.');
  }

  await pool.query(
    `UPDATE categories AS c
     SET display_order = ordered.position - 1
     FROM unnest($1::uuid[]) WITH ORDINALITY AS ordered(id, position)
     WHERE c.id = ordered.id`,
    [categoryIds]
  );
  await logAuditAction({ userId, action: 'CATEGORY_REORDERED', entity: 'categories', newValues: { categoryIds }, ipAddress });
}

export async function deleteCategory(id: string, userId: string, ipAddress?: string) {
  const existing = await pool.query(
    `SELECT c.*, COUNT(p.id)::int AS product_count
     FROM categories c LEFT JOIN products p ON p.category_id = c.id
     WHERE c.id = $1 GROUP BY c.id`,
    [id]
  );
  if (existing.rowCount === 0) throw new Error('Category not found.');

  await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
  await logAuditAction({ userId, action: 'CATEGORY_DELETED', entity: 'categories', entityId: id, oldValues: existing.rows[0], ipAddress });
  return { success: true, productCount: existing.rows[0].product_count };
}

export async function getUnits() {
  const res = await pool.query(`SELECT * FROM units ORDER BY name ASC`);
  return res.rows;
}

export async function getSuppliers() {
  const res = await pool.query(
    `SELECT s.*, COUNT(p.id) as product_count
     FROM suppliers s
     LEFT JOIN products p ON s.id = p.supplier_id AND p.is_active = true
     GROUP BY s.id
     ORDER BY s.name ASC`
  );
  return res.rows;
}

export async function createSupplier(data: any, userId: string) {
  const res = await pool.query(
    `INSERT INTO suppliers (name, contact_person, phone, email, address, tax_id, payment_terms, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [data.name, data.contactPerson, data.phone, data.email, data.address, data.taxId, data.paymentTerms, data.notes]
  );
  return res.rows[0];
}

export async function getCustomers(search?: string) {
  let query = `SELECT * FROM customers`;
  const values: any[] = [];
  if (search) {
    values.push(`%${search.trim().toLowerCase()}%`);
    query += ` WHERE LOWER(name) LIKE $1 OR LOWER(phone) LIKE $1`;
  }
  query += ` ORDER BY name ASC LIMIT 50`;
  const res = await pool.query(query, values);
  return res.rows;
}

export async function createCustomer(data: any) {
  const res = await pool.query(
    `INSERT INTO customers (name, phone, email, address, tax_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.name || 'Walk-in Customer', data.phone || null, data.email || null, data.address || null, data.taxId || null, data.notes || null]
  );
  return res.rows[0];
}
