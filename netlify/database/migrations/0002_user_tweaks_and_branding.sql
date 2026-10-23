-- ==============================================================================
-- 002_user_tweaks_and_branding.sql
-- Relax email uniqueness, add viewable passwords, avatar, GST & FSSAI, shop logo
-- ==============================================================================

-- 1. Allow multiple users to share the same email address
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- 2. Add viewable_password and avatar_url to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS viewable_password VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Seed viewable passwords for default users
UPDATE users SET viewable_password = 'Admin@123' WHERE username = 'admin' AND (viewable_password IS NULL OR viewable_password = '');
UPDATE users SET viewable_password = 'Cashier@123' WHERE username = 'cashier' AND (viewable_password IS NULL OR viewable_password = '');

-- 3. Add GST & FSSAI fields and Shop Logo to store_settings
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50) DEFAULT 'GSTIN29ABCDE1234F1Z5';
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_gst BOOLEAN DEFAULT TRUE;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS fssai_number VARCHAR(50) DEFAULT '';
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS enable_fssai BOOLEAN DEFAULT FALSE;
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '';

-- 4. Update default Store Name to Bharathi Homelings
UPDATE store_settings
SET store_name = 'Bharathi Homelings',
    gst_number = COALESCE(NULLIF(tax_number, ''), 'GSTIN29ABCDE1234F1Z5'),
    enable_gst = TRUE
WHERE id = 1;

-- 5. OTP verification storage table
CREATE TABLE IF NOT EXISTS phone_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(30) NOT NULL,
    otp_code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_phone_otps_phone ON phone_otps(phone);

-- 6. Add stock_field_config for customizable stock entry fields (MRP, GST, Cost, Net, etc.)
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS stock_field_config JSONB;

