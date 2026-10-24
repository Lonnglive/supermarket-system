-- Secure, single-use authentication challenges. OTP values are stored only as hashes.
CREATE TABLE IF NOT EXISTS auth_otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('LOGIN', 'REGISTER')),
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('EMAIL', 'PHONE')),
    identifier VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_challenges_lookup
    ON auth_otp_challenges (purpose, channel, identifier, created_at DESC);

-- A phone-verified account may not have an email address at registration time.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
-- Passwords must never be recoverable or displayed to an administrator.
UPDATE users SET viewable_password = NULL WHERE viewable_password IS NOT NULL;

-- Public registration must have a unique verified contact. Existing user emails may
-- be shared from older versions, so this index only protects newly created accounts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique_nonempty
    ON users (phone) WHERE phone IS NOT NULL AND TRIM(phone) <> '';
