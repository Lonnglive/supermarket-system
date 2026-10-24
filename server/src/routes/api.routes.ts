import { Router, Request, Response } from 'express';
import { authenticate, requirePermission } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import * as billingService from '../services/billing.service.js';
import * as inventoryService from '../services/inventory.service.js';
import * as productService from '../services/product.service.js';
import * as reportService from '../services/report.service.js';
import * as emailService from '../services/email.service.js';
import * as settingsService from '../services/settings.service.js';
import { getAuditLogs } from '../services/audit.service.js';
import { restartDailyReportScheduler } from '../services/scheduler.service.js';

const router = Router();

// -----------------------------------------------------------------------------
// FIRST-TIME SETUP WIZARD ENDPOINTS
// -----------------------------------------------------------------------------
router.get('/setup/status', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const status = await settingsService.getSetupStatus();
    // Also check if admin is using the default factory password
    const hasDefaultPass = await settingsService.checkDefaultPassword(req.user!.id);
    res.json({ ...status, hasDefaultPassword: hasDefaultPass });
  } catch (err: any) {
    res.json({ isSetupComplete: false, hasDefaultPassword: false });
  }
});

router.post('/setup/complete', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await settingsService.markSetupComplete(req.user!.id, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to complete setup', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------------------------------
router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password) {
      res.status(400).json({ error: 'Validation Error', message: 'Username/Email and Password are required.' });
      return;
    }
    const result = await authService.loginUser({
      usernameOrEmail,
      password,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: 'Authentication Failed', message: err.message });
  }
});

router.post('/auth/otp/send', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, channel, phone } = req.body;
    if (!(identifier || phone)) {
      res.status(400).json({ error: 'Validation Error', message: 'Mobile number or Gmail address is required.' });
      return;
    }
    const result = await authService.sendLoginOtp(identifier || phone, channel);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to send OTP', message: err.message });
  }
});

router.post('/auth/otp/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, channel, phone, otp } = req.body;
    if (!(identifier || phone) || !otp) {
      res.status(400).json({ error: 'Validation Error', message: 'Mobile number or Gmail address and OTP are required.' });
      return;
    }
    const result = await authService.verifyLoginOtp({
      identifier: identifier || phone,
      channel,
      otp,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: 'Authentication Failed', message: err.message });
  }
});

router.post('/auth/register/request-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifier, channel } = req.body;
    if (!identifier) {
      res.status(400).json({ error: 'Validation Error', message: 'Mobile number or Gmail address is required.' });
      return;
    }
    res.json(await authService.requestRegistrationOtp({ identifier, channel }));
  } catch (err: any) {
    res.status(400).json({ error: 'Registration OTP failed', message: err.message });
  }
});

router.post('/auth/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await authService.registerUser({ ...req.body, ipAddress: req.ip, userAgent: req.headers['user-agent'] });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Registration failed', message: err.message });
  }
});

router.get('/auth/me', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await authService.getCurrentUser(req.user!.id);
    res.json({ user });
  } catch (err: any) {
    res.status(500).json({ error: 'Error', message: err.message });
  }
});

router.post('/auth/logout', authenticate, (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});

// -----------------------------------------------------------------------------
// BILLING / POS
// -----------------------------------------------------------------------------
router.get('/billing/products', authenticate, requirePermission('billing.view'), async (req: Request, res: Response) => {
  try {
    const { query, barcode, categoryId, limit } = req.query;
    const products = await billingService.searchProductsForPOS({
      query: query as string,
      barcode: barcode as string,
      categoryId: categoryId as string,
      limit: limit ? parseInt(limit as string, 10) : 30
    });
    res.json({ products });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to search products', message: err.message });
  }
});

router.post('/billing/sales', authenticate, requirePermission('billing.create'), async (req: Request, res: Response) => {
  try {
    const saleResult = await billingService.createSaleTransaction(
      req.body,
      req.user!.id,
      req.ip
    );
    res.status(201).json(saleResult);
  } catch (err: any) {
    res.status(400).json({ error: 'Sale Transaction Failed', message: err.message });
  }
});

router.get('/billing/bills', authenticate, requirePermission('billing.view'), async (req: Request, res: Response) => {
  try {
    const { limit, cashierId } = req.query;
    const bills = await billingService.getRecentBills({
      limit: limit ? parseInt(limit as string, 10) : 20,
      cashierId: cashierId as string
    });
    res.json({ bills });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch bills', message: err.message });
  }
});

router.get('/billing/bills/:invoiceNumber', authenticate, requirePermission('billing.view'), async (req: Request, res: Response) => {
  try {
    const saleResult = await billingService.getSaleByInvoiceNumber(req.params.invoiceNumber);
    res.json(saleResult);
  } catch (err: any) {
    res.status(404).json({ error: 'Invoice Not Found', message: err.message });
  }
});

router.post('/billing/held-bills', authenticate, requirePermission('billing.view'), async (req: Request, res: Response) => {
  try {
    const result = await billingService.holdActiveBill({
      ...req.body,
      cashierId: req.user!.id
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to hold bill', message: err.message });
  }
});

router.get('/billing/held-bills', authenticate, requirePermission('billing.view'), async (req: Request, res: Response) => {
  try {
    const heldBills = await billingService.getHeldBills();
    res.json({ heldBills });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch held bills', message: err.message });
  }
});

router.delete('/billing/held-bills/:id', authenticate, requirePermission('billing.view'), async (req: Request, res: Response) => {
  try {
    const result = await billingService.deleteHeldBill(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete held bill', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// STOCK & INVENTORY
// -----------------------------------------------------------------------------
router.get('/inventory/dashboard', authenticate, requirePermission('stock.view'), async (_req: Request, res: Response) => {
  try {
    const dashboard = await inventoryService.getStockDashboard();
    res.json(dashboard);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load stock dashboard', message: err.message });
  }
});

router.get('/inventory/movements', authenticate, requirePermission('stock.view'), async (req: Request, res: Response) => {
  try {
    const { productId, movementType, startDate, endDate, page, limit } = req.query;
    const ledger = await inventoryService.getMovementsLedger({
      productId: productId as string,
      movementType: movementType as string,
      startDate: startDate as string,
      endDate: endDate as string,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 50
    });
    res.json(ledger);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load movements ledger', message: err.message });
  }
});

router.post('/inventory/adjustments', authenticate, requirePermission('stock.adjust'), async (req: Request, res: Response) => {
  try {
    const result = await inventoryService.createStockAdjustment({
      ...req.body,
      userId: req.user!.id,
      ipAddress: req.ip
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Stock Adjustment Failed', message: err.message });
  }
});

router.post('/inventory/purchases', authenticate, requirePermission('stock.purchase'), async (req: Request, res: Response) => {
  try {
    const result = await inventoryService.createPurchaseOrder({
      ...req.body,
      userId: req.user!.id,
      ipAddress: req.ip
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Purchase Order Failed', message: err.message });
  }
});

router.get('/inventory/low-stock', authenticate, requirePermission('stock.view'), async (_req: Request, res: Response) => {
  try {
    const lowStock = await inventoryService.getLowStockReport();
    res.json({ lowStock });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load low stock report', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// PRODUCTS & TAXONOMY
// -----------------------------------------------------------------------------
router.get('/products', authenticate, requirePermission('products.view'), async (req: Request, res: Response) => {
  try {
    const { search, categoryId, supplierId, stockStatus, limit, offset } = req.query;
    const result = await productService.getAllProducts({
      search: search as string,
      categoryId: categoryId as string,
      supplierId: supplierId as string,
      stockStatus: stockStatus as any,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch products', message: err.message });
  }
});

router.post('/products', authenticate, requirePermission('products.create'), async (req: Request, res: Response) => {
  try {
    const product = await productService.createProduct(req.body, req.user!.id, req.ip);
    res.status(201).json(product);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to create product', message: err.message });
  }
});

router.put('/products/:id', authenticate, requirePermission('products.edit'), async (req: Request, res: Response) => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body, req.user!.id, req.ip);
    res.json(product);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update product', message: err.message });
  }
});

router.delete('/products/:id', authenticate, requirePermission('products.delete'), async (req: Request, res: Response) => {
  try {
    const result = await productService.deleteProduct(req.params.id, req.user!.id, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to deactivate product', message: err.message });
  }
});

router.get('/categories', authenticate, async (_req: Request, res: Response) => {
  try {
    const categories = await productService.getCategories();
    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch categories', message: err.message });
  }
});

router.post('/categories', authenticate, requirePermission('settings.edit'), async (req: Request, res: Response) => {
  try {
    const category = await productService.createCategory(req.body, req.user!.id, req.ip);
    res.status(201).json({ category });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to create category', message: err.message });
  }
});

router.put('/categories/reorder', authenticate, requirePermission('settings.edit'), async (req: Request, res: Response) => {
  try {
    await productService.reorderCategories(req.body.categoryIds, req.user!.id, req.ip);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to reorder categories', message: err.message });
  }
});

router.put('/categories/:id', authenticate, requirePermission('settings.edit'), async (req: Request, res: Response) => {
  try {
    const category = await productService.updateCategory(req.params.id, req.body, req.user!.id, req.ip);
    res.json({ category });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update category', message: err.message });
  }
});

router.delete('/categories/:id', authenticate, requirePermission('settings.edit'), async (req: Request, res: Response) => {
  try {
    const result = await productService.deleteCategory(req.params.id, req.user!.id, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to delete category', message: err.message });
  }
});

router.get('/units', authenticate, async (_req: Request, res: Response) => {
  try {
    const units = await productService.getUnits();
    res.json({ units });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch units', message: err.message });
  }
});

router.get('/suppliers', authenticate, requirePermission('suppliers.view'), async (_req: Request, res: Response) => {
  try {
    const suppliers = await productService.getSuppliers();
    res.json({ suppliers });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch suppliers', message: err.message });
  }
});

router.post('/suppliers', authenticate, requirePermission('suppliers.manage'), async (req: Request, res: Response) => {
  try {
    const supplier = await productService.createSupplier(req.body, req.user!.id);
    res.status(201).json(supplier);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to create supplier', message: err.message });
  }
});

router.get('/customers', authenticate, requirePermission('customers.view'), async (req: Request, res: Response) => {
  try {
    const customers = await productService.getCustomers(req.query.search as string);
    res.json({ customers });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch customers', message: err.message });
  }
});

router.post('/customers', authenticate, requirePermission('customers.manage'), async (req: Request, res: Response) => {
  try {
    const customer = await productService.createCustomer(req.body);
    res.status(201).json(customer);
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to create customer', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// REPORTS
// -----------------------------------------------------------------------------
router.get('/reports/daily', authenticate, requirePermission('reports.view'), async (req: Request, res: Response) => {
  try {
    const summary = await reportService.getDailySalesSummary(req.query.date as string);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load daily report', message: err.message });
  }
});

router.get('/reports/sold-items', authenticate, requirePermission('reports.view'), async (req: Request, res: Response) => {
  try {
    const result = await reportService.getSoldItemsReport({
      date: req.query.date as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      search: req.query.search as string,
      categoryId: req.query.categoryId as string
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load sold items report', message: err.message });
  }
});

router.get('/reports/daily-records', authenticate, requirePermission('reports.view'), async (req: Request, res: Response) => {
  try {
    const result = await reportService.getDailySalesRecords({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load daily sales records', message: err.message });
  }
});

router.get('/reports/sales', authenticate, requirePermission('reports.view'), async (req: Request, res: Response) => {
  try {
    const sales = await reportService.getSalesReport({
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      cashierId: req.query.cashierId as string,
      paymentMethod: req.query.paymentMethod as string
    });
    res.json({ sales });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load sales report', message: err.message });
  }
});

router.get('/reports/hourly', authenticate, requirePermission('reports.view'), async (req: Request, res: Response) => {
  try {
    const hourly = await reportService.getHourlySalesBreakdown(req.query.date as string);
    res.json({ hourly });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to load hourly breakdown', message: err.message });
  }
});

// -----------------------------------------------------------------------------
// SETTINGS & SYSTEM CONFIGURATION
// -----------------------------------------------------------------------------
router.get('/settings/store', authenticate, async (_req: Request, res: Response) => {
  try {
    const store = await settingsService.getStoreSettings();
    res.json({ store });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch store settings', message: err.message });
  }
});

router.put('/settings/store', authenticate, requirePermission('settings.edit'), async (req: Request, res: Response) => {
  try {
    const store = await settingsService.updateStoreSettings(req.body, req.user!.id, req.ip);
    res.json({ store });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update store settings', message: err.message });
  }
});

router.get('/settings/email', authenticate, requirePermission('email.manage'), async (_req: Request, res: Response) => {
  try {
    const emailSettings = await emailService.getEmailSettings();
    // Sanitize: Do not send raw SMTP password to client!
    const sanitized = {
      ...emailSettings,
      smtp_password: emailSettings.smtp_password ? '••••••••' : ''
    };
    res.json({ emailSettings: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch email settings', message: err.message });
  }
});

router.put('/settings/email', authenticate, requirePermission('email.manage'), async (req: Request, res: Response) => {
  try {
    const updated = await emailService.updateEmailSettings(req.body);
    restartDailyReportScheduler();
    res.json({ emailSettings: updated });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update email settings', message: err.message });
  }
});

router.post('/settings/email/test', authenticate, requirePermission('email.manage'), async (req: Request, res: Response) => {
  try {
    const { recipientEmail } = req.body;
    if (!recipientEmail) {
      res.status(400).json({ error: 'Recipient email is required' });
      return;
    }
    const result = await emailService.sendTestEmail(recipientEmail);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Test Email Failed', message: err.message });
  }
});

router.post('/settings/email/send-daily-report', authenticate, requirePermission('email.manage'), async (req: Request, res: Response) => {
  try {
    const { reportDate, recipientEmail } = req.body;
    const result = await emailService.sendDailySalesReport(reportDate, recipientEmail);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Daily Report Dispatch Failed', message: err.message });
  }
});

router.get('/settings/users', authenticate, requirePermission('users.view'), async (_req: Request, res: Response) => {
  try {
    const users = await settingsService.getAllUsers();
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch users', message: err.message });
  }
});

router.post('/settings/users', authenticate, requirePermission('users.create'), async (req: Request, res: Response) => {
  try {
    const user = await settingsService.createUser(req.body, req.user!.id, req.ip);
    res.status(201).json({ user });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to create user', message: err.message });
  }
});

router.put('/settings/users/:id', authenticate, requirePermission('users.edit'), async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await settingsService.updateUser(req.params.id, req.body, req.user!.id, req.ip);
    res.json({ user });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update user', message: err.message });
  }
});

router.patch('/settings/users/:id/active', authenticate, requirePermission('users.edit'), async (req: Request, res: Response) => {
  try {
    const user = await settingsService.toggleUserActive(req.params.id, req.body.isActive, req.user!.id, req.ip);
    res.json({ user });
  } catch (err: any) {
    res.status(400).json({ error: 'Failed to update user status', message: err.message });
  }
});

router.post('/settings/reset-records', authenticate, requirePermission('backup.manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const type = req.body.type || 'transactions';
    const result = await settingsService.resetTestRecords(type, req.user!.id, req.ip);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Reset Failed', message: err.message });
  }
});

// Change user password (self or admin resetting another)
router.patch('/settings/users/:id/password', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
      res.status(400).json({ error: 'Validation Error', message: 'New password is required.' });
      return;
    }
    // Only Super Admin can reset others; regular users can only change their own
    const isSuperAdmin = req.user!.roles?.includes('SUPER_ADMIN') || false;
    if (req.params.id !== req.user!.id && !isSuperAdmin) {
      res.status(403).json({ error: 'Forbidden', message: 'You can only change your own password.' });
      return;
    }
    const result = await settingsService.changeUserPassword(
      req.params.id,
      currentPassword || '',
      newPassword,
      req.user!.id,
      req.ip
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Password Change Failed', message: err.message });
  }
});

router.post('/settings/backup', authenticate, requirePermission('backup.manage'), async (req: Request, res: Response) => {
  try {
    const backup = await settingsService.createDatabaseBackup(req.user!.id, req.ip);
    res.json(backup);
  } catch (err: any) {
    res.status(500).json({ error: 'Backup failed', message: err.message });
  }
});

router.get('/settings/audit', authenticate, requirePermission('audit.view'), async (req: Request, res: Response) => {
  try {
    const { limit, offset, entity, action } = req.query;
    const logs = await getAuditLogs({
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
      entity: entity as string,
      action: action as string
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch audit logs', message: err.message });
  }
});

export default router;
