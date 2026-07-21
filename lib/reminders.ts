import { query } from "@/lib/db";
import { isCentral, reminderDeptForRole, type ReminderDept } from "@/lib/roles";

// The DB session runs in UTC, but the business operates on IST days. Deadlines
// are calendar dates, so "today" must be the IST calendar date, not the UTC
// one — otherwise the day boundary is off by up to 5.5 hours.
const TODAY_IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

// A reminder fires while a department's target date is still ahead (not yet
// overdue — that's alerts.ts) but within a week, and the completing step hasn't
// happened. The three milestones the business wants — 7 days / 72h / 24h out —
// map to 7 / 3 / 1 days left, since the target columns are DATE-granular.
export type ReminderTier = "24h" | "72h" | "7d";

export type ReminderRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  ec_no: string | null;
  party: string | null;
  dept: ReminderDept;
  department: string;
  due_date: string;
  days_left: number;
  tier: ReminderTier;
};

// Same four department deadlines as the overdue engine, shifted to the
// upcoming window. Each branch tags its dept key + label.
const REMINDERS_SQL = `
  -- Drawing due to be sent to the client
  SELECT o.id, o.sl_no::int AS sl_no, o.so_no, o.ec_no, o.party,
         'drawing'::text AS dept, 'Drawing'::text AS department,
         to_char(o.drg_target_date, 'YYYY-MM-DD') AS due_date,
         (o.drg_target_date - ${TODAY_IST})::int AS days_left
    FROM orders o JOIN order_drawing dr ON dr.order_id = o.id
   WHERE o.drg_target_date >= ${TODAY_IST}
     AND o.drg_target_date <= ${TODAY_IST} + 7
     AND dr.drg_sent_to_client_date IS NULL

  UNION ALL
  -- Purchase (BOI) due to be received
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'purchase'::text, 'Purchase'::text,
         to_char(pl.purchase_target_date, 'YYYY-MM-DD'),
         (pl.purchase_target_date - ${TODAY_IST})::int
    FROM orders o
    JOIN order_planning pl ON pl.order_id = o.id
    LEFT JOIN order_purchase pu ON pu.order_id = o.id
   WHERE pl.purchase_target_date >= ${TODAY_IST}
     AND pl.purchase_target_date <= ${TODAY_IST} + 7
     AND pu.boi_receipt_date IS NULL

  UNION ALL
  -- QC docs due to be submitted
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'qc'::text, 'QC'::text,
         to_char(qc.qc_doc_target_date, 'YYYY-MM-DD'),
         (qc.qc_doc_target_date - ${TODAY_IST})::int
    FROM orders o JOIN order_qc qc ON qc.order_id = o.id
   WHERE qc.qc_doc_target_date >= ${TODAY_IST}
     AND qc.qc_doc_target_date <= ${TODAY_IST} + 7
     AND qc.qc_doc_actual_date IS NULL

  UNION ALL
  -- Planning readiness due before dispatch (Planning has no target date of
  -- its own, so it borrows the order's dispatch target)
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'planning'::text, 'Planning'::text,
         to_char(o.dispatch_target_date, 'YYYY-MM-DD'),
         (o.dispatch_target_date - ${TODAY_IST})::int
    FROM orders o
    LEFT JOIN order_planning pl ON pl.order_id = o.id
   WHERE o.dispatch_target_date >= ${TODAY_IST}
     AND o.dispatch_target_date <= ${TODAY_IST} + 7
     AND pl.planning_readiness_date IS NULL

  UNION ALL
  -- Dispatch due to be completed
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'dispatch'::text, 'Assembly & Dispatch'::text,
         to_char(o.dispatch_target_date, 'YYYY-MM-DD'),
         (o.dispatch_target_date - ${TODAY_IST})::int
    FROM orders o
    LEFT JOIN order_assembly_dispatch ad ON ad.order_id = o.id
   WHERE o.dispatch_target_date >= ${TODAY_IST}
     AND o.dispatch_target_date <= ${TODAY_IST} + 7
     AND (ad.dispatch_status IS NULL OR btrim(ad.dispatch_status) = '')
     AND ad.actual_packing_date IS NULL
`;

function tierOf(daysLeft: number): ReminderTier {
  if (daysLeft <= 1) return "24h";
  if (daysLeft <= 3) return "72h";
  return "7d";
}

/** Upcoming deadlines, soonest first. Optionally limited to some departments. */
export async function listReminders(
  depts?: ReminderDept[]
): Promise<ReminderRow[]> {
  const filter = depts && depts.length > 0 ? depts : null;
  const result = await query<Omit<ReminderRow, "tier"> & { days_left: number }>(
    `SELECT * FROM (${REMINDERS_SQL}) r
      WHERE ($1::text[] IS NULL OR r.dept = ANY($1))
      ORDER BY r.days_left ASC, r.sl_no ASC`,
    [filter]
  );
  return result.rows.map((r) => ({
    ...r,
    sl_no: Number(r.sl_no),
    days_left: Number(r.days_left),
    tier: tierOf(Number(r.days_left)),
  }));
}

/** Reminders for one department (used on that department's workspace page). */
export async function listRemindersForDepartment(
  dept: ReminderDept
): Promise<ReminderRow[]> {
  return listReminders([dept]);
}

/**
 * Reminders relevant to a role: their own department, or every department for
 * Central Visibility / Admin oversight.
 */
export async function listRemindersForRole(role: string): Promise<ReminderRow[]> {
  if (isCentral(role)) return listReminders();
  const dept = reminderDeptForRole(role);
  return dept ? listReminders([dept]) : [];
}

/** Reminder count for a department role (0 for roles without a deadline). */
export async function countRemindersForRole(role: string): Promise<number> {
  const dept = reminderDeptForRole(role);
  if (!dept) return 0;
  return (await listReminders([dept])).length;
}
