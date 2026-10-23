-- ==============================================================================
-- 001_initial_schema.sql
-- Production Supermarket Management System Schema
-- ==============================================================================

-- Enable UUID extension if available
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- ROLES & PERMISSIONS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id VARCHAR(100) PRIMARY KEY,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id VARCHAR(50) REFERENCES roles(id) ON DELETE CASCADE,
    permission_id VARCHAR(100) REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- USERS & USER ROLES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    is_active BOOLEAN DEFAULT TRUE,
    failed_login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id VARCHAR(50) REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- -----------------------------------------------------------------------------
-- MASTER TAXONOMY: CATEGORIES, SUBCATEGORIES, BRANDS, UNITS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) UNIQUE,
    color VARCHAR(30) DEFAULT '#10b981',
    icon VARCHAR(50) DEFAULT 'tag',
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category_id, name)
);

CREATE TABLE IF NOT EXISTS brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS units (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    allow_decimals BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- SUPPLIERS & CUSTOMERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(30),
    email VARCHAR(100),
    address TEXT,
    tax_id VARCHAR(50),
    payment_terms VARCHAR(100),
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL DEFAULT 'Walk-in Customer',
    phone VARCHAR(30) UNIQUE,
    email VARCHAR(100),
    address TEXT,
    tax_id VARCHAR(50),
    loyalty_points INT DEFAULT 0,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- PRODUCTS & BATCHES
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku VARCHAR(50) UNIQUE NOT NULL,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    short_name VARCHAR(100),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
    unit_id VARCHAR(20) REFERENCES units(id) ON DELETE RESTRICT,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(12, 2) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    min_stock_level NUMERIC(12, 3) DEFAULT 5.000,
    max_stock_level NUMERIC(12, 3) DEFAULT 100.000,
    has_expiry BOOLEAN DEFAULT FALSE,
    has_batch BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS product_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(50) NOT NULL,
    expiry_date DATE,
    quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    purchase_rate NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date);

-- -----------------------------------------------------------------------------
-- DOCUMENT SEQUENCES (Safe Atomic Server Numbering)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_sequences (
    sequence_key VARCHAR(50) PRIMARY KEY,
    prefix VARCHAR(20) NOT NULL,
    current_year INT NOT NULL,
    current_number INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Function to safely get next document number (INV-2026-000001, etc.)
CREATE OR REPLACE FUNCTION get_next_document_number(p_key VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_prefix VARCHAR(20);
    v_year INT;
    v_current_year INT;
    v_next_num INT;
    v_doc_num VARCHAR(50);
BEGIN
    v_current_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;

    -- Lock row for update
    SELECT prefix, current_year, current_number
    INTO v_prefix, v_year, v_next_num
    FROM document_sequences
    WHERE sequence_key = p_key
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Initialize sequence
        IF p_key = 'INVOICE' THEN v_prefix := 'INV';
        ELSIF p_key = 'PURCHASE' THEN v_prefix := 'PUR';
        ELSIF p_key = 'RETURN' THEN v_prefix := 'RET';
        ELSIF p_key = 'ADJUSTMENT' THEN v_prefix := 'ADJ';
        ELSE v_prefix := 'DOC';
        END IF;

        v_year := v_current_year;
        v_next_num := 1;

        INSERT INTO document_sequences (sequence_key, prefix, current_year, current_number, updated_at)
        VALUES (p_key, v_prefix, v_year, v_next_num, CURRENT_TIMESTAMP);
    ELSE
        -- If year changed, reset sequence to 1
        IF v_year <> v_current_year THEN
            v_year := v_current_year;
            v_next_num := 1;
        ELSE
            v_next_num := v_next_num + 1;
        END IF;

        UPDATE document_sequences
        SET current_year = v_year,
            current_number = v_next_num,
            updated_at = CURRENT_TIMESTAMP
        WHERE sequence_key = p_key;
    END IF;

    -- Format document number: PREFIX-YEAR-000001
    v_doc_num := v_prefix || '-' || v_year::TEXT || '-' || LPAD(v_next_num::TEXT, 6, '0');
    RETURN v_doc_num;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- SALES & BILLING
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_txn_id VARCHAR(100) UNIQUE,
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    cashier_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    subtotal NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    round_off NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED', -- COMPLETED, CANCELLED, REFUNDED
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);

CREATE TABLE IF NOT EXISTS sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity NUMERIC(12, 3) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    mrp NUMERIC(12, 2) NOT NULL,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    payment_method VARCHAR(20) NOT NULL, -- CASH, CARD, UPI, SPLIT
    amount NUMERIC(12, 2) NOT NULL,
    tendered_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reference_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

-- -----------------------------------------------------------------------------
-- INVENTORY MOVEMENTS (Complete Audit Trail for Every Stock Change)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    batch_id UUID REFERENCES product_batches(id) ON DELETE SET NULL,
    movement_type VARCHAR(30) NOT NULL, -- OPENING, PURCHASE, SALE, SALE_RETURN, PURCHASE_RETURN, ADJUSTMENT, DAMAGED, EXPIRED, CORRECTION
    quantity_in NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    quantity_out NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    balance_after NUMERIC(12, 3) NOT NULL,
    reference_type VARCHAR(50), -- SALE, PURCHASE, ADJUSTMENT, RETURN
    reference_id VARCHAR(100),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON inventory_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(movement_type);

-- -----------------------------------------------------------------------------
-- PURCHASES & PURCHASE ITEMS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_invoice_number VARCHAR(100),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    grand_total NUMERIC(12, 2) NOT NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID', -- PAID, PARTIAL, PENDING
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID REFERENCES purchases(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL,
    purchase_rate NUMERIC(12, 2) NOT NULL,
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    line_total NUMERIC(12, 2) NOT NULL,
    batch_number VARCHAR(50),
    expiry_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- STOCK ADJUSTMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    adjustment_number VARCHAR(50) UNIQUE NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    adjustment_type VARCHAR(30) NOT NULL, -- PHYSICAL_COUNT, DAMAGED, EXPIRED, CORRECTION
    old_quantity NUMERIC(12, 3) NOT NULL,
    new_quantity NUMERIC(12, 3) NOT NULL,
    difference_quantity NUMERIC(12, 3) NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- SALES RETURNS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number VARCHAR(50) UNIQUE NOT NULL,
    sale_id UUID REFERENCES sales(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    total_refund NUMERIC(12, 2) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id UUID REFERENCES sales_returns(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL,
    refund_amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- HELD BILLS (POS Cart Parking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS held_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_reference VARCHAR(50) NOT NULL,
    cashier_id UUID REFERENCES users(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100),
    cart_data JSONB NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- STORE PROFILE & APPLICATION SETTINGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_settings (
    id INT PRIMARY KEY DEFAULT 1,
    store_name VARCHAR(150) NOT NULL DEFAULT 'FreshMart Supermarket',
    address TEXT DEFAULT '742 Evergreen Terrace, Springfield',
    phone VARCHAR(50) DEFAULT '+1 (555) 019-2834',
    email VARCHAR(100) DEFAULT 'manager@freshmart.com',
    tax_number VARCHAR(50) DEFAULT 'GSTIN29ABCDE1234F1Z5',
    currency_symbol VARCHAR(10) DEFAULT '₹',
    receipt_header TEXT DEFAULT 'Thank you for shopping with us!',
    receipt_footer TEXT DEFAULT 'Goods once sold can be returned within 7 days with original receipt.',
    receipt_width VARCHAR(10) DEFAULT '200', -- 200 or 58mm
    enable_tax_inclusive BOOLEAN DEFAULT TRUE,
    enable_round_off BOOLEAN DEFAULT TRUE,
    is_setup_complete BOOLEAN DEFAULT FALSE,  -- First-time setup wizard flag
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- Idempotent: add the column to existing DBs that were created before this migration
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS is_setup_complete BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS email_settings (
    id INT PRIMARY KEY DEFAULT 1,
    smtp_host VARCHAR(150) DEFAULT 'smtp.gmail.com',
    smtp_port INT DEFAULT 587,
    smtp_secure BOOLEAN DEFAULT FALSE,
    smtp_user VARCHAR(150) DEFAULT '',
    smtp_password VARCHAR(255) DEFAULT '',
    sender_email VARCHAR(150) DEFAULT 'raamkumaar2022@gmail.com',
    sender_name VARCHAR(100) DEFAULT 'FreshMart Supermarket',
    daily_report_enabled BOOLEAN DEFAULT TRUE,
    daily_report_time VARCHAR(10) DEFAULT '21:00',
    super_admin_email VARCHAR(150) DEFAULT 'raamkumaar2022@gmail.com',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- AUDIT LOGS (Append-only Admin Action Tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    username VARCHAR(50),
    action VARCHAR(50) NOT NULL,
    entity VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity);

-- -----------------------------------------------------------------------------
-- DAILY SALES REPORTS ARCHIVE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS daily_sales_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL UNIQUE,
    total_bills INT NOT NULL DEFAULT 0,
    gross_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discounts NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxes NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    card_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    upi_sales NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    items_sold_count NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    top_products JSONB,
    low_stock_count INT NOT NULL DEFAULT 0,
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
