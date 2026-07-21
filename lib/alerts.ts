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
// when its target date has passed but the completing step hasn't happened.
const ALERTS_SQL = `
  -- Drawing not sent by its target date
  SELECT o.id, o.sl_no::int AS sl_no, o.so_no, o.ec_no, o.party,
         'Drawing'::text AS department, 'overdue'::text AS type,
         to_char(o.drg_target_date, 'YYYY-MM-DD') AS due_date,
         (${TODAY_IST} - o.drg_target_date)::int AS days_overdue
    FROM orders o JOIN order_drawing dr ON dr.order_id = o.id
   WHERE o.drg_target_date < ${TODAY_IST}
     AND dr.drg_sent_to_client_date IS NULL

  UNION ALL
  -- Purchase (BOI) not received by its target date
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'Purchase'::text, 'overdue'::text,
         to_char(pl.purchase_target_date, 'YYYY-MM-DD'),
         (${TODAY_IST} - pl.purchase_target_date)::int
    FROM orders o
    JOIN order_planning pl ON pl.order_id = o.id
    LEFT JOIN order_purchase pu ON pu.order_id = o.id
   WHERE pl.purchase_target_date < ${TODAY_IST}
     AND pu.boi_receipt_date IS NULL

  UNION ALL
  -- QC docs not submitted by target date (LD risk)
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'QC'::text, 'ld_risk'::text,
         to_char(qc.qc_doc_target_date, 'YYYY-MM-DD'),
         (${TODAY_IST} - qc.qc_doc_target_date)::int
    FROM orders o JOIN order_qc qc ON qc.order_id = o.id
   WHERE qc.qc_doc_target_date < ${TODAY_IST}
     AND qc.qc_doc_actual_date IS NULL

  UNION ALL
  -- Dispatch not done by its target date
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'Assembly & Dispatch'::text, 'overdue'::text,
         to_char(o.dispatch_target_date, 'YYYY-MM-DD'),
         (${TODAY_IST} - o.dispatch_target_date)::int
    FROM orders o
    LEFT JOIN order_assembly_dispatch ad ON ad.order_id = o.id
   WHERE o.dispatch_target_date < ${TODAY_IST}
     AND (ad.dispatch_status IS NULL OR btrim(ad.dispatch_status) = '')
     AND ad.actual_packing_date IS NULL

  UNION ALL
  -- Payment on hold (escalated to Central Visibility)
  SELECT o.id, o.sl_no::int, o.so_no, o.ec_no, o.party,
         'Accounts'::text, 'hold'::text,
         NULL::text, NULL::int
    FROM orders o JOIN order_accounts a ON a.order_id = o.id
   WHERE lower(a.payment_status) = 'outstanding hold'
`;

/** All active alerts, escalations first, then most overdue. */
export async function listAlerts(): Promise<AlertRow[]> {
  const result = await query<AlertRow>(
    `SELECT * FROM (${ALERTS_SQL}) a
      ORDER BY days_overdue DESC NULLS FIRST, sl_no ASC`
  );
  return result.rows;
}

/** Count of active alerts (for the sidebar badge). */
export async function countAlerts(): Promise<number> {
  const result = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM (${ALERTS_SQL}) a`
  );
  return Number(result.rows[0]?.count ?? 0);
}
