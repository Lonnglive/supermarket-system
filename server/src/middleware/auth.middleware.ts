import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aeropos_supermarket_jwt_secret_key_change_in_production_2026_xyz';

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized', message: 'No authentication token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
    
    // Fetch active user and their permissions
    const userRes = await pool.query(
      `SELECT id, username, email, full_name, is_active, locked_until
       FROM users
       WHERE id = $1`,
      [decoded.id]
    );

    if (userRes.rowCount === 0) {
      res.status(401).json({ error: 'Unauthorized', message: 'User account not found.' });
      return;
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      res.status(403).json({ error: 'Forbidden', message: 'User account has been deactivated. Contact Super Admin.' });
      return;
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      res.status(403).json({ error: 'Forbidden', message: 'User account is temporarily locked due to failed login attempts.' });
      return;
    }

    // Get roles
    const rolesRes = await pool.query(
      `SELECT role_id FROM user_roles WHERE user_id = $1`,
      [user.id]
    );
    const roles = rolesRes.rows.map(r => r.role_id);

    // Get permissions
    let permissions: string[] = [];
    if (roles.includes('SUPER_ADMIN')) {
      const allPermsRes = await pool.query(`SELECT id FROM permissions`);
      permissions = allPermsRes.rows.map(p => p.id);
    } else {
      const permRes = await pool.query(
        `SELECT DISTINCT rp.permission_id
         FROM role_permissions rp
         JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = $1`,
        [user.id]
      );
      permissions = permRes.rows.map(p => p.permission_id);
    }

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      roles,
      permissions
    };

    next();
  } catch (err: any) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired session token. Please log in again.' });
  }
}

export function requirePermission(permissionId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
      return;
    }

    // Super Admin has full bypass
    if (req.user.roles.includes('SUPER_ADMIN')) {
      return next();
    }

    if (req.user.permissions.includes(permissionId)) {
      return next();
    }

    res.status(403).json({
      error: 'Permission Denied',
      message: `You do not have permission to perform this action (${permissionId}).`
    });
  };
}

export function requireRole(roleId: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
      return;
    }

    if (req.user.roles.includes(roleId) || req.user.roles.includes('SUPER_ADMIN')) {
      return next();
    }

    res.status(403).json({
      error: 'Role Restricted',
      message: `This action requires the ${roleId} role.`
    });
  };
}
