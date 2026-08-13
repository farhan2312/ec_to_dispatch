import { query } from "@/lib/db";
import { isCentral, reminderDeptForRole, type ReminderDept } from "@/lib/roles";

// The DB session runs in UTC, but the business operates on IST days. Deadlines
// are calendar dates, so "today" must be the IST calendar date, not the UTC
// one — otherwise the day boundary is off by up to 5.5 hours.
const TODAY_IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

// Planning works to the EC's dispatch target — but once Central Visibility
// revises that date, the revised one is the deadline that counts.
const PLANNING_DUE =
  "COALESCE(it.dispatch_target_revised_date, it.dispatch_target_date)";

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
  -- Drawing due to be sent to the client (per EC). The target date is on the
  -- EC item; the "sent" date lives on order_drawing, which may not exist yet —
  -- so LEFT JOIN, or a fresh EC would be missed.
  SELECT o.id, o.sl_no::int AS sl_no, o.so_no, it.ec_no, o.party,
         'drawing'::text AS dept, 'Drawing'::text AS department,
         to_char(it.drg_target_date, 'YYYY-MM-DD') AS due_date,
         (it.drg_target_date - ${TODAY_IST})::int AS days_left
    FROM order_items it
    JOIN orders o ON o.id = it.order_id
    LEFT JOIN order_drawing dr ON dr.item_id = it.id
   WHERE it.drg_target_date >= ${TODAY_IST}
     AND it.drg_target_date <= ${TODAY_IST} + 7
     AND dr.drg_sent_to_client_date IS NULL

  UNION ALL
  -- Purchase (BOI items) due to be received (per EC). Only when the SO needs
  -- BOI and some item is still pending (or none added yet).
  SELECT o.id, o.sl_no::int, o.so_no, it.ec_no, o.party,
         'purchase'::text, 'Purchase'::text,
         to_char(pl.purchase_target_date, 'YYYY-MM-DD'),
         (pl.purchase_target_date - ${TODAY_IST})::int
    FROM order_items it
    JOIN orders o ON o.id = it.order_id
    JOIN order_planning pl ON pl.item_id = it.id
   WHERE o.boi = 'Yes'
     AND pl.purchase_target_date >= ${TODAY_IST}
     AND pl.purchase_target_date <= ${TODAY_IST} + 7
     AND (NOT EXISTS (SELECT 1 FROM order_boi_items b WHERE b.item_id = it.id)
          OR EXISTS (SELECT 1 FROM order_boi_items b WHERE b.item_id = it.id AND b.receipt_date IS NULL))

  UNION ALL
  -- QC docs due to be submitted (per EC)
  SELECT o.id, o.sl_no::int, o.so_no, it.ec_no, o.party,
         'qc'::text, 'QC'::text,
         to_char(it.qc_doc_target_date, 'YYYY-MM-DD'),
         (it.qc_doc_target_date - ${TODAY_IST})::int
    FROM order_items it
    JOIN orders o ON o.id = it.order_id
    LEFT JOIN order_qc qc ON qc.item_id = it.id
   WHERE it.qc_doc_target_date >= ${TODAY_IST}
     AND it.qc_doc_target_date <= ${TODAY_IST} + 7
     AND qc.qc_doc_actual_date IS NULL
     AND (o.qc_required IS NULL OR o.qc_required <> 'No')

  UNION ALL
  -- Planning readiness due before dispatch (per EC). Planning has no target
  -- date of its own, so it borrows the EC's dispatch target — revised if set.
  SELECT o.id, o.sl_no::int, o.so_no, it.ec_no, o.party,
         'planning'::text, 'Planning'::text,
         to_char(${PLANNING_DUE}, 'YYYY-MM-DD'),
         (${PLANNING_DUE} - ${TODAY_IST})::int
    FROM order_items it
    JOIN orders o ON o.id = it.order_id
    LEFT JOIN order_planning pl ON pl.item_id = it.id
   WHERE ${PLANNING_DUE} >= ${TODAY_IST}
     AND ${PLANNING_DUE} <= ${TODAY_IST} + 7
     AND pl.planning_readiness_date IS NULL

  UNION ALL
  -- Assembly & Dispatch due to complete, against the dispatch team's own
  -- target date (per EC).
  SELECT o.id, o.sl_no::int, o.so_no, it.ec_no, o.party,
         'dispatch'::text, 'Assembly & Dispatch'::text,
         to_char(ad.dispatch_team_target_date, 'YYYY-MM-DD'),
         (ad.dispatch_team_target_date - ${TODAY_IST})::int
    FROM order_items it
    JOIN orders o ON o.id = it.order_id
    JOIN order_assembly_dispatch ad ON ad.item_id = it.id
   WHERE ad.dispatch_team_target_date >= ${TODAY_IST}
     AND ad.dispatch_team_target_date <= ${TODAY_IST} + 7
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
  try {
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
  } catch (error) {
    // The orders table is mid-restructure and some columns this query relies
    // on (target dates, QC Needed) are temporarily gone — degrade to "no
    // reminders" rather than taking down every page that calls this
    // (app/risansi/layout.tsx counts it on every request, for every role).
    // Remove this guard once those columns are back.
    console.error("listReminders failed (orders columns may be missing):", error);
    return [];
  }
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
