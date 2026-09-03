import { query } from "@/lib/db";
import {
  PAGE_SIZE,
  clampPage,
  likePattern,
  offsetFor,
  pageResult,
  type PageResult,
} from "@/lib/pagination";

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

/** A row of the "Usage by User" tab: per-user totals over the range. */
export type AuditUserRow = {
  email: string;
  role: string | null;
  actions: number;
  sessions: number;
  lastActive: string;
};

const ISO_FMT = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

/**
 * One page of audit events, filtered in SQL.
 *
 * Replaces the old "fetch the newest 1000 and slice in the browser" path,
 * which silently hid everything older once the table passed that cap.
 */
export async function listAuditEventsPage(opts: {
  page: number;
  category: string | null;
  since: string | null;
  search: string;
}): Promise<PageResult<AuditEvent>> {
  const search = opts.search ? likePattern(opts.search) : null;
  const where = `WHERE ($1::text IS NULL OR category = $1)
        AND ($2::timestamptz IS NULL OR created_at >= $2)
        AND ($3::text IS NULL OR user_email ILIKE $3 OR details ILIKE $3
                              OR target ILIKE $3 OR action ILIKE $3)`;

  const totals = await query<{ count: string }>(
    `SELECT count(*) AS count FROM audit_log ${where}`,
    [opts.category, opts.since, search]
  );
  const total = Number(totals.rows[0]?.count ?? 0);
  const page = clampPage(opts.page, total);

  const rows = await (async () =>
    query<AuditEvent>(
      `SELECT id,
              to_char(created_at AT TIME ZONE 'UTC', ${ISO_FMT}) AS created_at,
              user_email, user_role, action, category, target, details
         FROM audit_log
         ${where}
        ORDER BY created_at DESC
        LIMIT $4 OFFSET $5`,
      [opts.category, opts.since, search, PAGE_SIZE, offsetFor(page)]
    ))();

  return pageResult(rows.rows, total, page);
}

/**
 * One page of the per-user aggregate. Grouping happens in SQL so the totals
 * cover the whole range, not just the rows on screen.
 */
export async function listAuditUsersPage(opts: {
  page: number;
  since: string | null;
  search: string;
}): Promise<PageResult<AuditUserRow>> {
  const search = opts.search ? likePattern(opts.search) : null;
  const where = `WHERE user_email IS NOT NULL
        AND ($1::timestamptz IS NULL OR created_at >= $1)
        AND ($2::text IS NULL OR user_email ILIKE $2 OR user_role ILIKE $2)`;

  const totals = await query<{ count: string }>(
    `SELECT count(*) AS count
       FROM (SELECT 1 FROM audit_log ${where} GROUP BY user_email) g`,
    [opts.since, search]
  );
  const total = Number(totals.rows[0]?.count ?? 0);
  const page = clampPage(opts.page, total);

  const rows = await (async () =>
    query<AuditUserRow>(
      `SELECT user_email AS email,
              (ARRAY_AGG(user_role ORDER BY created_at DESC)
                 FILTER (WHERE user_role IS NOT NULL))[1] AS role,
              COUNT(*) FILTER (WHERE category = 'activity')::int AS actions,
              COUNT(*) FILTER (WHERE action = 'login')::int   AS sessions,
              to_char(MAX(created_at) AT TIME ZONE 'UTC', ${ISO_FMT}) AS "lastActive"
         FROM audit_log
         ${where}
        GROUP BY user_email
        ORDER BY MAX(created_at) DESC
        LIMIT $3 OFFSET $4`,
      [opts.since, search, PAGE_SIZE, offsetFor(page)]
    ))();

  return pageResult(rows.rows, total, page);
}
