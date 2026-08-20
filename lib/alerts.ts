import { query } from "@/lib/db";

// The DB session runs in UTC, but the business operates on IST days. Deadlines
// are calendar dates, so "today" must be the IST calendar date, not the UTC
// one — otherwise the day boundary is off by up to 5.5 hours.
const TODAY_IST = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

export type AlertRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  ec_no: string | null;
  party: string | null;
  department: string;
  type: "overdue" | "ld_risk" | "hold";
  due_date: string | null;
  days_overdue: number | null;
};

// Every branch surfaces one kind of delay/escalation. A department is "overdue"
// when its target date has passed but the completing step hasn't happened. The
// department steps are now per EC (order_items); the row `id` is the parent SO
// so "Open" lands on the SO detail. Payment holds stay SO-level.
const ALERTS_SQL = `
  -- Drawing not sent by its target date. Target is SO-level; the "sent"
  -- date lives per EC on order_drawing, so an SO stays overdue while ANY EC
  -- hasn't been sent yet.
  SELECT o.id, o.sl_no::int AS sl_no, o.so_no, NULL::text AS ec_no, o.party,
         'Drawing'::text AS department, 'overdue'::text AS type,
         to_char(o.drg_target_date, 'YYYY-MM-DD') AS due_date,
         (${TODAY_IST} - o.drg_target_date)::int AS days_overdue
    FROM orders o
   WHERE o.drg_target_date < ${TODAY_IST}
     AND EXISTS (
       SELECT 1 FROM order_items it
        LEFT JOIN order_drawing dr ON dr.item_id = it.id
        WHERE it.order_id = o.id AND dr.drg_sent_to_client_date IS NULL
     )

  UNION ALL
  -- Purchase (BOI items) not all received by the target date. SO-level target
  -- and BOI flag; SO stays overdue while any EC still has pending items.
  SELECT o.id, o.sl_no::int, o.so_no, NULL::text AS ec_no, o.party,
         'Purchase'::text, 'overdue'::text,
         to_char(o.purchase_target_date, 'YYYY-MM-DD'),
         (${TODAY_IST} - o.purchase_target_date)::int
    FROM orders o
   WHERE o.boi = 'Yes'
     AND o.purchase_target_date < ${TODAY_IST}
     AND EXISTS (
       SELECT 1 FROM order_items it
        WHERE it.order_id = o.id
          AND (
            NOT EXISTS (SELECT 1 FROM order_boi_items b WHERE b.item_id = it.id)
            OR EXISTS (SELECT 1 FROM order_boi_items b
                        WHERE b.item_id = it.id AND b.receipt_date IS NULL)
          )
     )

  UNION ALL
  -- QC docs not submitted by target date (LD risk). SO-level target; SO stays
  -- overdue while ANY EC hasn't submitted its actual date yet.
  SELECT o.id, o.sl_no::int, o.so_no, NULL::text AS ec_no, o.party,
         'QC'::text, 'ld_risk'::text,
         to_char(o.qc_doc_target_date, 'YYYY-MM-DD'),
         (${TODAY_IST} - o.qc_doc_target_date)::int
    FROM orders o
   WHERE o.qc_doc_target_date < ${TODAY_IST}
     AND (o.qc_required IS NULL OR o.qc_required <> 'No')
     AND EXISTS (
       SELECT 1 FROM order_items it
        LEFT JOIN order_qc qc ON qc.item_id = it.id
        WHERE it.order_id = o.id AND qc.qc_doc_actual_date IS NULL
     )

  UNION ALL
  -- Dispatch not done by the dispatch team's target date (SO-level target);
  -- the SO stays overdue while any EC hasn't been packed yet.
  SELECT o.id, o.sl_no::int, o.so_no, NULL::text AS ec_no, o.party,
         'Assembly & Packing'::text, 'overdue'::text,
         to_char(o.dispatch_team_target_date, 'YYYY-MM-DD'),
         (${TODAY_IST} - o.dispatch_team_target_date)::int
    FROM orders o
   WHERE o.dispatch_team_target_date < ${TODAY_IST}
     AND (o.dispatch_status IS NULL OR o.dispatch_status = 'Pending')
     AND EXISTS (
       SELECT 1 FROM order_items it
        LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
        WHERE it.order_id = o.id AND ad.actual_packing_date IS NULL
     )

  UNION ALL
  -- Payment on hold (escalated to Central Visibility, SO-level)
  SELECT o.id, o.sl_no::int, o.so_no, NULL::text AS ec_no, o.party,
         'Accounts'::text, 'hold'::text,
         NULL::text, NULL::int
    FROM orders o JOIN order_accounts a ON a.order_id = o.id
   WHERE lower(a.payment_status) = 'outstanding hold'
`;

/** All active alerts, escalations first, then most overdue. */
export async function listAlerts(): Promise<AlertRow[]> {
  try {
    const result = await query<AlertRow>(
      `SELECT * FROM (${ALERTS_SQL}) a
        ORDER BY days_overdue DESC NULLS FIRST, sl_no ASC`
    );
    return result.rows;
  } catch (error) {
    // The orders table is mid-restructure and some columns this query relies
    // on (target dates) are temporarily gone — degrade to "no alerts" rather
    // than taking down every page that calls this (layout.tsx counts it on
    // every request). Remove this guard once those columns are back.
    console.error("listAlerts failed (orders columns may be missing):", error);
    return [];
  }
}

/** Count of active alerts (for the sidebar badge). */
export async function countAlerts(): Promise<number> {
  try {
    const result = await query<{ count: number }>(
      `SELECT count(*)::int AS count FROM (${ALERTS_SQL}) a`
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    console.error("countAlerts failed (orders columns may be missing):", error);
    return 0;
  }
}
