-- ==============================================================================
-- 0006_default_users.sql
-- Default Super Admin and System Admin accounts (mirrors server/src/db/migrate.ts).
-- Change these passwords in Settings -> Staff & Roles after first login.
-- ==============================================================================

INSERT INTO users (username, email, password_hash, viewable_password, full_name, phone, is_active)
VALUES
  ('admin', 'admin@supermarket.com', '$2a$12$o9PiwAUktNJRnVlUsIRDOePhFOyjxng3scJFhDuZBsJGU.g/hraB6', 'Admin@123', 'Super Administrator', '+1 555-0100', true),
  ('cashier', 'cashier@supermarket.com', '$2a$12$DT8jxz/X97bDDRpOkuVkp.RzBNVKEaKpiTMcmH4sfksn8u/5jtO7u', 'Cashier@123', 'Frontline Cashier', '+1 555-0101', true)
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT id, 'SUPER_ADMIN' FROM users WHERE username = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT id, 'SYSTEM_ADMIN' FROM users WHERE username = 'cashier'
ON CONFLICT DO NOTHING;
