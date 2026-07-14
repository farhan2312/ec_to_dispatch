import { query } from "@/lib/db";

export type AuditCategory = "auth" | "activity" | "ownership";

export type AuditActor = {
  id?: string | null;
  email?: string | null;
  role?: string | null;
};

/**
 * Record an audit event. Never throws — a logging failure must not break the
 * action being logged.
 */
export async function logAudit(entry: {
  actor?: AuditActor;
  action: string;
  category: AuditCategory;
  target?: string | null;
  details?: string | null;
}): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_log
         (user_id, user_email, user_role, action, category, target, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actor?.id ?? null,
        entry.actor?.email ?? null,
        entry.actor?.role ?? null,
        entry.action,
        entry.category,
        entry.target ?? null,
        entry.details ?? null,
      ]
    );
  } catch (error) {
    console.error("audit log failed:", error);
  }
}

export type AuditStats = {
  logins: number;
  failed: number;
  activeUsers: number;
  actions: number;
};

/** 24-hour headline counts for the stat cards. */
export async function getAuditStats(): Promise<AuditStats> {
  const result = await query<{
    logins: number;
    failed: number;
    active_users: number;
    actions: number;
  }>(
    `SELECT
        count(*) FILTER (WHERE action = 'login'
                          AND created_at > now() - interval '24 hours')::int AS logins,
        count(*) FILTER (WHERE action = 'login_failed'
                          AND created_at > now() - interval '24 hours')::int AS failed,
        count(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL
                          AND created_at > now() - interval '24 hours')::int AS active_users,
        count(*) FILTER (WHERE category = 'activity'
                          AND created_at > now() - interval '24 hours')::int AS actions
       FROM audit_log`
  );
  const row = result.rows[0];
  return {
    logins: row?.logins ?? 0,
    failed: row?.failed ?? 0,
    activeUsers: row?.active_users ?? 0,
    actions: row?.actions ?? 0,
  };
}

export type AuditEvent = {
  id: string;
  created_at: string;
  user_email: string | null;
  user_role: string | null;
  action: string;
  category: string;
  target: string | null;
  details: string | null;
};

/** Most recent events (capped) for the audit log view. */
export async function listRecentAuditEvents(
  limit = 1000
): Promise<AuditEvent[]> {
  const result = await query<AuditEvent>(
    `SELECT id,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            user_email, user_role, action, category, target, details
       FROM audit_log
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit]
  );
  return result.rows;
}
