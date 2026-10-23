import { pool } from '../config/db.js';

export interface AuditLogEntry {
  userId?: string | null;
  username?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAuditAction(entry: AuditLogEntry): Promise<void> {
  try {
    const query = `
      INSERT INTO audit_logs (
        user_id, username, action, entity, entity_id,
        old_values, new_values, ip_address, user_agent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
    `;

    await pool.query(query, [
      entry.userId || null,
      entry.username || null,
      entry.action,
      entry.entity,
      entry.entityId ? String(entry.entityId) : null,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      entry.ipAddress || null,
      entry.userAgent || null
    ]);
  } catch (err) {
    // Append-only audit logger should never crash the main transaction, but report to stderr
    console.error('[AUDIT LOG ERROR] Failed to record audit log:', err);
  }
}

export async function getAuditLogs(params: {
  limit?: number;
  offset?: number;
  entity?: string;
  action?: string;
  userId?: string;
}) {
  const limit = params.limit || 50;
  const offset = params.offset || 0;
  const conditions: string[] = [];
  const values: any[] = [];

  if (params.entity) {
    values.push(params.entity);
    conditions.push(`entity = $${values.length}`);
  }
  if (params.action) {
    values.push(params.action);
    conditions.push(`action = $${values.length}`);
  }
  if (params.userId) {
    values.push(params.userId);
    conditions.push(`user_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const countRes = await pool.query(
    `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
    values
  );
  const total = parseInt(countRes.rows[0].count, 10);

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const logsRes = await pool.query(
    `SELECT id, user_id, username, action, entity, entity_id, old_values, new_values, ip_address, created_at
     FROM audit_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values
  );

  return {
    total,
    logs: logsRes.rows
  };
}
