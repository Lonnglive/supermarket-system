-- Each active user profile can receive the scheduled daily sales report at
-- the email address configured on that profile.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS receive_daily_report BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_users_daily_report_recipients
  ON users (receive_daily_report)
  WHERE is_active = TRUE AND receive_daily_report = TRUE;
