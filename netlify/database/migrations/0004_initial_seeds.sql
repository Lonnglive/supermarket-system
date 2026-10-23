-- ==============================================================================
-- 001_initial_seeds.sql
-- Master Seed Data for Supermarket POS & Inventory
-- ==============================================================================

-- 1. ROLES
INSERT INTO roles (id, name, description) VALUES
('SUPER_ADMIN', 'Super Administrator', 'Unrestricted administrative access to all POS, Inventory, Financials, and System Settings'),
('SYSTEM_ADMIN', 'System Administrator / Cashier', 'Point of Sale billing, customer lookups, product price checks, and inventory status visibility')
ON CONFLICT (id) DO NOTHING;

-- 2. PERMISSIONS
INSERT INTO permissions (id, module, description) VALUES
('billing.view', 'billing', 'View billing module and active bills'),
('billing.create', 'billing', 'Create new bills and process sales transactions'),
('billing.edit', 'billing', 'Modify items in cart before checkout'),
('billing.cancel', 'billing', 'Cancel or void an ongoing bill'),
('billing.discount', 'billing', 'Apply special discounts or manual price overrides'),
('billing.refund', 'billing', 'Process customer returns and cash/credit refunds'),
('stock.view', 'stock', 'View inventory dashboard and stock balances'),
('stock.create', 'stock', 'Add new stock and inventory lots'),
('stock.edit', 'stock', 'Update existing stock records'),
('stock.adjust', 'stock', 'Perform physical count adjustments, damaged, or expired write-offs'),
('stock.purchase', 'stock', 'Record supplier purchases and goods receipt'),
('products.view', 'products', 'View product catalog, pricing, and barcodes'),
('products.create', 'products', 'Add new products and barcodes'),
('products.edit', 'products', 'Edit product details and tax rates'),
('products.delete', 'products', 'Deactivate or delete products'),
('customers.view', 'customers', 'Search and view customer records'),
('customers.manage', 'customers', 'Create and edit customer records'),
('suppliers.view', 'suppliers', 'View supplier contacts and purchase orders'),
('suppliers.manage', 'suppliers', 'Create and edit supplier profiles'),
('users.view', 'users', 'View staff and user accounts'),
('users.create', 'users', 'Create new staff user accounts'),
('users.edit', 'users', 'Edit staff accounts and assign roles'),
('roles.manage', 'roles', 'Configure roles and assign granular permissions'),
('reports.view', 'reports', 'View sales, stock valuation, and cashier reports'),
('reports.export', 'reports', 'Export reports to CSV and PDF format'),
('settings.view', 'settings', 'View store profile and billing preferences'),
('settings.edit', 'settings', 'Modify store configuration, tax rules, and receipt template'),
('email.manage', 'email', 'Configure SMTP server and daily sales email schedule'),
('backup.manage', 'backup', 'Trigger database backups and export archive'),
('audit.view', 'audit', 'Inspect system security and administrative audit logs')
ON CONFLICT (id) DO NOTHING;

-- 3. ASSIGN PERMISSIONS TO ROLES
-- Super Admin gets ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 'SUPER_ADMIN', id FROM permissions
ON CONFLICT DO NOTHING;

-- System Admin / Cashier gets operational billing & stock visibility permissions
INSERT INTO role_permissions (role_id, permission_id) VALUES
('SYSTEM_ADMIN', 'billing.view'),
('SYSTEM_ADMIN', 'billing.create'),
('SYSTEM_ADMIN', 'billing.edit'),
('SYSTEM_ADMIN', 'billing.cancel'),
('SYSTEM_ADMIN', 'billing.refund'),
('SYSTEM_ADMIN', 'customers.view'),
('SYSTEM_ADMIN', 'customers.manage'),
('SYSTEM_ADMIN', 'products.view'),
('SYSTEM_ADMIN', 'stock.view'),
('SYSTEM_ADMIN', 'reports.view')
ON CONFLICT DO NOTHING;

-- 4. UNITS
INSERT INTO units (id, name, allow_decimals) VALUES
('PCS', 'Piece', false),
('KG', 'Kilogram', true),
('G', 'Gram', true),
('LTR', 'Litre', true),
('ML', 'Millilitre', true),
('BOX', 'Box', false),
('PKT', 'Packet', false),
('BTL', 'Bottle', false),
('CTN', 'Carton', false)
ON CONFLICT (id) DO NOTHING;

-- 5. DEFAULT STORE SETTINGS
INSERT INTO store_settings (id, store_name, address, phone, email, tax_number, currency_symbol, receipt_header, receipt_footer, receipt_width)
VALUES (1, 'FreshMart Supermarket', '742 Evergreen Terrace, Springfield', '+1 (555) 019-2834', 'manager@freshmart.com', 'GSTIN29ABCDE1234F1Z5', '₹', 'Thank you for shopping with us!', 'Goods once sold can be returned within 7 days with original receipt.', '200')
ON CONFLICT (id) DO NOTHING;

-- 6. DEFAULT EMAIL SETTINGS
INSERT INTO email_settings (id, smtp_host, smtp_port, smtp_secure, sender_email, sender_name, daily_report_enabled, daily_report_time, super_admin_email)
VALUES (1, 'smtp.gmail.com', 587, false, 'raamkumaar2022@gmail.com', 'FreshMart Supermarket', true, '21:00', 'raamkumaar2022@gmail.com')
ON CONFLICT (id) DO NOTHING;

-- 7. DEFAULT DOCUMENT SEQUENCES
INSERT INTO document_sequences (sequence_key, prefix, current_year, current_number) VALUES
('INVOICE', 'INV', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0),
('PURCHASE', 'PUR', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0),
('RETURN', 'RET', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0),
('ADJUSTMENT', 'ADJ', EXTRACT(YEAR FROM CURRENT_DATE)::INT, 0)
ON CONFLICT (sequence_key) DO NOTHING;

-- 8. DEFAULT WALK-IN CUSTOMER
INSERT INTO customers (id, name, phone, email, address, loyalty_points) VALUES
('00000000-0000-0000-0000-000000000001', 'Walk-in Customer', '0000000000', 'walkin@store.local', 'Counter Sale', 0)
ON CONFLICT (id) DO NOTHING;

-- 9. CATEGORIES
INSERT INTO categories (id, name, code, color, icon, display_order) VALUES
('c0000001-0000-0000-0000-000000000001', 'Dairy & Eggs', 'DAIR', '#06b6d4', 'milk', 1),
('c0000001-0000-0000-0000-000000000002', 'Bakery & Bread', 'BAK', '#ec4899', 'croissant', 2),
('c0000001-0000-0000-0000-000000000003', 'Grocery & Staples', 'GROC', '#10b981', 'wheat', 3),
('c0000001-0000-0000-0000-000000000004', 'Beverages & Drinks', 'BEV', '#3b82f6', 'cup-soda', 4),
('c0000001-0000-0000-0000-000000000005', 'Snacks & Confectionery', 'SNAK', '#f59e0b', 'cookie', 5),
('c0000001-0000-0000-0000-000000000006', 'Personal Care', 'PC', '#8b5cf6', 'heart-pulse', 6),
('c0000001-0000-0000-0000-000000000007', 'Household & Cleaning', 'HH', '#64748b', 'sparkles', 7),
('c0000001-0000-0000-0000-000000000008', 'Fresh Produce & Fruits', 'FRU', '#84cc16', 'apple', 8)
ON CONFLICT (id) DO NOTHING;

--- 10. SUPPLIERS
INSERT INTO suppliers (id, name, contact_person, phone, email, address, payment_terms) VALUES
('a0000001-0000-0000-0000-000000000001', 'Metro Dairy & Poultry Corp', 'Rahul Sharma', '+91 98765 43210', 'orders@metrodairy.com', '12 Industrial Hub, Sector 4', 'Net 15'),
('a0000001-0000-0000-0000-000000000002', 'Golden Harvest Agro Foods', 'Sunil Verma', '+91 98765 43211', 'sales@goldenharvest.com', 'Plot 88 Grain Market', 'Net 30'),
('a0000001-0000-0000-0000-000000000003', 'Apex FMCG Distributors', 'Anil Gupta', '+91 98765 43212', 'supply@apexfmcg.com', '45 Logistics Park', 'Immediate')
ON CONFLICT (id) DO NOTHING;

-- 11. PRODUCTS
-- Passwords will be seeded via typescript migrate runner with bcrypt hashes.
-- Product catalog with realistic barcodes:
INSERT INTO products (id, sku, barcode, name, short_name, category_id, unit_id, supplier_id, purchase_price, selling_price, mrp, tax_rate, current_stock, min_stock_level, max_stock_level, has_expiry) VALUES
('b0000001-0000-0000-0000-000000000001', 'SKU-MLK-001', '890103000001', 'Fresh Farm Whole Milk 1L', 'Whole Milk 1L', 'c0000001-0000-0000-0000-000000000001', 'LTR', 'a0000001-0000-0000-0000-000000000001', 52.00, 62.00, 64.00, 5.00, 48.000, 10.000, 100.000, true),
('b0000001-0000-0000-0000-000000000002', 'SKU-BRD-002', '890103000002', 'Whole Wheat Honey Brown Bread 400g', 'Brown Bread 400g', 'c0000001-0000-0000-0000-000000000002', 'PKT', 'a0000001-0000-0000-0000-000000000001', 34.00, 45.00, 45.00, 0.00, 25.000, 8.000, 50.000, true),
('b0000001-0000-0000-0000-000000000003', 'SKU-RIC-003', '890103000003', 'Royal Basmati Long Grain Rice 5kg', 'Basmati Rice 5kg', 'c0000001-0000-0000-0000-000000000003', 'PKT', 'a0000001-0000-0000-0000-000000000002', 380.00, 450.00, 490.00, 0.00, 32.000, 5.000, 60.000, false),
('b0000001-0000-0000-0000-000000000004', 'SKU-OIL-004', '890103000004', 'Pure Refined Sunflower Oil 1L Pouch', 'Sunflower Oil 1L', 'c0000001-0000-0000-0000-000000000003', 'PKT', 'a0000001-0000-0000-0000-000000000002', 122.00, 145.00, 155.00, 5.00, 55.000, 12.000, 120.000, true),
('b0000001-0000-0000-0000-000000000005', 'SKU-TEA-005', '890103000005', 'Premium CTC Assam Leaf Tea 500g', 'Assam Tea 500g', 'c0000001-0000-0000-0000-000000000004', 'PKT', 'a0000001-0000-0000-0000-000000000003', 180.00, 225.00, 240.00, 5.00, 40.000, 10.000, 80.000, false),
('b0000001-0000-0000-0000-000000000006', 'SKU-COK-006', '890103000006', 'Coca-Cola Refreshing Soda 750ml Bottle', 'Coca-Cola 750ml', 'c0000001-0000-0000-0000-000000000004', 'BTL', 'a0000001-0000-0000-0000-000000000003', 31.50, 40.00, 40.00, 18.00, 60.000, 15.000, 150.000, true),
('b0000001-0000-0000-0000-000000000007', 'SKU-CHP-007', '890103000007', 'Crispy Golden Potato Chips Classic Salted 50g', 'Potato Chips 50g', 'c0000001-0000-0000-0000-000000000005', 'PKT', 'a0000001-0000-0000-0000-000000000003', 15.00, 20.00, 20.00, 12.00, 80.000, 20.000, 200.000, true),
('b0000001-0000-0000-0000-000000000008', 'SKU-PAS-008', '890103000008', 'Colgate MaxFresh Peppermint Toothpaste 150g', 'Colgate 150g', 'c0000001-0000-0000-0000-000000000006', 'PCS', 'a0000001-0000-0000-0000-000000000003', 85.00, 110.00, 120.00, 18.00, 35.000, 8.000, 60.000, true),
('b0000001-0000-0000-0000-000000000009', 'SKU-DET-009', '890103000009', 'Active Clean Detergent Washing Powder 1kg', 'Detergent 1kg', 'c0000001-0000-0000-0000-000000000007', 'PKT', 'a0000001-0000-0000-0000-000000000003', 115.00, 140.00, 150.00, 18.00, 45.000, 10.000, 100.000, false),
('b0000001-0000-0000-0000-000000000010', 'SKU-APL-010', '890103000010', 'Washington Red Sweet Apple 1kg', 'Red Apple 1kg', 'c0000001-0000-0000-0000-000000000008', 'KG', 'a0000001-0000-0000-0000-000000000002', 140.00, 180.00, 200.00, 0.00, 22.500, 6.000, 50.000, false),
('b0000001-0000-0000-0000-000000000011', 'SKU-BUT-011', '890103000011', 'Farm Creamery Salted Butter 100g', 'Butter 100g', 'c0000001-0000-0000-0000-000000000001', 'PKT', 'a0000001-0000-0000-0000-000000000001', 46.00, 56.00, 58.00, 12.00, 4.000, 10.000, 40.000, true), -- Low stock sample!
('b0000001-0000-0000-0000-000000000012', 'SKU-BIS-012', '890103000012', 'Choco Delight Crunchy Cookies 200g', 'Choco Cookies 200g', 'c0000001-0000-0000-0000-000000000005', 'PKT', 'a0000001-0000-0000-0000-000000000003', 28.00, 38.00, 40.00, 12.00, 0.000, 10.000, 60.000, true) -- Out of stock sample!
ON CONFLICT (id) DO NOTHING;

-- 12. INITIAL INVENTORY MOVEMENT RECORDS
-- Ensure every product has a traceable OPENING stock entry matching its current stock:
INSERT INTO inventory_movements (product_id, movement_type, quantity_in, quantity_out, balance_after, reference_type, reference_id, notes)
SELECT id, 'OPENING', current_stock, 0.000, current_stock, 'SYSTEM_SEED', 'INIT-2026', 'Initial store opening inventory balance'
FROM products
ON CONFLICT DO NOTHING;
