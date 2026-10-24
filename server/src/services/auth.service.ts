import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../config/db.js';
import { logAuditAction } from './audit.service.js';
import { createTransporter, getEmailSettings } from './email.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aeropos_supermarket_jwt_secret_key_change_in_production_2026_xyz';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';
const FAILED_LOGIN_LIMIT = parseInt(process.env.FAILED_LOGIN_LIMIT || '5', 10);
const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_TIME_MINUTES || '15', 10);
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
const OTP_RESEND_SECONDS = parseInt(process.env.OTP_RESEND_SECONDS || '60', 10);

type OtpChannel = 'EMAIL' | 'PHONE';
type OtpPurpose = 'LOGIN' | 'REGISTER';

function normalizeOtpDestination(identifier: string, channel?: string): { identifier: string; channel: OtpChannel } {
  const value = identifier.trim();
  const inferredChannel: OtpChannel = channel?.toUpperCase() === 'EMAIL' || (!channel && value.includes('@')) ? 'EMAIL' : 'PHONE';
  if (inferredChannel === 'EMAIL') {
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid Gmail or email address.');
    return { identifier: email, channel: 'EMAIL' };
  }
  const phone = value.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a mobile number in international format, for example +917339266006.');
  return { identifier: phone, channel: 'PHONE' };
}

async function deliverOtp(destination: { identifier: string; channel: OtpChannel }, otp: string) {
  if (destination.channel === 'EMAIL') {
    const settings = await getEmailSettings();
    const transporter = await createTransporter();
    await transporter.sendMail({
      from: `"${settings.sender_name || 'AeroPOS'}" <${settings.sender_email}>`,
      to: destination.identifier,
      subject: 'Your AeroPOS verification code',
      text: `Your AeroPOS verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes. Do not share this code.`,
      html: `<p>Your AeroPOS verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otp}</p><p>It expires in ${OTP_TTL_MINUTES} minutes. Do not share this code.</p>`
    });
    return;
  }

  // Recommended production option: Twilio Programmable Messaging. The OTP is
  // generated and validated by this service; Twilio is only used as delivery.
  if ((process.env.SMS_PROVIDER || '').toLowerCase() === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !from) {
      throw new Error('Mobile OTP is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.');
    }
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: destination.identifier,
        From: from,
        Body: `Your AeroPOS verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes. Do not share this code.`
      }).toString()
    });
    if (!response.ok) {
      console.error('[TWILIO OTP ERROR]', await response.text());
      throw new Error('Unable to send the mobile OTP. Check your Twilio configuration and phone number.');
    }
    return;
  }

  const webhookUrl = process.env.SMS_OTP_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('Mobile OTP is not configured. Set SMS_PROVIDER=twilio with Twilio credentials, or configure SMS_OTP_WEBHOOK_URL.');
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(process.env.SMS_OTP_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_OTP_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ to: destination.identifier, message: `Your AeroPOS verification code is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes.` })
  });
  if (!response.ok) throw new Error('Unable to send the mobile OTP. Please try again later.');
}

async function createOtpChallenge(purpose: OtpPurpose, identifier: string, channel?: string) {
  const destination = normalizeOtpDestination(identifier, channel);
  const recent = await pool.query(
    `SELECT created_at FROM auth_otp_challenges WHERE purpose = $1 AND channel = $2 AND identifier = $3 ORDER BY created_at DESC LIMIT 1`,
    [purpose, destination.channel, destination.identifier]
  );
  if (recent.rowCount && Date.now() - new Date(recent.rows[0].created_at).getTime() < OTP_RESEND_SECONDS * 1000) {
    throw new Error(`Please wait ${OTP_RESEND_SECONDS} seconds before requesting another code.`);
  }
  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = await bcrypt.hash(otp, 12);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_otp_challenges (purpose, channel, identifier, otp_hash, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [purpose, destination.channel, destination.identifier, otpHash, expiresAt]
  );
  try {
    await deliverOtp(destination, otp);
  } catch (error) {
    await pool.query(`DELETE FROM auth_otp_challenges WHERE purpose = $1 AND channel = $2 AND identifier = $3 AND otp_hash = $4`, [purpose, destination.channel, destination.identifier, otpHash]);
    throw error;
  }
  return { success: true, message: `A verification code was sent to your ${destination.channel === 'EMAIL' ? 'email address' : 'mobile number'}.` };
}

async function consumeOtpChallenge(purpose: OtpPurpose, identifier: string, otp: string, channel?: string) {
  const destination = normalizeOtpDestination(identifier, channel);
  const result = await pool.query(
    `SELECT * FROM auth_otp_challenges WHERE purpose = $1 AND channel = $2 AND identifier = $3 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1`,
    [purpose, destination.channel, destination.identifier]
  );
  if (!result.rowCount) throw new Error('This code is invalid or has expired. Request a new one.');
  const challenge = result.rows[0];
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) throw new Error('Too many invalid attempts. Request a new code.');
  if (!await bcrypt.compare(otp.trim(), challenge.otp_hash)) {
    await pool.query(`UPDATE auth_otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [challenge.id]);
    throw new Error('This verification code is invalid.');
  }
  const consumed = await pool.query(
    `UPDATE auth_otp_challenges SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
    [challenge.id]
  );
  if (!consumed.rowCount) throw new Error('This verification code has already been used.');
  return destination;
}

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
export async function sendLoginOtp(identifier: string, channel?: string) {
  const destination = normalizeOtpDestination(identifier, channel);
  const userRes = await pool.query(
    `SELECT id, is_active FROM users WHERE ${destination.channel === 'EMAIL' ? 'LOWER(email) = $1' : "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = $1"} LIMIT 1`,
    [destination.identifier]
  );
  if (!userRes.rowCount || !userRes.rows[0].is_active) throw new Error('No active account is registered with that contact method.');
  return createOtpChallenge('LOGIN', destination.identifier, destination.channel);
}

export async function verifyLoginOtp(credentials: {
  identifier: string;
  otp: string;
  channel?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const destination = await consumeOtpChallenge('LOGIN', credentials.identifier, credentials.otp, credentials.channel);
  const userRes = await pool.query(
    `SELECT id, username, email, full_name, phone, avatar_url, is_active FROM users 
     WHERE ${destination.channel === 'EMAIL' ? 'LOWER(email) = $1' : "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = $1"}
     LIMIT 1`,
    [destination.identifier]
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
    newValues: { channel: destination.channel, roles },
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

export async function requestRegistrationOtp(data: { identifier: string; channel?: string }) {
  const destination = normalizeOtpDestination(data.identifier, data.channel);
  const existing = await pool.query(
    `SELECT id FROM users WHERE ${destination.channel === 'EMAIL' ? 'LOWER(email) = $1' : "REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '(', ''), ')', '') = $1"} LIMIT 1`,
    [destination.identifier]
  );
  if (existing.rowCount) throw new Error('An account already exists with this contact method. Please sign in.');
  return createOtpChallenge('REGISTER', destination.identifier, destination.channel);
}

export async function registerUser(data: { fullName: string; username: string; password: string; identifier: string; channel?: string; otp: string; ipAddress?: string; userAgent?: string }) {
  if (!data.fullName?.trim() || !/^[a-zA-Z0-9_.-]{3,50}$/.test(data.username?.trim() || '')) throw new Error('Enter your full name and a username of at least 3 characters.');
  if (!data.password || data.password.length < 10 || !/[A-Z]/.test(data.password) || !/[a-z]/.test(data.password) || !/\d/.test(data.password)) {
    throw new Error('Use a password of at least 10 characters with uppercase, lowercase, and a number.');
  }
  const destination = await consumeOtpChallenge('REGISTER', data.identifier, data.otp, data.channel);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(data.password, 12);
    const insert = await client.query(
      `INSERT INTO users (username, email, password_hash, full_name, phone, is_active)
       VALUES ($1, $2, $3, $4, $5, true) RETURNING id, username, email, full_name, phone, avatar_url`,
      [data.username.trim(), destination.channel === 'EMAIL' ? destination.identifier : null, passwordHash, data.fullName.trim(), destination.channel === 'PHONE' ? destination.identifier : null]
    );
    const user = insert.rows[0];
    await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, 'SYSTEM_ADMIN')`, [user.id]);
    await client.query('COMMIT');
    const { roles, permissions } = await getUserRolesAndPermissions(user.id);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
    await logAuditAction({ userId: user.id, username: user.username, action: 'AUTH_SELF_REGISTERED', entity: 'users', entityId: user.id, newValues: { channel: destination.channel, roles }, ipAddress: data.ipAddress, userAgent: data.userAgent });
    return { token, user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, phone: user.phone, avatarUrl: user.avatar_url, roles, permissions } };
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') throw new Error('That username or contact method is already in use.');
    throw error;
  } finally {
    client.release();
  }
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
