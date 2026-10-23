import { pool } from '../config/db.js';

export async function clearTestRecords(options: { clearTransactions?: boolean; clearProducts?: boolean } = { clearTransactions: true }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (options.clearTransactions) {
      console.log('[CLEAN] Wiping test transactions and held bills...');
      await client.query('DELETE FROM sale_items');
      await client.query('DELETE FROM payments');
      await client.query('DELETE FROM sales_return_items');
      await client.query('DELETE FROM sales_returns');
      await client.query('DELETE FROM held_bills');
      await client.query('DELETE FROM sales');

      // Reset invoice sequences
      console.log('[CLEAN] Resetting document sequences back to 0...');
      await client.query(`
        UPDATE document_sequences
        SET current_number = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE sequence_key IN ('INVOICE', 'PURCHASE', 'RETURN', 'ADJUSTMENT')
      `);

      // Clear test inventory movements that are sales/returns
      await client.query(`
        DELETE FROM inventory_movements
        WHERE movement_type IN ('SALE', 'SALE_RETURN', 'ADJUSTMENT')
      `);

      // Reset current_stock to opening balances or preserve stock
      console.log('[CLEAN] Transactions wiped successfully.');
    }

    if (options.clearProducts) {
      console.log('[CLEAN] Wiping pre-inserted products & movements...');
      await client.query('DELETE FROM inventory_movements');
      await client.query('DELETE FROM product_batches');
      await client.query('DELETE FROM products');
      console.log('[CLEAN] Products wiped successfully.');
    }

    await client.query('COMMIT');
    return { success: true, message: 'Records cleared successfully.' };
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[CLEAN ERROR]', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Standalone execution helper
export default clearTestRecords;
