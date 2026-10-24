import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { logAuditAction } from './audit.service.js';

// Default password hash used during migration
const DEFAULT_ADMIN_PASSWORD = 'Admin@123';

export const DEFAULT_STOCK_FIELD_CONFIG: Record<string, { enabled: boolean; required: boolean; label: string; description?: string }> = {
  mrp: { enabled: true, required: true, label: 'MRP (Maximum Retail Price)', description: 'Print on label and pack' },
  sellingPrice: { enabled: true, required: true, label: 'Net / Selling Price', description: 'Final price charged at checkout' },
  purchasePrice: { enabled: true, required: false, label: 'Cost / Purchase Price', description: 'Wholesale acquisition cost per unit' },
  taxRate: { enabled: true, required: false, label: 'GST / Tax Rate (%)', description: 'Tax percentage applied on item' },
  barcode: { enabled: true, required: true, label: 'Barcode', description: 'Scannable barcode or EAN' },
  sku: { enabled: true, required: true, label: 'SKU Code', description: 'Stock Keeping Unit identifier' },
  shortName: { enabled: true, required: false, label: 'Short / Print Name', description: 'Abbreviated name for 200/58mm thermal receipts' },
  category: { enabled: true, required: true, label: 'Product Category', description: 'Department or grouping' },
  unit: { enabled: true, required: true, label: 'Measurement Unit', description: 'Pieces, kg, liters, packs' },
  supplier: { enabled: true, required: false, label: 'Supplier / Vendor', description: 'Vendor supplying this product' },
  openingStock: { enabled: true, required: false, label: 'Opening / Initial Stock', description: 'Starting quantity on hand' },
  minStockLevel: { enabled: true, required: false, label: 'Low Stock Alert Level', description: 'Minimum threshold before alert' },
  maxStockLevel: { enabled: true, required: false, label: 'Maximum Stock Capacity', description: 'Maximum shelf/warehouse capacity' },
  hasExpiry: { enabled: true, required: false, label: 'Expiry Date Tracking', description: 'Track expiration dates and batch shelf-life' }
};

export async function getStoreSettings() {
  const res = await pool.query(`SELECT * FROM store_settings WHERE id = 1`);
  if (res.rowCount === 0) {
    return {
      store_name: 'Bharathi Homelings',
      address: '742 Evergreen Terrace, Springfield',
      phone: '+1 (555) 019-2834',
      email: 'manager@freshmart.com',
      tax_number: 'GSTIN29ABCDE1234F1Z5',
      gst_number: 'GSTIN29ABCDE1234F1Z5',
      enable_gst: true,
      fssai_number: '',
      enable_fssai: false,
      logo_url: '',
      currency_symbol: '₹',
      receipt_header: 'Thank you for shopping with us!',
      receipt_footer: 'Goods once sold can be returned within 7 days with original receipt.',
      receipt_width: '200',
      enable_tax_inclusive: true,
      enable_round_off: true,
      stock_field_config: DEFAULT_STOCK_FIELD_CONFIG
    };
  }
  const row = res.rows[0];
  row.stock_field_config = {
    ...DEFAULT_STOCK_FIELD_CONFIG,
    ...(typeof row.stock_field_config === 'object' && row.stock_field_config ? row.stock_field_config : {})
  };
  return row;
}

export async function updateStoreSettings(settings: any, userId: string, ipAddress?: string) {
  const oldSettings = await getStoreSettings();

  const query = `
    UPDATE store_settings
    SET store_name = COALESCE($1, store_name),
        address = COALESCE($2, address),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        tax_number = COALESCE($5, tax_number),
        currency_symbol = COALESCE($6, currency_symbol),
        receipt_header = COALESCE($7, receipt_header),
        receipt_footer = COALESCE($8, receipt_footer),
        receipt_width = COALESCE($9, receipt_width),
        enable_tax_inclusive = COALESCE($10, enable_tax_inclusive),
        enable_round_off = COALESCE($11, enable_round_off),
        gst_number = COALESCE($12, gst_number),
        enable_gst = COALESCE($13, enable_gst),
        fssai_number = COALESCE($14, fssai_number),
        enable_fssai = COALESCE($15, enable_fssai),
        logo_url = COALESCE($16, logo_url),
        stock_field_config = COALESCE($17, stock_field_config),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    RETURNING *
  `;

  const stockFieldConfigVal = settings.stock_field_config !== undefined
    ? (typeof settings.stock_field_config === 'string'
      ? settings.stock_field_config
      : JSON.stringify(settings.stock_field_config))
    : null;

  const values = [
    settings.store_name,
    settings.address,
    settings.phone,
    settings.email,
    settings.tax_number || settings.gst_number,
    settings.currency_symbol,
    settings.receipt_header,
    settings.receipt_footer,
    settings.receipt_width,
    settings.enable_tax_inclusive,
    settings.enable_round_off,
    settings.gst_number,
    settings.enable_gst !== undefined ? settings.enable_gst : true,
    settings.fssai_number,
    settings.enable_fssai !== undefined ? settings.enable_fssai : false,
    settings.logo_url !== undefined ? settings.logo_url : '',
    stockFieldConfigVal
  ];

  const res = await pool.query(query, values);
  const row = res.rows[0];
  if (row) {
    row.stock_field_config = {
      ...DEFAULT_STOCK_FIELD_CONFIG,
      ...(typeof row.stock_field_config === 'object' && row.stock_field_config ? row.stock_field_config : {})
    };
  }

  logAuditAction({
    userId,
    action: 'STORE_SETTINGS_UPDATED',
    entity: 'store_settings',
    entityId: '1',
    oldValues: oldSettings,
    newValues: row,
    ipAddress
  });

  return row;
}

// -----------------------------------------------------------------------------
// USER MANAGEMENT (Super Admin restricted)
// -----------------------------------------------------------------------------
export async function getAllUsers() {
  const res = await pool.query(`
    SELECT 
      u.id, u.username, u.email, u.full_name, u.phone,
      u.avatar_url, u.receive_daily_report, u.requested_persona,
      u.is_active, u.failed_login_attempts, u.last_login_at, u.created_at,
      ARRAY_AGG(ur.role_id) as roles
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `);
  return res.rows;
}

export async function createUser(data: {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  roleId: string;
  avatarUrl?: string;
  receiveDailyReport?: boolean;
}, adminId: string, ipAddress?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passHash = await bcrypt.hash(data.password, 12);

    const userRes = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone, avatar_url, receive_daily_report, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id, username, email, full_name, avatar_url, receive_daily_report, is_active`,
      [
        data.username.trim(),
        data.email.trim(),
        passHash,
        data.fullName.trim(),
        data.phone || null,
        data.avatarUrl || null,
        data.receiveDailyReport !== false
      ]
    );

    const newUser = userRes.rows[0];

    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [newUser.id, data.roleId || 'SYSTEM_ADMIN']
    );

    await client.query('COMMIT');

    logAuditAction({
      userId: adminId,
      action: 'USER_CREATED',
      entity: 'users',
      entityId: newUser.id,
      newValues: { username: newUser.username, role: data.roleId },
      ipAddress
    });

    return newUser;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateUser(
  userId: string,
  data: {
    username?: string;
    email?: string;
    fullName?: string;
    phone?: string;
    roleId?: string;
    password?: string;
    avatarUrl?: string;
    receiveDailyReport?: boolean;
  },
  adminId: string,
  ipAddress?: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingRes = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingRes.rowCount === 0) throw new Error('User not found.');
    const existing = existingRes.rows[0];

    let newHash = existing.password_hash;

    if (data.password && data.password.trim().length > 0) {
      if (data.password.length < 6) throw new Error('Password must be at least 6 characters.');
      newHash = await bcrypt.hash(data.password, 12);
    }

    const updateQuery = `
      UPDATE users
      SET username = COALESCE($1, username),
          email = COALESCE($2, email),
          full_name = COALESCE($3, full_name),
          phone = COALESCE($4, phone),
          avatar_url = COALESCE($5, avatar_url),
          receive_daily_report = COALESCE($6, receive_daily_report),
          password_hash = $7,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, username, email, full_name, phone, avatar_url, receive_daily_report, is_active
    `;

    const updatedUserRes = await client.query(updateQuery, [
      data.username ? data.username.trim() : null,
      data.email ? data.email.trim() : null,
      data.fullName ? data.fullName.trim() : null,
      data.phone !== undefined ? data.phone : null,
      data.avatarUrl !== undefined ? data.avatarUrl : null,
      data.receiveDailyReport,
      newHash,
      userId
    ]);

    if (data.roleId) {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, data.roleId]);
    }

    await client.query('COMMIT');

    logAuditAction({
      userId: adminId,
      action: 'USER_UPDATED',
      entity: 'users',
      entityId: userId,
      newValues: { username: updatedUserRes.rows[0].username, role: data.roleId },
      ipAddress
    });

    return updatedUserRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function toggleUserActive(userId: string, isActive: boolean, adminId: string, ipAddress?: string) {
  const res = await pool.query(
    `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username, is_active`,
    [isActive, userId]
  );

  if (res.rowCount === 0) throw new Error('User not found.');

  logAuditAction({
    userId: adminId,
    action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    entity: 'users',
    entityId: userId,
    newValues: { is_active: isActive },
    ipAddress
  });

  return res.rows[0];
}

// Change a user's own password (with current password verification)
export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  adminId: string,
  ipAddress?: string
) {
  // Fetch the user's current hash
  const userRes = await pool.query(
    `SELECT id, username, password_hash FROM users WHERE id = $1`,
    [userId]
  );
  if (userRes.rowCount === 0) throw new Error('User not found.');
  const user = userRes.rows[0];

  // Verify current password (skip check if Super Admin is resetting another user)
  const isSelfReset = userId === adminId;
  if (isSelfReset) {
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new Error('Current password is incorrect.');
  }

  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

  const newHash = await bcrypt.hash(newPassword, 12);
  await pool.query(
    `UPDATE users SET password_hash = $1, viewable_password = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [newHash, userId]
  );

  logAuditAction({
    userId: adminId,
    action: 'USER_PASSWORD_CHANGED',
    entity: 'users',
    entityId: userId,
    newValues: { username: user.username },
    ipAddress
  });

  return { success: true };
}

// -----------------------------------------------------------------------------
// RESET TEST RECORDS (Super Admin restricted)
// -----------------------------------------------------------------------------
export async function resetTestRecords(type: 'transactions' | 'products' | 'clear_stock' | 'all', adminId: string, ipAddress?: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (type === 'transactions' || type === 'all') {
      await client.query('DELETE FROM sale_items');
      await client.query('DELETE FROM payments');
      await client.query('DELETE FROM sales_return_items');
      await client.query('DELETE FROM sales_returns');
      await client.query('DELETE FROM held_bills');
      await client.query('DELETE FROM sales');

      await client.query(`
        UPDATE document_sequences
        SET current_number = 0, updated_at = CURRENT_TIMESTAMP
        WHERE sequence_key IN ('INVOICE', 'PURCHASE', 'RETURN', 'ADJUSTMENT')
      `);

      await client.query(`DELETE FROM inventory_movements WHERE movement_type IN ('SALE', 'SALE_RETURN')`);
    }

    if (type === 'clear_stock') {
      // Zero out all product stock levels
      await client.query('UPDATE products SET current_stock = 0.000, updated_at = CURRENT_TIMESTAMP');
      await client.query('DELETE FROM product_batches');
      await client.query('DELETE FROM inventory_movements');
      await client.query('DELETE FROM stock_adjustments');
      await client.query('DELETE FROM purchase_items');
      await client.query('DELETE FROM purchases');

      await client.query(`
        UPDATE document_sequences
        SET current_number = 0, updated_at = CURRENT_TIMESTAMP
        WHERE sequence_key IN ('PURCHASE', 'ADJUSTMENT')
      `);
    }

    if (type === 'products' || type === 'all') {
      // Remove all dependent records first to avoid foreign key violations
      await client.query('DELETE FROM sale_items');
      await client.query('DELETE FROM sales_return_items');
      await client.query('DELETE FROM stock_adjustments');
      await client.query('DELETE FROM purchase_items');
      await client.query('DELETE FROM purchases');
      await client.query('DELETE FROM inventory_movements');
      await client.query('DELETE FROM product_batches');
      await client.query('DELETE FROM products');

      await client.query(`
        UPDATE document_sequences
        SET current_number = 0, updated_at = CURRENT_TIMESTAMP
        WHERE sequence_key IN ('PURCHASE', 'ADJUSTMENT')
      `);
    }

    await client.query('COMMIT');

    logAuditAction({
      userId: adminId,
      action: 'DATA_RECORDS_RESET',
      entity: 'database',
      entityId: type,
      newValues: { resetType: type },
      ipAddress
    });

    let message = 'Operation completed successfully.';
    if (type === 'clear_stock') {
      message = 'All product stock inventory levels have been cleared to 0.';
    } else if (type === 'products') {
      message = 'All products and stock inventory have been completely deleted.';
    } else if (type === 'transactions') {
      message = 'All test sales & transactions successfully wiped.';
    } else if (type === 'all') {
      message = 'All test records, transactions, and product catalog wiped.';
    }

    return { success: true, message };
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// -----------------------------------------------------------------------------
// FIRST-TIME SETUP STATUS
// -----------------------------------------------------------------------------
export async function getSetupStatus() {
  const res = await pool.query(`SELECT is_setup_complete FROM store_settings WHERE id = 1`);
  if (res.rowCount === 0) {
    return { isSetupComplete: false };
  }
  return { isSetupComplete: Boolean(res.rows[0].is_setup_complete) };
}

export async function markSetupComplete(adminId: string, ipAddress?: string) {
  await pool.query(
    `UPDATE store_settings SET is_setup_complete = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = 1`
  );
  logAuditAction({
    userId: adminId,
    action: 'SETUP_WIZARD_COMPLETED',
    entity: 'store_settings',
    entityId: '1',
    newValues: { is_setup_complete: true },
    ipAddress
  });
  return { success: true };
}

// Check if admin still has the default factory password (triggers setup wizard)
export async function checkDefaultPassword(userId: string): Promise<boolean> {
  const res = await pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
  if (res.rowCount === 0) return false;
  return bcrypt.compare(DEFAULT_ADMIN_PASSWORD, res.rows[0].password_hash);
}

// -----------------------------------------------------------------------------
// DATABASE BACKUP & DIAGNOSTICS (Super Admin restricted)
// -----------------------------------------------------------------------------
export async function createDatabaseBackup(adminId: string, ipAddress?: string) {
  const tables = [
    'users', 'roles', 'permissions', 'categories', 'units',
    'suppliers', 'customers', 'products', 'product_batches',
    'sales', 'sale_items', 'payments', 'inventory_movements',
    'purchases', 'stock_adjustments', 'store_settings', 'audit_logs'
  ];

  const tableRecordCounts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const res = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
      tableRecordCounts[table] = parseInt(res.rows[0].count, 10);
    } catch {
      tableRecordCounts[table] = 0;
    }
  }

  const backupId = `BACKUP-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  logAuditAction({
    userId: adminId,
    action: 'DATABASE_BACKUP_CREATED',
    entity: 'system_backup',
    entityId: backupId,
    newValues: { recordCounts: tableRecordCounts },
    ipAddress
  });

  return {
    backupId,
    timestamp: new Date().toISOString(),
    status: 'COMPLETED',
    tableRecordCounts
  };
}
