// Which of an SO's own details Central Visibility has not filled in yet.
//
// The list of fields is not kept here — it is the Order details section from
// order-schema.ts, the same definition the form renders. A field is only
// counted as missing when it applies: `dependsOn` gates it off (LD Date with
// LD = No, the Purchase target with BOI = No) it is not a gap, exactly as the
// form does not show it.
//
// The check runs in SQL rather than over loaded rows so the modal can page and
// search across every SO without shipping the tracker to the browser.

import { query } from "@/lib/db";
import { SECTION_BY_TABLE, type OrderField } from "@/lib/order-schema";

export type OrderGapRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  client_name: string | null;
  so_date: string | null;
  /** The labels of the fields still blank, in the order the form shows them. */
  missing: string[];
};

/** A string literal for SQL — labels and option values come from the schema. */
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

/**
 * Fields whose blankness is the normal state, not an omission. A revised
 * dispatch date only exists once a date has actually been moved, so an order
 * running to its original target is not waiting on anything.
 */
const NOT_A_GAP = new Set(["dispatch_target_revised_date"]);

/** The fields the check covers: everything the Order details form asks for. */
const GAP_FIELDS: OrderField[] = (SECTION_BY_TABLE.get("orders")?.fields ?? []).filter(
  // A computed value is derived, never typed, so it is nobody's omission.
  (f) => !f.computed && !NOT_A_GAP.has(f.column)
);

/** "This field has a value." */
function filledSql(f: OrderField): string {
  // The prose field is not typed into any more — the terms themselves are the
  // lines beneath it — so either one counts as the terms being recorded.
  if (f.column === "payment_terms") {
    return `(nullif(btrim(o.payment_terms::text), '') IS NOT NULL
             OR EXISTS (SELECT 1 FROM order_payment_terms t WHERE t.order_id = o.id))`;
  }
  return `nullif(btrim(o.${f.column}::text), '') IS NOT NULL`;
}

/** "This field applies to this order" — the dependsOn gate, in SQL. */
function appliesSql(f: OrderField): string {
  if (!f.dependsOn) return "TRUE";
  return f.dependsOn
    .map((d) => {
      const values = Array.isArray(d.value) ? d.value : [d.value];
      return `lower(btrim(coalesce(o.${d.column}::text, ''))) IN (${values
        .map((v) => lit(v.trim().toLowerCase()))
        .join(", ")})`;
    })
    .join(" AND ");
}

/** The labels of every field that applies and is still blank, as a text[]. */
const MISSING_SQL = `array_remove(ARRAY[
  ${GAP_FIELDS.map(
    (f) =>
      `CASE WHEN (${appliesSql(f)}) AND NOT (${filledSql(f)}) THEN ${lit(f.label)} END`
  ).join(",\n  ")}
]::text[], NULL)`;

/** How many SOs one scroll of the list fetches. */
export const GAP_BATCH = 10;

/** How many fields the check looks at on an order with no gates closed. */
export const GAP_FIELD_COUNT = GAP_FIELDS.length;

/**
 * One batch of SOs with details still blank, newest serial last, narrowed by
 * an optional search on SO number / client / serial. `total` is every SO with
 * a gap, not just this batch, so the modal can say how far it has scrolled.
 */
export async function listOrderGaps(opts: {
  offset: number;
  limit: number;
  search: string;
}): Promise<{ rows: OrderGapRow[]; total: number }> {
  const term = opts.search.trim();
  const like = term === "" ? null : `%${term}%`;

  const result = await query<OrderGapRow & { total: number }>(
    `WITH checked AS (
       SELECT o.id,
              o.sl_no::int AS sl_no,
              o.so_no,
              o.client_name,
              to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
              ${MISSING_SQL} AS missing
         FROM orders o
        WHERE ($1::text IS NULL
               OR o.so_no ILIKE $1
               OR o.client_name ILIKE $1
               OR o.client_code ILIKE $1
               OR o.po_no ILIKE $1
               OR o.sl_no::text ILIKE $1)
     )
     SELECT id, sl_no, so_no, client_name, so_date, missing,
            count(*) OVER ()::int AS total
       FROM checked
      WHERE cardinality(missing) > 0
      ORDER BY sl_no
      LIMIT $2 OFFSET $3`,
    [like, opts.limit, opts.offset]
  );

  return {
    rows: result.rows.map(({ total: _total, ...row }) => row),
    total: Number(result.rows[0]?.total ?? 0),
  };
}
