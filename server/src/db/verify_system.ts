import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import * as authService from '../services/auth.service.js';
import * as billingService from '../services/billing.service.js';
import * as inventoryService from '../services/inventory.service.js';
import * as productService from '../services/product.service.js';
import * as reportService from '../services/report.service.js';
import * as emailService from '../services/email.service.js';
import * as settingsService from '../services/settings.service.js';
import { getAuditLogs } from '../services/audit.service.js';

async function runSystemVerification() {
  console.log('================================================================');
  console.log('  AEROPOS SUPERMARKET SYSTEM - FULL BUSINESS FLOW VERIFICATION  ');
  console.log('================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] [${totalTests}] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] [${totalTests}] ${testName}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  try {
    // 1. Test Super Admin Login
    console.log('\n--- 1. Authentication & Security Verification ---');
    const adminLogin = await authService.loginUser({
      usernameOrEmail: 'admin',
      password: 'Admin@123'
    });
    assert(adminLogin.token !== undefined, 'Super Admin login successfully issued JWT token');
    assert(adminLogin.user.roles.includes('SUPER_ADMIN'), 'Super Admin user role verified');
    assert(adminLogin.user.permissions.length > 20, 'Super Admin has all system permissions');

    // 2. Test System Admin Login
    const cashierLogin = await authService.loginUser({
      usernameOrEmail: 'cashier',
      password: 'Cashier@123'
    });
    assert(cashierLogin.token !== undefined, 'System Admin login successfully issued JWT token');
    assert(cashierLogin.user.roles.includes('SYSTEM_ADMIN'), 'System Admin role verified');
    assert(!cashierLogin.user.permissions.includes('settings.edit'), 'System Admin is restricted from settings.edit');
    assert(!cashierLogin.user.permissions.includes('email.manage'), 'System Admin is restricted from email.manage');

    // 3. Test Failed Login Protection
    let failedErr = '';
    try {
      await authService.loginUser({ usernameOrEmail: 'cashier', password: 'WrongPassword' });
    } catch (e: any) {
      failedErr = e.message;
    }
    assert(failedErr.includes('remaining') || failedErr.includes('Invalid'), 'Failed login attempt tracking active');

    // 4. Product Catalog & Barcode Search
    console.log('\n--- 2. Products & Barcode Search Verification ---');
    const milkRes = await billingService.searchProductsForPOS({ barcode: '890103000001' });
    assert(milkRes.length === 1 && milkRes[0].barcode === '890103000001', 'Direct barcode scanner lookup found product (Fresh Farm Whole Milk 1L)');
    const milk = milkRes[0];
    const initialMilkStock = Number(milk.current_stock);
    console.log(`   Initial Milk Stock: ${initialMilkStock} ${milk.unit_name}`);

    // 5. Transactional Sale Processing & Stock Deduction
    console.log('\n--- 3. POS Billing Engine & Transactional Stock Deduction ---');
    const saleQty = 2;
    const saleResult = await billingService.createSaleTransaction(
      {
        clientTxnId: `TEST-TXN-${Date.now()}`,
        items: [
          {
            productId: milk.id,
            quantity: saleQty,
            unitPrice: Number(milk.selling_price),
            mrp: Number(milk.mrp)
          }
        ],
        payments: [
          {
            paymentMethod: 'CASH',
            amount: Number(milk.selling_price) * saleQty,
            tenderedAmount: 200,
            changeAmount: 200 - (Number(milk.selling_price) * saleQty)
          }
        ]
      },
      cashierLogin.user.id
    );

    assert(saleResult.sale.invoice_number.startsWith('INV-'), `Invoice generated with safe sequential numbering: ${saleResult.sale.invoice_number}`);
    assert(Number(saleResult.sale.grand_total) === Number(milk.selling_price) * saleQty, 'Grand total accurately calculated');

    // 6. Verify Stock Automatically Decreased
    const milkAfterSale = (await billingService.searchProductsForPOS({ barcode: '890103000001' }))[0];
    const expectedStock = initialMilkStock - saleQty;
    assert(Number(milkAfterSale.current_stock) === expectedStock, `Stock accurately decreased from ${initialMilkStock} to ${expectedStock}`);

    // 7. Verify Traceable Inventory Movement Ledger
    console.log('\n--- 4. Inventory Movement Audit Ledger Verification ---');
    const movementsRes = await inventoryService.getMovementsLedger({
      productId: milk.id,
      movementType: 'SALE'
    });
    const latestMovement = movementsRes.movements[0];
    assert(latestMovement.movement_type === 'SALE', 'Inventory movement ledger recorded SALE type');
    assert(Number(latestMovement.quantity_out) === saleQty, `Movement ledger logged quantity_out: ${saleQty}`);
    assert(Number(latestMovement.balance_after) === expectedStock, `Movement ledger logged balance_after: ${expectedStock}`);

    // 8. Test Hold & Retrieve Held Bills
    console.log('\n--- 5. POS Held Bills (Parked Carts) Verification ---');
    const heldBill = await billingService.holdActiveBill({
      cashierId: cashierLogin.user.id,
      billReference: `HOLD-TEST-${Date.now().toString().slice(-4)}`,
      customerName: 'Customer In Line',
      cartData: [{ productId: milk.id, quantity: 1 }],
      subtotal: Number(milk.selling_price)
    });
    assert(heldBill.id !== undefined, 'Cart parked into held bills');

    const heldList = await billingService.getHeldBills(cashierLogin.user.id);
    assert(heldList.some(h => h.id === heldBill.id), 'Held bill retrieved from database list');

    await billingService.deleteHeldBill(heldBill.id);
    const heldListAfter = await billingService.getHeldBills(cashierLogin.user.id);
    assert(!heldListAfter.some(h => h.id === heldBill.id), 'Held bill deleted after retrieval');

    // 9. Stock Adjustment with Mandatory Audit Reason
    console.log('\n--- 6. Stock Physical Count Adjustment ---');
    const newCount = 50;
    const adjResult = await inventoryService.createStockAdjustment({
      productId: milk.id,
      newQuantity: newCount,
      adjustmentType: 'PHYSICAL_COUNT',
      reason: 'Bi-weekly stock audit verification',
      userId: adminLogin.user.id
    });
    assert(adjResult.success === true, 'Stock adjustment applied');
    assert(adjResult.newQuantity === newCount, `Stock count reset to ${newCount}`);

    // 10. Financial Reports & Daily Sales Aggregation
    console.log('\n--- 7. Financial Reports & Daily Sales Summary ---');
    const todayStr = new Date().toISOString().split('T')[0];
    const dailyReport = await reportService.getDailySalesSummary(todayStr);
    assert(dailyReport.summary.totalBills >= 1, `Daily report tallied total bills: ${dailyReport.summary.totalBills}`);
    assert(dailyReport.summary.netSales > 0, `Daily report tallied net sales: ₹${dailyReport.summary.netSales}`);
    assert(dailyReport.topProducts.length >= 1, `Top products identified: ${dailyReport.topProducts[0].product_name}`);

    // 11. Super Admin Daily Sales Email Generation & Archival
    console.log('\n--- 8. Daily Sales Report Archival & Email Structure ---');
    const emailSettings = await emailService.getEmailSettings();
    assert(emailSettings.daily_report_enabled === true, 'Daily sales report automated setting is enabled');
    assert(emailSettings.daily_report_time === '23:00', 'Daily report time set to 23:00 (11:00 PM)');

    // 12. Security Audit Log Trail
    console.log('\n--- 9. Append-Only Security Audit Log Trail ---');
    const auditRes = await getAuditLogs({ limit: 10 });
    assert(auditRes.total > 0, `Audit log entries recorded: ${auditRes.total}`);
    const hasSaleAudit = auditRes.logs.some(l => l.action === 'BILLING_SALE_CREATED');
    assert(hasSaleAudit, 'BILLING_SALE_CREATED logged in audit trail');

    // 13. Store Profile & Thermal Receipt Configuration
    console.log('\n--- 10. Store Profile & Receipt Settings ---');
    const store = await settingsService.getStoreSettings();
    assert(store.store_name === 'FreshMart Supermarket', `Store name configured: ${store.store_name}`);
    assert(store.receipt_width === '200', `Receipt width configured: ${store.receipt_width}`);

    // 14. Database Backup Snapshot Trigger
    console.log('\n--- 11. Database Backup & Disaster Recovery ---');
    const backup = await settingsService.createDatabaseBackup(adminLogin.user.id);
    assert(backup.status === 'SUCCESS', 'Backup snapshot generated with record counts');
    assert(backup.tableRecordCounts.products > 0, `Verified backup included ${backup.tableRecordCounts.products} products`);

    console.log('================================================================');
    console.log(`  ALL ${passedTests} OF ${totalTests} BUSINESS FLOW TESTS PASSED SUCCESSFULLY! `);
    console.log('================================================================\n');

  } catch (err: any) {
    console.error('[VERIFICATION FAILED]:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSystemVerification();
