-- Registration choices are requests, never self-granted elevated privileges.
ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_persona VARCHAR(20) NOT NULL DEFAULT 'SYSTEM_ADMIN'
    CHECK (requested_persona IN ('SYSTEM_ADMIN', 'STORE_MANAGER', 'SUPER_ADMIN'));

INSERT INTO roles (id, name, description)
VALUES ('STORE_MANAGER', 'Store Manager', 'Operational management access; elevated access must be granted by a Super Administrator')
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id) VALUES
('STORE_MANAGER', 'billing.view'),
('STORE_MANAGER', 'billing.create'),
('STORE_MANAGER', 'billing.edit'),
('STORE_MANAGER', 'billing.cancel'),
('STORE_MANAGER', 'billing.refund'),
('STORE_MANAGER', 'billing.discount'),
('STORE_MANAGER', 'customers.view'),
('STORE_MANAGER', 'customers.manage'),
('STORE_MANAGER', 'products.view'),
('STORE_MANAGER', 'products.create'),
('STORE_MANAGER', 'products.edit'),
('STORE_MANAGER', 'stock.view'),
('STORE_MANAGER', 'stock.create'),
('STORE_MANAGER', 'stock.edit'),
('STORE_MANAGER', 'stock.adjust'),
('STORE_MANAGER', 'stock.purchase'),
('STORE_MANAGER', 'reports.view'),
('STORE_MANAGER', 'reports.export')
ON CONFLICT DO NOTHING;
