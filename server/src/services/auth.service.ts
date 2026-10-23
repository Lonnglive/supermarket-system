import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { logAuditAction } from './audit.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aeropos_supermarket_jwt_secret_key_change_in_production_2026_xyz';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const FAILED_LOGIN_LIMIT = parseInt(process.env.FAILED_LOGIN_LIMIT || '5', 10);
const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_TIME_MINUTES || '15', 10);

async function getUserRolesAndPermissions(userId: string) {
  const rolesRes = await pool.query(
    `SELECT role_id FROM user_roles WHERE user_id = $1`,
    [userId]
  );
  const roles = rolesRes.rows.map(r => r.role_id);

  let permissions: string[] = [];
  if (roles.includes('SUPER_ADMIN')) {
    const permsRes = await pool.query(`SELECT id FROM permissions`);
    permissions = permsRes.rows.map(p => p.id);
  } else {
    const permsRes = await pool.query(
      `SELECT DISTINCT rp.permission_id
       FROM role_permissions rp
       JOIN user_roles ur ON rp.role_id = ur.role_id
       WHERE ur.user_id = $1`,
      [userId]
    );
    permissions = permsRes.rows.map(p => p.permission_id);
  }

  return { roles, permissions };
}

export async function loginUser(credentials: {
  usernameOrEmail: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { usernameOrEmail, password, ipAddress, userAgent } = credentials;

  // Search by username, phone, or email
  const userRes = await pool.query(
    `SELECT id, username, email, password_hash, full_name, phone, avatar_url, is_active, failed_login_attempts, locked_until, last_login_at
     FROM users
     WHERE LOWER(username) = LOWER($1) OR phone = $1 OR LOWER(email) = LOWER($1)
     ORDER BY is_active DESC, created_at ASC
     LIMIT 1`,
    [usernameOrEmail.trim()]
  );

  if (userRes.rowCount === 0) {
    throw new Error('Invalid username or password.');
  }

  const user = userRes.rows[0];

  // Check if deactivated
  if (!user.is_active) {
    throw new Error('This account has been deactivated. Please contact the Super Administrator.');
  }

  // Check if locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / (1000 * 60));
    throw new Error(`Account is locked due to multiple failed login attempts. Please try again in ${minutesLeft} minute(s).`);
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const failedAttempts = (user.failed_login_attempts || 0) + 1;
    let lockQuery = `UPDATE users SET failed_login_attempts = $1 WHERE id = $2`;
    let lockParams: any[] = [failedAttempts, user.id];

    if (failedAttempts >= FAILED_LOGIN_LIMIT) {
      lockQuery = `
        UPDATE users
        SET failed_login_attempts = $1,
            locked_until = CURRENT_TIMESTAMP + ($3 || ' minutes')::INTERVAL
        WHERE id = $2
      `;
      lockParams = [failedAttempts, user.id, LOCKOUT_MINUTES];

      await logAuditAction({
        userId: user.id,
        username: user.username,
        action: 'SECURITY_ACCOUNT_LOCKED',
        entity: 'users',
        entityId: user.id,
        newValues: { failedAttempts, lockedUntilMinutes: LOCKOUT_MINUTES },
        ipAddress,
        userAgent
      });
    }

    await pool.query(lockQuery, lockParams);

    const attemptsRemaining = Math.max(0, FAILED_LOGIN_LIMIT - failedAttempts);
    if (attemptsRemaining > 0) {
      throw new Error(`Invalid password. ${attemptsRemaining} attempt(s) remaining before temporary account lockout.`);
    } else {
      throw new Error(`Account locked for ${LOCKOUT_MINUTES} minutes due to ${FAILED_LOGIN_LIMIT} consecutive failed attempts.`);
    }
  }

  // Reset failed attempts & update last login
  await pool.query(
    `UPDATE users
     SET failed_login_attempts = 0,
         locked_until = NULL,
         last_login_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [user.id]
  );

  const { roles, permissions } = await getUserRolesAndPermissions(user.id);

  // Generate JWT
  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as any }
  );

  // Audit log login
  await logAuditAction({
    userId: user.id,
    username: user.username,
    action: 'AUTH_LOGIN_SUCCESS',
    entity: 'users',
    entityId: user.id,
    newValues: { roles },
    ipAddress,
    userAgent
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      roles,
      permissions
    }
  };
}

// -----------------------------------------------------------------------------
// PHONE OTP LOGIN
// -----------------------------------------------------------------------------
export async function sendPhoneOtp(phone: string) {
  const cleanPhone = phone.trim();
  if (!cleanPhone) throw new Error('Phone number is required.');

  // Find user by phone number
  const userRes = await pool.query(
    `SELECT id, username, full_name, phone, is_active FROM users 
     WHERE phone = $1 OR phone = $2 OR REPLACE(phone, ' ', '') = $3
     ORDER BY is_active DESC LIMIT 1`,
    [cleanPhone, cleanPhone.replace(/\D/g, ''), cleanPhone.replace(/\s+/g, '')]
  );

  if (userRes.rowCount === 0) {
    throw new Error('No active staff user registered with this phone number.');
  }

  const user = userRes.rows[0];
  if (!user.is_active) {
    throw new Error('Account associated with this phone is deactivated.');
  }

  // Generate 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store in database
  await pool.query('DELETE FROM phone_otps WHERE phone = $1', [cleanPhone]);
  await pool.query(
    `INSERT INTO phone_otps (phone, otp_code, expires_at) VALUES ($1, $2, $3)`,
    [cleanPhone, otpCode, expiresAt]
  );

  return {
    success: true,
    message: `OTP sent to ${cleanPhone}`,
    // Returned in response for immediate testing in local / demo environments
    devOtp: otpCode,
    userPreview: {
      username: user.username,
      fullName: user.full_name
    }
  };
}

export async function verifyPhoneOtp(credentials: {
  phone: string;
  otp: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const cleanPhone = credentials.phone.trim();
  const cleanOtp = credentials.otp.trim();

  if (!cleanPhone || !cleanOtp) {
    throw new Error('Phone number and OTP code are required.');
  }

  // Validate OTP
  const otpRes = await pool.query(
    `SELECT * FROM phone_otps 
     WHERE (phone = $1 OR phone = $2 OR REPLACE(phone, ' ', '') = $3)
       AND otp_code = $4 
       AND expires_at > CURRENT_TIMESTAMP 
     ORDER BY created_at DESC LIMIT 1`,
    [cleanPhone, cleanPhone.replace(/\D/g, ''), cleanPhone.replace(/\s+/g, ''), cleanOtp]
  );

  if (otpRes.rowCount === 0) {
    throw new Error('Invalid or expired OTP code.');
  }

  // Remove used OTP
  await pool.query('DELETE FROM phone_otps WHERE phone = $1', [cleanPhone]);

  // Retrieve user
  const userRes = await pool.query(
    `SELECT id, username, email, full_name, phone, avatar_url, is_active FROM users 
     WHERE phone = $1 OR phone = $2 OR REPLACE(phone, ' ', '') = $3
     ORDER BY is_active DESC LIMIT 1`,
    [cleanPhone, cleanPhone.replace(/\D/g, ''), cleanPhone.replace(/\s+/g, '')]
  );

  if (userRes.rowCount === 0) throw new Error('User not found.');
  const user = userRes.rows[0];

  if (!user.is_active) {
    throw new Error('This account has been deactivated. Please contact the Super Administrator.');
  }

  // Update last login
  await pool.query(
    `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [user.id]
  );

  const { roles, permissions } = await getUserRolesAndPermissions(user.id);

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN as any }
  );

  await logAuditAction({
    userId: user.id,
    username: user.username,
    action: 'AUTH_OTP_LOGIN_SUCCESS',
    entity: 'users',
    entityId: user.id,
    newValues: { phone: cleanPhone, roles },
    ipAddress: credentials.ipAddress,
    userAgent: credentials.userAgent
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      avatarUrl: user.avatar_url,
      roles,
      permissions
    }
  };
}

export async function getCurrentUser(userId: string) {
  const userRes = await pool.query(
    `SELECT id, username, email, full_name, phone, avatar_url, is_active, last_login_at, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userRes.rowCount === 0) {
    throw new Error('User not found.');
  }

  const user = userRes.rows[0];
  const { roles, permissions } = await getUserRolesAndPermissions(user.id);

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.full_name,
    phone: user.phone,
    avatarUrl: user.avatar_url,
    isActive: user.is_active,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    roles,
    permissions
  };
}
