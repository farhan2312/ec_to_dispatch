import { query, withTransaction } from "@/lib/db";
import type { PoolClient } from "pg";
import type { TargetDate, TargetRevision } from "@/lib/target-dates";
import {
  isPerEcDept,
  NOT_APPLICABLE,
  PENDING,
  type DeptFilterKey,
} from "@/lib/dept-status";
import {
  PAGE_SIZE,
  clampPage,
  likePattern,
  offsetFor,
  pageResult,
  type PageResult,
} from "@/lib/pagination";
import {
  CHILD_FIELDS,
  coerceField,
  SECTION_BY_TABLE,
  type ChildTable,
  type OrderTable,
} from "@/lib/order-schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Columns still dropped from `orders` (trimmed to Client + Purchase Order
// Details + the SO-level commercial flags). A context field referencing one of
// these resolves to NULL rather than erroring with "column does not exist".
// The per-pump attributes now live on order_items, not orders.
const DROPPED_ORDER_COLUMNS = new Set([
  "ec_no",
  "ec_generated_date",
  "ec_rcvd_operations_date",
  "ec_sent_production_date",
  "file_no",
  "item",
  "model_no",
  "pump_qty",
  "pump_sno",
  "orientation",
  "liquid_application",
  "version",
  "project",
  "master_reason_of_delay",
]);

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// SO (orders) — Client + Purchase Order Details + SO-level commercial flags
// ---------------------------------------------------------------------------

/** One EC/pump summary, embedded in the SO list and SO detail. Dispatch
 *  status is intentionally absent — it's an SO-level value, carried on
 *  OrderListRow, not per EC. */
export type ItemSummary = {
  id: string;
  seq: number;
  ec_no: string | null;
  ec_date: string | null;
  item_type: string | null;
  pump_type: string | null;
  model_no: string | null;
  internal_model: string | null;
  version: string | null;
  quantity: string | null;
};

/** A row in the master SO list — one per sales order, with its EC items. */
export type OrderListRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  so_date: string | null;
  client_name: string | null;
  client_code: string | null;
  reps: string | null;
  zone: string | null;
  po_no: string | null;
  order_type: string | null;
  order_value: string | null;
  payment_status: string | null;
  // SO-level, derived from this SO's invoices (see recomputeDispatchStatus).
  dispatch_status: string | null;
  ec_count: number;
  items: ItemSummary[];
};

/** Fields captured when creating an SO (the core `orders` identity row). */
export type NewOrderInput = {
  so_no?: string;
  so_date?: string;
  client_code?: string;
  client_type?: string;
  client_name?: string;
  reps?: string;
  market_type?: string;
  zone?: string;
  industry_type?: string;
  order_type?: string;
  bill_type?: string;
  boi?: string;
  qc_required?: string;
  quotation_no?: string;
  po_no?: string;
  customer_po_date?: string;
  freight_terms?: string;
  packing_requirement?: string;
  delivery_date_as_per_so?: string;
  payment_terms?: string;
  ld?: string;
  ld_date?: string;
  order_value?: string;
  order_currency?: string;
  total_quantity?: string;
  drg_target_date?: string;
  dispatch_target_date?: string;
  dispatch_target_revised_date?: string;
  qc_doc_target_date?: string;
  purchase_target_date?: string;
  dispatch_team_target_date?: string;
  packing_details_required?: string;
};

/** Fields captured when adding an EC/pump item (the Add-On form). */
export type NewItemInput = {
  ec_no?: string;
  ec_date?: string;
  item_type?: string;
  pump_type?: string;
  model_no?: string;
  internal_model?: string;
  quantity?: string;
  orientation?: string;
  suction?: string;
  delivery?: string;
  pump_sno?: string;
  application?: string;
  version?: string;
};

function nullify(value?: string): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function toInt(value?: string): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

function toNumeric(value?: string): number | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

/** Insert a new SO. Its EC items and department detail are added afterwards. */
export async function createOrder(
  input: NewOrderInput
): Promise<{ id: string; sl_no: number }> {
  const result = await query<{ id: string; sl_no: number }>(
    `INSERT INTO orders (
        so_no, so_date, client_code, client_type, client_name, reps,
        market_type, zone, industry_type, quotation_no, po_no, customer_po_date,
        order_value, order_currency, qc_required, payment_terms, ld, ld_date,
        freight_terms, packing_requirement, delivery_date_as_per_so,
        order_type, bill_type, boi,
        total_quantity, drg_target_date, dispatch_target_date,
        dispatch_target_revised_date, qc_doc_target_date, purchase_target_date,
        packing_details_required, dispatch_team_target_date
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
     )
     RETURNING id, sl_no::int AS sl_no`,
    [
      nullify(input.so_no),
      nullify(input.so_date),
      nullify(input.client_code),
      nullify(input.client_type),
      nullify(input.client_name),
      nullify(input.reps),
      nullify(input.market_type),
      nullify(input.zone),
      nullify(input.industry_type),
      nullify(input.quotation_no),
      nullify(input.po_no),
      nullify(input.customer_po_date),
      toNumeric(input.order_value),
      nullify(input.order_currency),
      nullify(input.qc_required),
      nullify(input.payment_terms),
      nullify(input.ld),
      nullify(input.ld_date),
      nullify(input.freight_terms),
      nullify(input.packing_requirement),
      nullify(input.delivery_date_as_per_so),
      nullify(input.order_type),
      nullify(input.bill_type),
      nullify(input.boi),
      toInt(input.total_quantity),
      nullify(input.drg_target_date),
      nullify(input.dispatch_target_date),
      nullify(input.dispatch_target_revised_date),
      nullify(input.qc_doc_target_date),
      nullify(input.purchase_target_date),
      nullify(input.packing_details_required),
      nullify(input.dispatch_team_target_date),
    ]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// EC items (order_items) — one row per pump/spare under an SO
// ---------------------------------------------------------------------------

/** Add an EC/pump item to an SO (the Add-On form). */
export async function createItem(
  orderId: string,
  input: NewItemInput
): Promise<{ id: string; seq: number }> {
  const result = await query<{ id: string; seq: number }>(
    `INSERT INTO order_items (
        order_id, ec_no, ec_date, item_type, pump_type, model_no, internal_model,
        quantity, orientation, suction, delivery, pump_sno, application, version
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
     )
     RETURNING id, seq::int AS seq`,
    [
      orderId,
      nullify(input.ec_no),
      nullify(input.ec_date),
      nullify(input.item_type),
      nullify(input.pump_type),
      nullify(input.model_no),
      nullify(input.internal_model),
      toInt(input.quantity),
      nullify(input.orientation),
      nullify(input.suction),
      nullify(input.delivery),
      nullify(input.pump_sno),
      nullify(input.application),
      nullify(input.version),
    ]
  );
  return result.rows[0];
}

/** Save the Order Copy file bytes onto an EC (Spare form's file upload). */
export async function setItemOrderCopy(
  itemId: string,
  file: { name: string; mimeType: string | null; size: number; data: Buffer }
): Promise<void> {
  if (!UUID_RE.test(itemId)) return;
  await query(
    `UPDATE order_items
        SET order_copy_file_name = $2,
            order_copy_mime_type = $3,
            order_copy_file_size = $4,
            order_copy_file_data = $5
      WHERE id = $1`,
    [itemId, file.name, file.mimeType, file.size, file.data]
  );
}

/** Fetch the Order Copy file bytes for one EC (download route). */
export async function getItemOrderCopy(
  itemId: string
): Promise<{ file_name: string; mime_type: string | null; file_data: Buffer } | null> {
  if (!UUID_RE.test(itemId)) return null;
  const result = await query<{
    order_copy_file_name: string | null;
    order_copy_mime_type: string | null;
    order_copy_file_data: Buffer | null;
  }>(
    `SELECT order_copy_file_name, order_copy_mime_type, order_copy_file_data
       FROM order_items WHERE id = $1`,
    [itemId]
  );
  const row = result.rows[0];
  if (!row?.order_copy_file_data || !row.order_copy_file_name) return null;
  return {
    file_name: row.order_copy_file_name,
    mime_type: row.order_copy_mime_type,
    file_data: row.order_copy_file_data,
  };
}

/** Delete an EC item (cascades to its department detail and lots). */
export async function deleteItem(id: string): Promise<void> {
  if (!UUID_RE.test(id)) return;
  await query(`DELETE FROM order_items WHERE id = $1`, [id]);
}

/** The EC items under one SO (summary shape). */
export async function listItems(orderId: string): Promise<ItemSummary[]> {
  if (!UUID_RE.test(orderId)) return [];
  const result = await query<ItemSummary>(
    `SELECT it.id,
            it.seq::int AS seq,
            it.ec_no,
            to_char(it.ec_date, 'YYYY-MM-DD') AS ec_date,
            it.item_type,
            it.pump_type,
            it.model_no,
            it.quantity::text AS quantity,
            o.dispatch_status
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
      WHERE it.order_id = $1
      ORDER BY it.seq ASC`,
    [orderId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Detail reads
// ---------------------------------------------------------------------------

// SO detail — the "Open" view: Client + Purchase Order + Billing + Accounts,
// plus the list of its EC items.
export type OrderDetail = {
  order: Row;
  order_billing: Row | null;
  order_accounts: Row | null;
  order_billing_docs: Row[];
  order_invoices: Row[];
  items: Row[];
};

/** SO detail: core + billing + accounts + its PI list + EC items. */
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const result = await query<OrderDetail>(
    `SELECT
        to_jsonb(o)  AS order,
        to_jsonb(b)  AS order_billing,
        to_jsonb(ac) AS order_accounts,
        COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.seq)
                  FROM order_billing_docs d WHERE d.order_id = o.id),
                 '[]'::jsonb) AS order_billing_docs,
        COALESCE((SELECT jsonb_agg(to_jsonb(inv) ORDER BY inv.seq)
                  FROM order_invoices inv WHERE inv.order_id = o.id),
                 '[]'::jsonb) AS order_invoices,
        -- EC items only. Dispatch status is NOT aliased in here: it's an
        -- SO-level value (o.dispatch_status above), and copying it onto every
        -- EC made identical values look per-EC.
        COALESCE((
          SELECT jsonb_agg(to_jsonb(it) ORDER BY it.seq)
            FROM order_items it
           WHERE it.order_id = o.id
        ), '[]'::jsonb) AS items
       FROM orders o
       LEFT JOIN order_billing b   ON b.order_id  = o.id
       LEFT JOIN order_accounts ac ON ac.order_id = o.id
      WHERE o.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

// EC item detail — the item attributes plus its per-EC department sections.
// The SO-level billing/accounts are included too (repeated per EC) so a bulk
// export can carry every column on one row.
export type ItemDetail = {
  item: Row;
  order: Row;
  order_billing: Row | null;
  order_accounts: Row | null;
  order_drawing: Row | null;
  order_purchase: Row | null;
  order_qc: Row | null;
  order_planning: Row | null;
  order_assembly_dispatch: Row | null;
  order_lots: Row[];
  order_boi_items: Row[];
  order_billing_docs: Row[];
  order_packing_slips: Row[];
  order_drawing_revisions: Row[];
};

const ITEM_DETAIL_SELECT = `
    to_jsonb(it) AS item,
    to_jsonb(o)  AS order,
    to_jsonb(b)  AS order_billing,
    to_jsonb(ac) AS order_accounts,
    to_jsonb(dr) AS order_drawing,
    to_jsonb(pu) AS order_purchase,
    to_jsonb(qc) AS order_qc,
    to_jsonb(pl) AS order_planning,
    to_jsonb(ad) AS order_assembly_dispatch,
    COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at)
              FROM order_lots l WHERE l.item_id = it.id), '[]'::jsonb) AS order_lots,
    COALESCE((SELECT jsonb_agg(to_jsonb(bi) ORDER BY bi.created_at)
              FROM order_boi_items bi WHERE bi.item_id = it.id), '[]'::jsonb) AS order_boi_items,
    COALESCE((SELECT jsonb_agg(to_jsonb(bd) ORDER BY bd.seq)
              FROM order_billing_docs bd WHERE bd.order_id = o.id), '[]'::jsonb) AS order_billing_docs,
    COALESCE((SELECT jsonb_agg(to_jsonb(ps) ORDER BY ps.seq)
              FROM order_packing_slips ps WHERE ps.item_id = it.id), '[]'::jsonb) AS order_packing_slips,
    COALESCE((SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.seq)
              FROM order_drawing_revisions rv WHERE rv.item_id = it.id), '[]'::jsonb) AS order_drawing_revisions
   FROM order_items it
   JOIN orders o                        ON o.id  = it.order_id
   LEFT JOIN order_billing b            ON b.order_id  = o.id
   LEFT JOIN order_accounts ac          ON ac.order_id = o.id
   LEFT JOIN order_drawing dr           ON dr.item_id = it.id
   LEFT JOIN order_purchase pu          ON pu.item_id = it.id
   LEFT JOIN order_qc qc                ON qc.item_id = it.id
   LEFT JOIN order_planning pl          ON pl.item_id = it.id
   LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id`;

/** Full per-EC record: item + parent SO + all department detail + lots. */
export async function getItemDetail(itemId: string): Promise<ItemDetail | null> {
  if (!UUID_RE.test(itemId)) return null;
  const result = await query<ItemDetail>(
    `SELECT ${ITEM_DETAIL_SELECT} WHERE it.id = $1`,
    [itemId]
  );
  return result.rows[0] ?? null;
}

/**
 * Per-EC records for bulk export (same shape as getItemDetail). `orderIds`
 * limits to items under those SOs; omitted, returns every item. Ordered by
 * SO Sl. No. then EC sequence.
 */
export async function listItemDetails(orderIds?: string[]): Promise<ItemDetail[]> {
  const result = await query<ItemDetail>(
    `SELECT ${ITEM_DETAIL_SELECT}
      ${orderIds ? "WHERE it.order_id = ANY($1)" : ""}
      ORDER BY o.sl_no ASC, it.seq ASC`,
    orderIds ? [orderIds] : []
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** One EC with every per-EC section and child list hanging off it. */
export type OrderExportItem = {
  item: Row;
  order_drawing: Row | null;
  order_purchase: Row | null;
  order_qc: Row | null;
  order_planning: Row | null;
  order_assembly_dispatch: Row | null;
  // No order_lots: no section declares that child list, so nothing in the app
  // can create a lot row. The table and the dispatch register that reads it
  // are still here, but the export has nothing to show from them.
  order_boi_items: Row[];
  order_packing_slips: Row[];
  order_drawing_revisions: Row[];
  // File attachments: name/size/date only — never the bytes.
  order_qc_documents: Row[];
  order_qc_requirement_documents: Row[];
};

/** One SO with its SO-level sections, its PI/invoice lists, and its ECs. */
export type OrderExportRow = {
  order: Row;
  order_billing: Row | null;
  order_accounts: Row | null;
  order_billing_docs: Row[];
  order_invoices: Row[];
  items: OrderExportItem[];
};

/**
 * The whole tracker shaped the way the export sheet reads it: SO first, its
 * ECs nested underneath. Unlike listItemDetails (one flat row per EC) this
 * keeps SOs that have no EC yet — they are real orders and belong in the file.
 * `orderIds` limits to those SOs; omitted, returns every one.
 */
export async function listOrderExports(
  orderIds?: string[]
): Promise<OrderExportRow[]> {
  const result = await query<OrderExportRow>(
    `SELECT to_jsonb(o)  AS order,
            to_jsonb(b)  AS order_billing,
            to_jsonb(ac) AS order_accounts,
            COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.seq)
                        FROM order_billing_docs d WHERE d.order_id = o.id),
                     '[]'::jsonb) AS order_billing_docs,
            COALESCE((SELECT jsonb_agg((to_jsonb(inv) - 'lr_file_data') ORDER BY inv.seq)
                        FROM order_invoices inv WHERE inv.order_id = o.id),
                     '[]'::jsonb) AS order_invoices,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'item', to_jsonb(it) - 'order_copy_file_data',
                       'order_drawing', to_jsonb(dr),
                       'order_purchase', to_jsonb(pu),
                       'order_qc', to_jsonb(qc),
                       'order_planning', to_jsonb(pl),
                       'order_assembly_dispatch', to_jsonb(ad),
                       'order_boi_items', COALESCE((
                         SELECT jsonb_agg(to_jsonb(bi) ORDER BY bi.created_at)
                           FROM order_boi_items bi WHERE bi.item_id = it.id), '[]'::jsonb),
                       'order_qc_documents', COALESCE((
                         SELECT jsonb_agg(jsonb_build_object(
                                  'file_name', qd.file_name,
                                  'file_size', qd.file_size,
                                  'uploaded_at', qd.uploaded_at
                                ) ORDER BY qd.uploaded_at)
                           FROM order_qc_documents qd WHERE qd.item_id = it.id), '[]'::jsonb),
                       'order_qc_requirement_documents', COALESCE((
                         SELECT jsonb_agg(jsonb_build_object(
                                  'file_name', qr.file_name,
                                  'file_size', qr.file_size,
                                  'uploaded_at', qr.uploaded_at
                                ) ORDER BY qr.uploaded_at)
                           FROM order_qc_requirement_documents qr WHERE qr.item_id = it.id), '[]'::jsonb),
                       'order_packing_slips', COALESCE((
                         SELECT jsonb_agg(to_jsonb(ps) ORDER BY ps.seq)
                           FROM order_packing_slips ps WHERE ps.item_id = it.id), '[]'::jsonb),
                       'order_drawing_revisions', COALESCE((
                         SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.seq)
                           FROM order_drawing_revisions rv WHERE rv.item_id = it.id), '[]'::jsonb)
                     ) ORDER BY it.seq)
                FROM order_items it
                LEFT JOIN order_drawing dr            ON dr.item_id = it.id
                LEFT JOIN order_purchase pu           ON pu.item_id = it.id
                LEFT JOIN order_qc qc                 ON qc.item_id = it.id
                LEFT JOIN order_planning pl           ON pl.item_id = it.id
                LEFT JOIN order_assembly_dispatch ad  ON ad.item_id = it.id
               WHERE it.order_id = o.id
            ), '[]'::jsonb) AS items
       FROM orders o
       LEFT JOIN order_billing b   ON b.order_id  = o.id
       LEFT JOIN order_accounts ac ON ac.order_id = o.id
      WHERE ($1::uuid[] IS NULL OR o.id = ANY($1))
      ORDER BY o.sl_no ASC`,
    [orderIds ?? null]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Update one section of an SO or EC. `id` is the order_id for SO-scope sections
 * (orders/billing/accounts) or the item_id for item-scope sections (the EC
 * attributes + drawing/purchase/qc/planning/dispatch). Base tables (orders,
 * order_items) UPDATE by their own id; detail tables upsert on their key column.
 * Column names are validated against the section schema, never taken raw.
 */
export async function updateOrderSection(
  id: string,
  table: OrderTable,
  values: Record<string, string>
): Promise<void> {
  const section = SECTION_BY_TABLE.get(table);
  if (!section) throw new Error(`Unknown section table: ${table}`);

  // Computed fields (e.g. Balance of Payment) are never written from input —
  // they're derived server-side below.
  const fieldByColumn = new Map(section.fields.map((f) => [f.column, f]));
  const columns = Object.keys(values).filter(
    // Computed values are derived server-side; readOnly ones are owned by a
    // dedicated flow (target dates keep a revision history), so neither is
    // written from a section save even if the request carries them.
    (c) =>
      fieldByColumn.has(c) &&
      !fieldByColumn.get(c)!.computed &&
      !fieldByColumn.get(c)!.readOnly
  );

  if (columns.length > 0) {
    const coerced = columns.map((c) =>
      coerceField(fieldByColumn.get(c)!.type, values[c])
    );

    if (table === "orders" || table === "order_items") {
      // Base identity tables update by their own id.
      const setClause = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");
      await query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, [
        id,
        ...coerced,
      ]);
    } else {
      // 1:1 detail tables upsert on their key column: order_id for SO-scope
      // (billing/accounts), item_id for item-scope (drawing/purchase/qc/…).
      const keyCol = section.scope === "so" ? "order_id" : "item_id";
      const insertCols = [keyCol, ...columns];
      const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
      const updateClause = columns.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
      await query(
        `INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${placeholders})
         ON CONFLICT (${keyCol}) DO UPDATE SET ${updateClause}`,
        [id, ...coerced]
      );
    }
  }

  // Balance of Payment = order value − amount received. Recompute whenever
  // the accounts row or the SO's order value changes (both keyed by SO id).
  if (table === "order_accounts" || table === "orders") {
    await recomputeAccountsBalance(id);
  }
  // Dispatch status compares invoices against the SO's quantity/value, so a
  // change to either side restates it.
  if (table === "orders") {
    await recomputeDispatchStatus(id);
  }
}

/** Recompute the SO's accounts balance from order value and amount received. */
async function recomputeAccountsBalance(orderId: string): Promise<void> {
  if (!UUID_RE.test(orderId)) return;
  await query(
    `UPDATE order_accounts a
        SET balance_of_payment = o.order_value - COALESCE(a.amount_received, 0)
       FROM orders o
      WHERE a.order_id = o.id AND o.id = $1`,
    [orderId]
  );
}

// Which parent column each 1:many child hangs off: per-SO tables key on
// order_id, per-EC tables on item_id.
const CHILD_PARENT_COLUMN: Record<ChildTable, "order_id" | "item_id"> = {
  order_lots: "item_id",
  order_boi_items: "item_id",
  order_packing_slips: "item_id",
  order_drawing_revisions: "item_id",
  order_billing_docs: "order_id",
  order_invoices: "order_id",
};

/**
 * Add a blank child row. `kind` is only meaningful for packing slips, where
 * Planning files 'tentative' rows and Packing files 'actual' ones.
 */
export async function addChildRow(
  table: ChildTable,
  parentId: string,
  kind?: string
): Promise<{ id: string } | null> {
  const keyCol = CHILD_PARENT_COLUMN[table];
  const useKind = table === "order_packing_slips" && kind;
  const result = await query<{ id: string }>(
    useKind
      ? `INSERT INTO ${table} (${keyCol}, kind) VALUES ($1, $2) RETURNING id`
      : `INSERT INTO ${table} (${keyCol}) VALUES ($1) RETURNING id`,
    useKind ? [parentId, kind] : [parentId]
  );
  const row = result.rows[0] ?? null;
  if (row && table === "order_invoices") await recomputeDispatchStatus(parentId);
  return row;
}

/**
 * Bulk-insert PI rows into an SO's Operation card (order_billing_docs), for
 * the PI Excel upload. Each row is a { pi_no, pi_date, pi_value }; blank dates
 * and values become NULL. Returns how many were inserted.
 */
export async function insertBillingDocs(
  orderId: string,
  rows: { pi_no: string; pi_date: string | null; pi_value: string | null }[]
): Promise<number> {
  if (!UUID_RE.test(orderId) || rows.length === 0) return 0;
  let inserted = 0;
  for (const r of rows) {
    await query(
      `INSERT INTO order_billing_docs (order_id, pi_no, pi_date, pi_value)
       VALUES ($1, $2, $3::date, $4::numeric)`,
      [orderId, r.pi_no, r.pi_date, r.pi_value]
    );
    inserted += 1;
  }
  return inserted;
}

/** Update a child row's fields, validated against the child schema. */
export async function updateChildRow(
  table: ChildTable,
  id: string,
  values: Record<string, string>
): Promise<void> {
  if (!UUID_RE.test(id)) return;
  const byColumn = new Map(CHILD_FIELDS[table].map((f) => [f.column, f]));
  const columns = Object.keys(values).filter((c) => {
    const f = byColumn.get(c);
    return f !== undefined && !f.computed && !f.readOnly;
  });
  if (columns.length > 0) {
    const coerced = columns.map((c) =>
      coerceField(byColumn.get(c)!.type, values[c])
    );
    const setClause = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, [id, ...coerced]);
  }
  // Invoiced quantity/value drives the SO's dispatch status.
  if (table === "order_invoices") {
    await recomputeDispatchStatusForInvoice(id);
  }
}

/**
 * Recompute an SO's dispatch status from its invoices:
 *   • no invoice started            → Pending
 *   • invoiced qty AND value reach the SO's → Fully dispatch
 *   • otherwise (partially invoiced) → LOT dispatch
 *
 * Note: the ops spec writes "invoice > SO → Lot dispatch", which reads as a
 * typo — a lot (partial) dispatch is when the invoice falls SHORT of the SO.
 * Implemented as partial → LOT dispatch.
 */
export async function recomputeDispatchStatus(orderId: string): Promise<void> {
  if (!UUID_RE.test(orderId)) return;
  await query(
    `UPDATE orders o
        SET dispatch_status = CASE
              WHEN inv.n IS NULL OR inv.n = 0 THEN 'Pending'
              WHEN COALESCE(inv.qty, 0) >= COALESCE(o.total_quantity, 0)
               AND COALESCE(inv.val, 0) >= COALESCE(o.order_value, 0)
                THEN 'Fully dispatch'
              ELSE 'LOT dispatch'
            END
       FROM (
         -- Count a row as "started" if EITHER the invoice or the challan
         -- side has been filled in — Challan orders don't carry
         -- invoice_no/qty/value, they carry challan_value instead.
         SELECT COUNT(*) FILTER (
                  WHERE invoice_no IS NOT NULL OR challan_no IS NOT NULL
                        OR invoice_value IS NOT NULL OR challan_value IS NOT NULL
                ) AS n,
                SUM(COALESCE(invoice_quantity, packing_quantity, 0)) AS qty,
                SUM(COALESCE(invoice_value, challan_value, 0)) AS val
           FROM order_invoices WHERE order_id = $1
       ) inv
      WHERE o.id = $1`,
    [orderId]
  );
}

/**
 * When Packing saves an actual packing slip, upsert a matching invoice row
 * for Billing (one invoice per slip). EC / Packing Slip No. / Packing Qty
 * are copied to the invoice as read-only display columns so Billing's
 * add-on header shows which slip they're invoicing. Subsequent packing-slip
 * saves re-sync those three columns; Billing's own invoice fields are
 * untouched. Returns the SO/EC/slip context (for the follow-on notification)
 * or null if the slip isn't 'actual'.
 */
export async function upsertInvoiceFromPackingSlip(
  packingSlipId: string
): Promise<{
  order_id: string;
  ec_no: string | null;
  packing_slip_no: string | null;
  quantity: number | null;
} | null> {
  if (!UUID_RE.test(packingSlipId)) return null;
  const result = await query<{
    order_id: string;
    ec_no: string | null;
    packing_slip_no: string | null;
    quantity: number | null;
  }>(
    `WITH src AS (
       SELECT it.order_id, it.id AS item_id, it.ec_no,
              ps.id AS slip_id, ps.packing_slip_no, ps.quantity
         FROM order_packing_slips ps
         JOIN order_items it ON it.id = ps.item_id
        WHERE ps.id = $1 AND ps.kind = 'actual'
     ),
     up AS (
       INSERT INTO order_invoices (
         order_id, item_id, packing_slip_id,
         ec_no, packing_slip_no, packing_quantity
       )
       SELECT order_id, item_id, slip_id,
              ec_no, packing_slip_no, quantity
         FROM src
       ON CONFLICT (packing_slip_id) WHERE packing_slip_id IS NOT NULL DO UPDATE
         SET ec_no            = EXCLUDED.ec_no,
             packing_slip_no  = EXCLUDED.packing_slip_no,
             packing_quantity = EXCLUDED.packing_quantity
       RETURNING order_id
     )
     SELECT up.order_id, src.ec_no, src.packing_slip_no, src.quantity
       FROM up JOIN src ON src.order_id = up.order_id`,
    [packingSlipId]
  );
  const row = result.rows[0] ?? null;
  if (row) await recomputeDispatchStatus(row.order_id);
  return row;
}

/** Look up an SO's display label (so_no, falling back to #sl_no). */
export async function getOrderLabel(orderId: string): Promise<string | null> {
  if (!UUID_RE.test(orderId)) return null;
  const result = await query<{ so_no: string | null; sl_no: number }>(
    `SELECT so_no, sl_no::int AS sl_no FROM orders WHERE id = $1`,
    [orderId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return row.so_no ?? `#${row.sl_no}`;
}

/**
 * For any child row: return its parent order_id (needed to notify + revalidate
 * even when the caller only has the child id).
 */
export async function getChildOrderId(
  table: ChildTable,
  id: string
): Promise<string | null> {
  if (!UUID_RE.test(id)) return null;
  const parent = CHILD_PARENT_COLUMN[table];
  if (parent === "order_id") {
    const result = await query<{ order_id: string }>(
      `SELECT order_id FROM ${table} WHERE id = $1`,
      [id]
    );
    return result.rows[0]?.order_id ?? null;
  }
  const result = await query<{ order_id: string }>(
    `SELECT it.order_id
       FROM ${table} t JOIN order_items it ON it.id = t.item_id
      WHERE t.id = $1`,
    [id]
  );
  return result.rows[0]?.order_id ?? null;
}

/** Recompute via an invoice id (resolves its SO first). */
async function recomputeDispatchStatusForInvoice(invoiceId: string): Promise<void> {
  const result = await query<{ order_id: string }>(
    `SELECT order_id FROM order_invoices WHERE id = $1`,
    [invoiceId]
  );
  const orderId = result.rows[0]?.order_id;
  if (orderId) await recomputeDispatchStatus(orderId);
}

/** Save an invoice's LR attachment bytes. */
export async function setInvoiceLrFile(
  invoiceId: string,
  file: { name: string; mimeType: string | null; size: number; data: Buffer }
): Promise<void> {
  if (!UUID_RE.test(invoiceId)) return;
  await query(
    `UPDATE order_invoices
        SET lr_file_name = $2, lr_mime_type = $3, lr_file_size = $4, lr_file_data = $5
      WHERE id = $1`,
    [invoiceId, file.name, file.mimeType, file.size, file.data]
  );
}

/** Fetch an invoice's LR attachment for download. */
export async function getInvoiceLrFile(
  invoiceId: string
): Promise<{ file_name: string; mime_type: string | null; file_data: Buffer } | null> {
  if (!UUID_RE.test(invoiceId)) return null;
  const result = await query<{
    lr_file_name: string | null;
    lr_mime_type: string | null;
    lr_file_data: Buffer | null;
  }>(
    `SELECT lr_file_name, lr_mime_type, lr_file_data FROM order_invoices WHERE id = $1`,
    [invoiceId]
  );
  const row = result.rows[0];
  if (!row?.lr_file_data || !row.lr_file_name) return null;
  return {
    file_name: row.lr_file_name,
    mime_type: row.lr_mime_type,
    file_data: row.lr_file_data,
  };
}

/** Delete a child row by id. */
export async function deleteChildRow(
  table: ChildTable,
  id: string
): Promise<void> {
  if (!UUID_RE.test(id)) return;
  if (table === "order_invoices") {
    // Capture the SO before the row goes, then restate its dispatch status.
    const owner = await query<{ order_id: string }>(
      `SELECT order_id FROM order_invoices WHERE id = $1`,
      [id]
    );
    const orderId = owner.rows[0]?.order_id;
    await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    if (orderId) await recomputeDispatchStatus(orderId);
    return;
  }
  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

/** Delete an SO (cascades to its items, detail and lot rows). */
export async function deleteOrder(id: string): Promise<void> {
  if (!UUID_RE.test(id)) return;
  await query(`DELETE FROM orders WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// QC documents (per EC)
// ---------------------------------------------------------------------------

// order_qc_documents: QC's own output (certs/reports), filled by QC.
// order_qc_requirement_documents: reference/requirement files Central
// Visibility uploads for QC to work from — the reverse direction.
export type QcDocTable = "order_qc_documents" | "order_qc_requirement_documents";

const QC_DOC_TABLES: readonly QcDocTable[] = [
  "order_qc_documents",
  "order_qc_requirement_documents",
];

// Table names are interpolated directly into SQL below (they can't be query
// params), so every entry point re-validates against this allow-list — the
// caller's TypeScript type isn't a guarantee once it crosses a Server Action.
function isQcDocTable(table: string): table is QcDocTable {
  return (QC_DOC_TABLES as readonly string[]).includes(table);
}

export type QcDocumentMeta = {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_at: string;
};

/** File counts keyed by item_id, for a QC document list view (no bytes). */
export async function listQcDocumentCounts(
  table: QcDocTable
): Promise<Record<string, number>> {
  if (!isQcDocTable(table)) return {};
  const result = await query<{ item_id: string; count: string }>(
    `SELECT item_id, COUNT(*)::text AS count
       FROM ${table}
      GROUP BY item_id`
  );
  return Object.fromEntries(result.rows.map((r) => [r.item_id, Number(r.count)]));
}

/** Attached documents for one EC item (metadata only, no bytes). */
export async function listQcDocuments(
  table: QcDocTable,
  itemId: string
): Promise<QcDocumentMeta[]> {
  if (!isQcDocTable(table) || !UUID_RE.test(itemId)) return [];
  const result = await query<QcDocumentMeta>(
    `SELECT id, file_name, mime_type, file_size,
            to_char(uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS uploaded_at
       FROM ${table}
      WHERE item_id = $1
      ORDER BY uploaded_at DESC`,
    [itemId]
  );
  return result.rows;
}

/** A single document's bytes, for download. Tries both QC document tables. */
export async function getQcDocumentFile(
  id: string
): Promise<{ file_name: string; mime_type: string | null; file_data: Buffer } | null> {
  if (!UUID_RE.test(id)) return null;
  for (const table of QC_DOC_TABLES) {
    const result = await query<{
      file_name: string;
      mime_type: string | null;
      file_data: Buffer;
    }>(`SELECT file_name, mime_type, file_data FROM ${table} WHERE id = $1`, [id]);
    if (result.rows[0]) return result.rows[0];
  }
  return null;
}

/** Attach one document to an EC item. */
export async function insertQcDocument(
  table: QcDocTable,
  itemId: string,
  file: { name: string; mimeType: string | null; size: number; data: Buffer }
): Promise<void> {
  if (!isQcDocTable(table) || !UUID_RE.test(itemId)) return;
  await query(
    `INSERT INTO ${table} (item_id, file_name, mime_type, file_size, file_data)
     VALUES ($1, $2, $3, $4, $5)`,
    [itemId, file.name, file.mimeType, file.size, file.data]
  );
}

/** Remove a document. */
export async function deleteQcDocument(table: QcDocTable, id: string): Promise<void> {
  if (!isQcDocTable(table) || !UUID_RE.test(id)) return;
  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------------------
// Dispatch register (per lot, per EC)
// ---------------------------------------------------------------------------

export type DispatchRegisterRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  ec_no: string | null;
  client_name: string | null;
  lot_no: string | null;
  lot_dispatch_date: string | null;
  invoice_date: string | null;
  dispatch_status: string | null;
};

/** Every dispatched lot (has a lot-wise dispatch date), for the register. */
export async function listDispatchRegister(): Promise<DispatchRegisterRow[]> {
  const result = await query<DispatchRegisterRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.order_type,
            it.ec_no,
            o.client_name,
            l.lot_no,
            to_char(l.lot_dispatch_date, 'YYYY-MM-DD') AS lot_dispatch_date,
            to_char(l.invoice_date, 'YYYY-MM-DD') AS invoice_date,
            o.dispatch_status
       FROM order_lots l
       JOIN order_items it ON it.id = l.item_id
       JOIN orders o ON o.id = it.order_id
      WHERE l.lot_dispatch_date IS NOT NULL
      ORDER BY l.lot_dispatch_date DESC, o.sl_no ASC`
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Dashboard overview (one row per EC)
// ---------------------------------------------------------------------------

export type OrderOverviewRow = {
  id: string;
  order_id: string;
  sl_no: number;
  so_no: string | null;
  ec_no: string | null;
  item_type: string | null;
  client_name: string | null;
  industry_type: string | null;
  market_type: string | null;
  order_value: string | null;
  has_pi: boolean;
  payment_status: string | null;
  drg_status: string | null;
  boi: string | null;
  purchase_done: boolean;
  qc_submitted: boolean;
  qc_required: string | null;
  planning_status: string | null;
  dispatch_target_date: string | null;
  dispatch_status: string | null;
};

/**
 * One row per EC item with a representative status from each department.
 * order_value carries the SO value only on the SO's first EC (null on the
 * rest) so a "total order value" sum isn't inflated by multi-EC orders.
 */
export async function listOrdersOverview(): Promise<OrderOverviewRow[]> {
  const result = await query<OrderOverviewRow>(
    `SELECT it.id,
            o.id AS order_id,
            o.sl_no::int AS sl_no,
            o.so_no,
            it.ec_no,
            it.item_type,
            o.client_name,
            o.industry_type,
            o.market_type,
            CASE WHEN it.seq = MIN(it.seq) OVER (PARTITION BY o.id)
                 THEN o.order_value::text END AS order_value,
            -- Any PI exists? (Billing progress in the pipeline: Tax Invoice
            -- SOs are "done" once at least one PI is added; Challan SOs are
            -- done once a challan number is filled on order_billing.)
            (EXISTS (SELECT 1 FROM order_billing_docs d WHERE d.order_id = o.id)
             OR b.challan_no IS NOT NULL) AS has_pi,
            a.payment_status,
            -- Drawing progress now derives from the EC revision list:
            -- approved on any revision wins, else issued-to-client, else null.
            (SELECT CASE
                      WHEN bool_or(lower(coalesce(rv.approved,'')) = 'yes')
                        THEN 'Drg approved'
                      WHEN bool_or(lower(coalesce(rv.issued_to_client,'')) = 'yes')
                        THEN 'Drg. issued to Client'
                      ELSE NULL
                    END
               FROM order_drawing_revisions rv WHERE rv.item_id = it.id) AS drg_status,
            o.boi,
            (CASE
               WHEN COALESCE(o.boi, '') <> 'Yes' THEN true
               WHEN NOT EXISTS (SELECT 1 FROM order_boi_items bi WHERE bi.item_id = it.id) THEN false
               WHEN EXISTS (SELECT 1 FROM order_boi_items bi WHERE bi.item_id = it.id AND bi.receipt_date IS NULL) THEN false
               ELSE true
             END) AS purchase_done,
            (qc.qc_doc_actual_date IS NOT NULL) AS qc_submitted,
            o.qc_required,
            pl.planning_status,
            to_char(o.dispatch_target_date, 'YYYY-MM-DD') AS dispatch_target_date,
            o.dispatch_status
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
       LEFT JOIN order_billing b            ON b.order_id = o.id
       LEFT JOIN order_accounts a           ON a.order_id = o.id
       LEFT JOIN order_drawing dr           ON dr.item_id = it.id
       LEFT JOIN order_qc qc                ON qc.item_id = it.id
       LEFT JOIN order_planning pl          ON pl.item_id = it.id
      ORDER BY o.sl_no ASC, it.seq ASC`
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Payment holds (SO level)
// ---------------------------------------------------------------------------

export type PaymentHoldRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  client_name: string | null;
  hold_reason: string | null;
  order_value: string | null;
};

/** SOs whose payment is on Hold (escalated to Central Visibility). */
export async function listPaymentHolds(): Promise<PaymentHoldRow[]> {
  const result = await query<PaymentHoldRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.order_type,
            o.client_name,
            o.order_value::text AS order_value,
            a.hold_reason
       FROM orders o
       JOIN order_accounts a ON a.order_id = o.id
      WHERE lower(a.payment_status) = 'outstanding hold'
      ORDER BY o.sl_no ASC`
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Department workspace queues
// ---------------------------------------------------------------------------

type ContextColumn = { column: string; type: string; from?: OrderTable };

function contextTypeCast(type: string): string {
  return type === "date" ? "date" : "text";
}

/**
 * SO-keyed workspace queue (Billing & Operations, Accounts): one row per SO
 * plus that section's fields. Date/number columns are returned as strings.
 */
export async function listOrdersForSection(
  table: OrderTable,
  contextColumns: ContextColumn[] = [],
  // When given, only these SOs are read — how the paged wrapper keeps the
  // query to one page instead of scanning the whole queue.
  orderIds?: string[]
): Promise<Row[]> {
  const section = SECTION_BY_TABLE.get(table);
  if (!section || section.scope !== "so" || table === "orders") return [];

  const detailSelects = section.fields.map((f) => detailSelect("d", f)).join(", ");

  const extraJoins = new Map<string, string>();
  const contextSelects = contextColumns
    .map((f) => {
      const from = f.from ?? "orders";
      if (from === "orders" && DROPPED_ORDER_COLUMNS.has(f.column)) {
        return `, NULL::${contextTypeCast(f.type)} AS ${f.column}`;
      }
      let alias: string;
      if (from === "orders") alias = "o";
      else if (from === table) alias = "d";
      else {
        alias = from;
        extraJoins.set(from, alias);
      }
      return f.type === "date"
        ? `, to_char(${alias}.${f.column}, 'YYYY-MM-DD') AS ${f.column}`
        : `, ${alias}.${f.column}`;
    })
    .join("");

  const extraJoinSql = [...extraJoins.entries()]
    .map(([t, a]) => `LEFT JOIN ${t} ${a} ON ${a}.order_id = o.id`)
    .join("\n       ");

  // Accounts is not involved for Challan orders — Billing collects payment
  // against the challan directly, so those SOs shouldn't sit in the Accounts
  // queue at all.
  const clauses: string[] = [];
  if (table === "order_accounts") {
    clauses.push(`COALESCE(o.bill_type, '') <> 'Challan'`);
  }
  if (orderIds) clauses.push(`o.id = ANY($1)`);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await query<Row>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            NULL::text AS ec_no,
            o.client_name${detailSelects ? `,\n            ${detailSelects}` : ""}${contextSelects}
       FROM orders o
       LEFT JOIN ${table} d ON d.order_id = o.id
       ${extraJoinSql}
       ${whereSql}
      ORDER BY o.sl_no ASC`,
    orderIds ? [orderIds] : []
  );
  return result.rows;
}

/**
 * Item-keyed workspace queue (Drawing, Purchase, QC, Planning, Assembly &
 * Dispatch): one row per EC joined to its parent SO plus that section's fields.
 * The row `id` is the item_id (edit target). Date/number columns are strings.
 */
export async function listItemsForSection(
  table: OrderTable,
  contextColumns: ContextColumn[] = [],
  // When given, only these SOs are read — how the paged wrapper keeps the
  // query to one page instead of scanning the whole queue.
  orderIds?: string[]
): Promise<Row[]> {
  const section = SECTION_BY_TABLE.get(table);
  if (!section || section.scope !== "item" || table === "order_items") return [];

  const detailSelects = section.fields.map((f) => detailSelect("d", f)).join(", ");

  // Context columns come from the item (it), the parent SO (o), the section
  // table (d), or another item-keyed detail table joined by its own alias.
  const extraJoins = new Map<string, string>();
  const contextSelects = contextColumns
    .map((f) => {
      const from = f.from ?? "order_items";
      let alias: string;
      if (from === "orders") alias = "o";
      else if (from === "order_items") alias = "it";
      else if (from === table) alias = "d";
      else {
        alias = from;
        extraJoins.set(from, alias);
      }
      return f.type === "date"
        ? `, to_char(${alias}.${f.column}, 'YYYY-MM-DD') AS ${f.column}`
        : `, ${alias}.${f.column}`;
    })
    .join("");

  const extraJoinSql = [...extraJoins.entries()]
    .map(([t, a]) => `LEFT JOIN ${t} ${a} ON ${a}.item_id = it.id`)
    .join("\n       ");

  // QC isn't involved when the SO is flagged QC Needed = No.
  const clauses: string[] = [];
  if (table === "order_qc") {
    clauses.push(`(o.qc_required IS NULL OR o.qc_required <> 'No')`);
  }
  if (orderIds) clauses.push(`it.order_id = ANY($1)`);
  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  // Sections backed by a per-EC child list (Planning/Packing → packing slips)
  // carry those rows inline so the workspace can edit them without a round
  // trip. `client_type` rides along for the export-only column gate.
  // childKind is a schema constant, never user input — still pinned to the
  // known values so it can never widen what goes into the SQL text.
  const slipKind = section.childKind === "tentative" ? "tentative" : "actual";
  const childSelect =
    section.childTable === "order_packing_slips"
      ? `, o.market_type, o.packing_details_required,
         COALESCE((SELECT jsonb_agg(to_jsonb(ps) ORDER BY ps.seq)
                     FROM order_packing_slips ps
                    WHERE ps.item_id = it.id
                      AND ps.kind = '${slipKind}'),
                  '[]'::jsonb) AS child_rows`
      : section.childTable === "order_drawing_revisions"
        ? `, COALESCE((SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.seq)
                         FROM order_drawing_revisions rv
                        WHERE rv.item_id = it.id),
                      '[]'::jsonb) AS child_rows`
        : "";

  const result = await query<Row>(
    `SELECT it.id,
            it.order_id,
            it.seq::int AS seq,
            o.sl_no::int AS sl_no,
            o.so_no,
            it.ec_no,
            it.item_type,
            o.client_name
            ${childSelect}${detailSelects ? `,\n            ${detailSelects}` : ""}${contextSelects}
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
       LEFT JOIN ${table} d ON d.item_id = it.id
       ${extraJoinSql}
      ${whereSql}
      ORDER BY o.sl_no ASC, it.seq ASC`,
    orderIds ? [orderIds] : []
  );
  return result.rows;
}

export type BillingQueueRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  so_date: string | null;
  order_type: string | null;
  client_name: string | null;
  bill_type: string | null;
  payment_terms: string | null;
  freight_terms: string | null;
  packing_requirement: string | null;
  order_value: string | null;
  order_currency: string | null;
  // Challan-only, when bill_type = Challan (used by the flat edit modal).
  challan_no: string | null;
  challan_date: string | null;
  challan_value: string | null;
  fr_reason: string | null;
  dispatch_status: string | null;
  pi_docs: Row[];
  invoices: Row[];
};

/**
 * Billing/Accounts queue: one row per SO, with the read-only SO context and
 * that SO's list of PIs (order_billing_docs) for inline management.
 */
export async function listOrdersForBilling(
  orderIds?: string[]
): Promise<BillingQueueRow[]> {
  const result = await query<BillingQueueRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.order_type,
            o.client_name,
            o.bill_type,
            o.payment_terms,
            o.freight_terms,
            o.packing_requirement,
            o.order_value::text AS order_value,
            o.order_currency,
            b.challan_no,
            to_char(b.challan_date, 'YYYY-MM-DD') AS challan_date,
            b.challan_value::text AS challan_value,
            b.fr_reason,
            o.dispatch_status,
            COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.seq)
                      FROM order_billing_docs d WHERE d.order_id = o.id),
                     '[]'::jsonb) AS pi_docs,
            COALESCE((SELECT jsonb_agg(to_jsonb(inv) ORDER BY inv.seq)
                      FROM order_invoices inv WHERE inv.order_id = o.id),
                     '[]'::jsonb) AS invoices
       FROM orders o
       LEFT JOIN order_billing b ON b.order_id = o.id
      WHERE ($1::uuid[] IS NULL OR o.id = ANY($1))
      ORDER BY o.sl_no ASC`,
    [orderIds ?? null]
  );
  return result.rows;
}

export type PurchaseQueueRow = {
  id: string;
  order_id: string;
  sl_no: number;
  so_no: string | null;
  so_date: string | null;
  order_type: string | null;
  ec_no: string | null;
  boi: string | null;
  ld: string | null;
  ld_date: string | null;
  purchase_target_date: string | null;
  boi_items: Row[];
};

/**
 * Purchase workspace queue: one row per EC with the SO's BOI flag, the purchase
 * target date, and that EC's BOI items (for the manage-items list).
 */
export async function listItemsForPurchase(
  orderIds?: string[]
): Promise<PurchaseQueueRow[]> {
  // BOI = No SOs don't need Purchase involvement — hide them from the queue.
  const result = await query<PurchaseQueueRow>(
    `SELECT it.id,
            it.order_id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.order_type,
            it.ec_no,
            o.boi,
            o.ld,
            to_char(o.ld_date, 'YYYY-MM-DD') AS ld_date,
            to_char(o.purchase_target_date, 'YYYY-MM-DD') AS purchase_target_date,
            COALESCE((SELECT jsonb_agg(to_jsonb(bi) ORDER BY bi.created_at)
                      FROM order_boi_items bi WHERE bi.item_id = it.id), '[]'::jsonb) AS boi_items
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
      WHERE o.boi = 'Yes'
        AND ($1::uuid[] IS NULL OR it.order_id = ANY($1))
      ORDER BY o.sl_no ASC, it.seq ASC`,
    [orderIds ?? null]
  );
  return result.rows;
}

function detailSelect(alias: string, f: { column: string; type: string }): string {
  if (f.type === "date") {
    return `to_char(${alias}.${f.column}, 'YYYY-MM-DD') AS ${f.column}`;
  }
  if (f.type === "int" || f.type === "number") {
    return `${alias}.${f.column}::text AS ${f.column}`;
  }
  return `${alias}.${f.column}`;
}

// ---------------------------------------------------------------------------
// Master SO list
// ---------------------------------------------------------------------------

/** All SOs for the master table, each with its EC items, ordered by Sl. No. */
/**
 * One page of the orders list, filtered in SQL.
 *
 * Search covers the SO's own columns plus its ECs (an EC number or model is
 * how people find an order), so it has to run here — filtering the 30 rows
 * already on screen would miss matches on every other page.
 */
// The orders-list filter, shared by the paged table and the Excel export so
// "Export N filtered" can never disagree with the rows on screen.
// $1 = zones (null for all), $2 = search pattern (null for all).
const ORDER_LIST_WHERE = `WHERE ($1::text[] IS NULL OR TRIM(COALESCE(o.zone, '')) = ANY($1))
        AND ($2::text IS NULL
             OR o.so_no ILIKE $2 OR o.client_name ILIKE $2
             OR o.client_code ILIKE $2 OR o.po_no ILIKE $2
             OR o.sl_no::text ILIKE $2
             OR EXISTS (SELECT 1 FROM order_items s
                         WHERE s.order_id = o.id
                           AND (s.ec_no ILIKE $2 OR s.item_type ILIKE $2
                                OR s.model_no ILIKE $2)))`;

/**
 * SQL for "this SO is <status> in <dept>", where <status> is the department's
 * own word for it — Drawing's "Approved", Accounts' payment status — not a
 * flattened done/pending. Each arm mirrors getOrderDeptStatus, so a row the
 * filter returns is a row whose "Departments" popup says the same thing.
 *
 * Per-EC departments match when ANY EC is in that state: one unfinished EC is
 * what actually holds an order up.
 */

/** Values come from fixed lists, but never interpolate one unescaped. */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const DRG_APPROVED = `EXISTS (SELECT 1 FROM order_drawing_revisions rv
                              WHERE rv.item_id = it.id
                                AND lower(coalesce(rv.approved, '')) = 'yes')`;
const DRG_ISSUED = `EXISTS (SELECT 1 FROM order_drawing_revisions rv
                            WHERE rv.item_id = it.id
                              AND lower(coalesce(rv.issued_to_client, '')) = 'yes')`;
const BOI_RECEIVED = `EXISTS (SELECT 1 FROM order_boi_items bi WHERE bi.item_id = it.id)
                      AND NOT EXISTS (SELECT 1 FROM order_boi_items bi
                                       WHERE bi.item_id = it.id
                                         AND bi.receipt_date IS NULL)`;
const QC_SUBMITTED = `EXISTS (SELECT 1 FROM order_qc q
                              WHERE q.item_id = it.id
                                AND q.qc_doc_actual_date IS NOT NULL)`;
const PACKED = `EXISTS (SELECT 1 FROM order_assembly_dispatch ad
                        WHERE ad.item_id = it.id
                          AND ad.actual_packing_date IS NOT NULL)`;
// Planning files its status on whichever of the three columns applies.
const PLANNING_STATUS = `COALESCE(NULLIF(pl.actual_pump_status, ''),
                                  NULLIF(pl.actual_spare_status, ''),
                                  NULLIF(pl.planning_status, ''))`;
const planningIs = (value: string) =>
  `EXISTS (SELECT 1 FROM order_planning pl
            WHERE pl.item_id = it.id AND ${PLANNING_STATUS} = ${lit(value)})`;
const PLANNING_ANY = `EXISTS (SELECT 1 FROM order_planning pl
                              WHERE pl.item_id = it.id
                                AND ${PLANNING_STATUS} IS NOT NULL)`;

const NO_BOI = `COALESCE(o.boi, '') <> 'Yes'`;
const NO_QC = `COALESCE(o.qc_required, '') = 'No'`;
const IS_CHALLAN = `COALESCE(o.bill_type, '') = 'Challan'`;
const BILL_RAISED = `(EXISTS (SELECT 1 FROM order_billing_docs d WHERE d.order_id = o.id)
                      OR EXISTS (SELECT 1 FROM order_billing b
                                  WHERE b.order_id = o.id
                                    AND b.challan_no IS NOT NULL))`;
const PAYMENT_SET = `EXISTS (SELECT 1 FROM order_accounts a
                             WHERE a.order_id = o.id
                               AND COALESCE(a.payment_status, '') <> '')`;

/** The state of one EC (`it`) for a per-EC department. */
function ecState(dept: DeptFilterKey, status: string): string {
  switch (dept) {
    case "drawing":
      // Approval outranks issue, matching the popup's precedence.
      if (status === "Approved") return DRG_APPROVED;
      if (status === "Issued to Client") {
        return `${DRG_ISSUED} AND NOT ${DRG_APPROVED}`;
      }
      return `NOT ${DRG_APPROVED} AND NOT ${DRG_ISSUED}`;
    case "purchase":
      if (status === NOT_APPLICABLE) return NO_BOI;
      if (status === "Received") return `NOT (${NO_BOI}) AND (${BOI_RECEIVED})`;
      return `NOT (${NO_BOI}) AND NOT (${BOI_RECEIVED})`;
    case "quality":
      if (status === NOT_APPLICABLE) return NO_QC;
      if (status === "Submitted") return `NOT (${NO_QC}) AND ${QC_SUBMITTED}`;
      return `NOT (${NO_QC}) AND NOT ${QC_SUBMITTED}`;
    case "planning":
      return status === PENDING ? `NOT ${PLANNING_ANY}` : planningIs(status);
    default:
      return status === "Packed" ? PACKED : `NOT ${PACKED}`;
  }
}

/** The state of the SO itself for an SO-scope department. */
function soState(dept: DeptFilterKey, status: string): string {
  if (dept === "billing") {
    if (status === "PI raised") return `${BILL_RAISED} AND NOT (${IS_CHALLAN})`;
    if (status === "Challan filed") return `${BILL_RAISED} AND ${IS_CHALLAN}`;
    return `NOT ${BILL_RAISED}`;
  }
  if (dept === "accounts") {
    if (status === NOT_APPLICABLE) return IS_CHALLAN;
    if (status === PENDING) return `NOT (${IS_CHALLAN}) AND NOT ${PAYMENT_SET}`;
    return `NOT (${IS_CHALLAN})
            AND EXISTS (SELECT 1 FROM order_accounts a
                         WHERE a.order_id = o.id
                           AND a.payment_status = ${lit(status)})`;
  }
  // Dispatch: "Pending" is itself a stored value, so it also covers a blank.
  return status === PENDING
    ? `COALESCE(o.dispatch_status, '') IN ('', ${lit(PENDING)})`
    : `o.dispatch_status = ${lit(status)}`;
}

function deptStatusPredicate(dept: DeptFilterKey, status: string): string {
  if (!isPerEcDept(dept)) return `(${soState(dept, status)})`;
  return `EXISTS (SELECT 1 FROM order_items it
                   WHERE it.order_id = o.id AND (${ecState(dept, status)}))`;
}

/** The extra WHERE clause for the department filter, or "" when it is off. */
function deptFilterSql(
  dept: DeptFilterKey | null,
  status: string | null
): string {
  if (!dept || !status) return "";
  return ` AND ${deptStatusPredicate(dept, status)}`;
}

/**
 * Every SO id matching the list filter — the whole result set, not one page.
 * The export needs this because the table only holds the current page's rows.
 */
export async function listOrderIdsMatching(opts: {
  search: string;
  zones: string[];
  dept?: DeptFilterKey | null;
  deptStatus?: string | null;
}): Promise<string[]> {
  const dept = deptFilterSql(opts.dept ?? null, opts.deptStatus ?? null);
  const result = await query<{ id: string }>(
    `SELECT o.id FROM orders o ${ORDER_LIST_WHERE}${dept} ORDER BY o.sl_no ASC`,
    [
      opts.zones.length > 0 ? opts.zones : null,
      opts.search ? likePattern(opts.search) : null,
    ]
  );
  return result.rows.map((r) => r.id);
}

export async function listOrdersPage(opts: {
  page: number;
  search: string;
  zones: string[];
  dept?: DeptFilterKey | null;
  deptStatus?: string | null;
}): Promise<PageResult<OrderListRow> & { zoneOptions: string[] }> {
  const search = opts.search ? likePattern(opts.search) : null;
  const zones = opts.zones.length > 0 ? opts.zones : null;

  const where =
    ORDER_LIST_WHERE + deptFilterSql(opts.dept ?? null, opts.deptStatus ?? null);

  const [totals, zoneRows] = await Promise.all([
    query<{ count: string }>(
      `SELECT count(*) AS count FROM orders o ${where}`,
      [zones, search]
    ),
    // Zone choices come from the whole table, not the current page.
    query<{ zone: string }>(
      `SELECT DISTINCT TRIM(zone) AS zone FROM orders
        WHERE zone IS NOT NULL AND TRIM(zone) <> ''
        ORDER BY 1`
    ),
  ]);

  const total = Number(totals.rows[0]?.count ?? 0);
  const page = clampPage(opts.page, total);

  const rows = await (async () =>
    query<OrderListRow>(
      `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.client_name,
            o.client_code,
            o.reps,
            o.zone,
            o.po_no,
            o.order_type,
            o.order_value::text AS order_value,
            a.payment_status,
            o.dispatch_status,
            COALESCE(ic.cnt, 0)::int AS ec_count,
            COALESCE((
              SELECT jsonb_agg(to_jsonb(x) ORDER BY x.seq)
                FROM (
                  SELECT it.id,
                         it.seq::int AS seq,
                         it.ec_no,
                         to_char(it.ec_date, 'YYYY-MM-DD') AS ec_date,
                         it.item_type,
                         it.pump_type,
                         it.model_no,
                         it.internal_model,
                         it.version,
                         it.quantity::text AS quantity
                    FROM order_items it
                   WHERE it.order_id = o.id
                ) x
            ), '[]'::jsonb) AS items
       FROM orders o
       LEFT JOIN order_accounts a ON a.order_id = o.id
       LEFT JOIN (
         SELECT order_id, COUNT(*) AS cnt FROM order_items GROUP BY order_id
       ) ic ON ic.order_id = o.id
      ${where}
      ORDER BY o.sl_no ASC
      LIMIT $3 OFFSET $4`,
      [zones, search, PAGE_SIZE, offsetFor(page)]
    ))();

  return {
    ...pageResult(rows.rows, total, page),
    zoneOptions: zoneRows.rows.map((r) => r.zone),
  };
}
export async function listOrders(): Promise<OrderListRow[]> {
  const result = await query<OrderListRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.client_name,
            o.client_code,
            o.reps,
            o.zone,
            o.po_no,
            o.order_type,
            o.order_value::text AS order_value,
            a.payment_status,
            o.dispatch_status,
            COALESCE(ic.cnt, 0)::int AS ec_count,
            COALESCE((
              SELECT jsonb_agg(to_jsonb(x) ORDER BY x.seq)
                FROM (
                  SELECT it.id,
                         it.seq::int AS seq,
                         it.ec_no,
                         to_char(it.ec_date, 'YYYY-MM-DD') AS ec_date,
                         it.item_type,
                         it.pump_type,
                         it.model_no,
                         it.internal_model,
                         it.version,
                         it.quantity::text AS quantity
                    FROM order_items it
                   WHERE it.order_id = o.id
                ) x
            ), '[]'::jsonb) AS items
       FROM orders o
       LEFT JOIN order_accounts a ON a.order_id = o.id
       LEFT JOIN (
         SELECT order_id, COUNT(*) AS cnt FROM order_items GROUP BY order_id
       ) ic ON ic.order_id = o.id
      ORDER BY o.sl_no ASC`
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Paged department queues
//
// These page on *SOs*, never on ECs: the workspaces render one card per SO
// with its ECs inside, so paging on EC rows would split an SO across two
// pages. Each query therefore picks the SO ids for the page first, then
// pulls every EC belonging to them.
// ---------------------------------------------------------------------------

/** SO ids for one page of a queue, plus how many SOs matched in total. */
async function pageOfOrderIds(opts: {
  page: number;
  search: string;
  /** Extra SQL restricting which SOs belong in this queue. */
  restrict: string;
  /** Extra SQL matching the search against the SO and its ECs. */
  searchable: string;
  /**
   * Deep link target (from a notification). When this SO is in the queue,
   * the page holding it wins over the requested page — otherwise following
   * a notification for an SO on page 3 would silently land on page 1.
   */
  focusOrderId?: string | null;
}): Promise<{ ids: string[]; total: number; page: number }> {
  const search = opts.search ? likePattern(opts.search) : null;
  const where = `WHERE ${opts.restrict}
        AND ($1::text IS NULL OR ${opts.searchable})`;

  const totals = await query<{ count: string }>(
    `SELECT count(*) AS count FROM orders o ${where}`,
    [search]
  );
  const total = Number(totals.rows[0]?.count ?? 0);

  // Rank the target inside this queue's own ordering (sl_no ASC), then
  // convert that position to a page. Rank 0 means it isn't in the queue at
  // all (wrong department, or filtered out by the current search) — then we
  // just honour the requested page.
  let requested = opts.page;
  if (opts.focusOrderId && UUID_RE.test(opts.focusOrderId)) {
    const rank = await query<{ n: string }>(
      `SELECT count(*) AS n FROM orders o ${where}
         AND o.sl_no <= (SELECT sl_no FROM orders WHERE id = $2)`,
      [search, opts.focusOrderId]
    );
    const n = Number(rank.rows[0]?.n ?? 0);
    if (n > 0) requested = Math.ceil(n / PAGE_SIZE);
  }
  const page = clampPage(requested, total);

  const ids = await query<{ id: string }>(
    `SELECT o.id FROM orders o ${where}
      ORDER BY o.sl_no ASC
      LIMIT $2 OFFSET $3`,
    [search, PAGE_SIZE, offsetFor(page)]
  );

  return { ids: ids.rows.map((r) => r.id), total, page };
}

// Matches the SO's own identity columns or any of its ECs.
const SO_AND_EC_SEARCH = `(o.so_no ILIKE $1 OR o.client_name ILIKE $1
             OR o.sl_no::text ILIKE $1
             OR EXISTS (SELECT 1 FROM order_items s
                         WHERE s.order_id = o.id AND s.ec_no ILIKE $1))`;

/** Item-scope department queue, one page of SOs' worth of ECs. */
export async function listItemsForSectionPage(
  table: OrderTable,
  contextColumns: ContextColumn[],
  opts: { page: number; search: string; focusOrderId?: string | null }
): Promise<PageResult<Row>> {
  // QC isn't involved when the SO is flagged QC Needed = No — the same rule
  // the unpaged query applies.
  const restrict =
    table === "order_qc"
      ? `(o.qc_required IS NULL OR o.qc_required <> 'No')`
      : `TRUE`;

  const { ids, total, page } = await pageOfOrderIds({
    page: opts.page,
    search: opts.search,
    focusOrderId: opts.focusOrderId ?? null,
    restrict: `${restrict} AND EXISTS (SELECT 1 FROM order_items s WHERE s.order_id = o.id)`,
    searchable: SO_AND_EC_SEARCH,
  });

  const rows = ids.length === 0 ? [] : await listItemsForSection(table, contextColumns, ids);

  return pageResult(rows, total, page);
}

/** SO-scope department queue (Accounts), one page of SOs. */
export async function listOrdersForSectionPage(
  table: OrderTable,
  contextColumns: ContextColumn[],
  opts: { page: number; search: string; focusOrderId?: string | null }
): Promise<PageResult<Row>> {
  const { ids, total, page } = await pageOfOrderIds({
    page: opts.page,
    search: opts.search,
    focusOrderId: opts.focusOrderId ?? null,
    // Accounts is not involved for Challan orders, so they must be out of
    // the count as well as out of the rows.
    restrict:
      table === "order_accounts"
        ? `COALESCE(o.bill_type, '') <> 'Challan'`
        : `TRUE`,
    searchable: SO_AND_EC_SEARCH,
  });

  const rows = ids.length === 0 ? [] : await listOrdersForSection(table, contextColumns, ids);

  return pageResult(rows, total, page);
}

/** Purchase queue (BOI = Yes), one page of SOs' worth of ECs. */
export async function listItemsForPurchasePage(opts: {
  page: number;
  search: string;
  focusOrderId?: string | null;
}): Promise<PageResult<PurchaseQueueRow>> {
  const { ids, total, page } = await pageOfOrderIds({
    page: opts.page,
    search: opts.search,
    focusOrderId: opts.focusOrderId ?? null,
    restrict: `o.boi = 'Yes' AND EXISTS (SELECT 1 FROM order_items s WHERE s.order_id = o.id)`,
    searchable: SO_AND_EC_SEARCH,
  });

  const rows = ids.length === 0 ? [] : await listItemsForPurchase(ids);

  return pageResult(rows, total, page);
}

/** Billing queue: one page of SOs, filtered in SQL. */
export async function listOrdersForBillingPage(opts: {
  page: number;
  search: string;
  focusOrderId?: string | null;
}): Promise<PageResult<BillingQueueRow>> {
  const { ids, total, page } = await pageOfOrderIds({
    page: opts.page,
    search: opts.search,
    focusOrderId: opts.focusOrderId ?? null,
    restrict: `TRUE`,
    searchable: `(o.so_no ILIKE $1 OR o.client_name ILIKE $1 OR o.sl_no::text ILIKE $1)`,
  });

  const rows = ids.length === 0 ? [] : await listOrdersForBilling(ids);

  return pageResult(rows, total, page);
}

// ---------------------------------------------------------------------------
// Per-SO department status (the "Departments" popup on the order list)
// ---------------------------------------------------------------------------

export type DeptCell = { state: "done" | "pending" | "na"; label: string };

export type EcDeptStatus = {
  id: string;
  ec_no: string | null;
  item_type: string | null;
  drawing: DeptCell;
  purchase: DeptCell;
  quality: DeptCell;
  planning: DeptCell;
  assembly: DeptCell;
};

/**
 * The date each department is working to. These live on the SO — one target
 * applies across every EC of the order — so the popup prints them once per
 * department rather than repeating the same date down every EC row. Planning
 * has no target of its own; it works to Purchase's and Dispatch's.
 */
export type DeptTargets = {
  drawing: string | null;
  purchase: string | null;
  quality: string | null;
  assembly: string | null;
  dispatch: string | null;
  // Set only when the dispatch date has been revised; it supersedes the above.
  dispatchRevised: string | null;
};

export type SoDeptStatus = {
  billing: DeptCell;
  accounts: DeptCell;
  dispatch: DeptCell;
  targets: DeptTargets;
  ecs: EcDeptStatus[];
};

const NA: DeptCell = { state: "na", label: "N/A" };
const done = (label: string): DeptCell => ({ state: "done", label });
const pending = (label = "Pending"): DeptCell => ({ state: "pending", label });

/** Full department status for one SO — SO-scope depts plus a per-EC matrix. */
export async function getOrderDeptStatus(
  orderId: string
): Promise<SoDeptStatus | null> {
  if (!UUID_RE.test(orderId)) return null;

  const so = await query<{
    dispatch_status: string | null;
    bill_type: string | null;
    has_pi: boolean;
    payment_status: string | null;
    drg_target_date: string | null;
    purchase_target_date: string | null;
    qc_doc_target_date: string | null;
    dispatch_team_target_date: string | null;
    dispatch_target_date: string | null;
    dispatch_target_revised_date: string | null;
  }>(
    `SELECT o.dispatch_status, o.bill_type,
            (EXISTS (SELECT 1 FROM order_billing_docs d WHERE d.order_id = o.id)
             OR b.challan_no IS NOT NULL) AS has_pi,
            a.payment_status,
            to_char(o.drg_target_date, 'YYYY-MM-DD') AS drg_target_date,
            to_char(o.purchase_target_date, 'YYYY-MM-DD') AS purchase_target_date,
            to_char(o.qc_doc_target_date, 'YYYY-MM-DD') AS qc_doc_target_date,
            to_char(o.dispatch_team_target_date, 'YYYY-MM-DD') AS dispatch_team_target_date,
            to_char(o.dispatch_target_date, 'YYYY-MM-DD') AS dispatch_target_date,
            to_char(o.dispatch_target_revised_date, 'YYYY-MM-DD') AS dispatch_target_revised_date
       FROM orders o
       LEFT JOIN order_billing b  ON b.order_id  = o.id
       LEFT JOIN order_accounts a ON a.order_id = o.id
      WHERE o.id = $1`,
    [orderId]
  );
  const head = so.rows[0];
  if (!head) return null;

  const ecRows = await query<{
    id: string;
    ec_no: string | null;
    item_type: string | null;
    boi: string | null;
    drg: string | null;
    purchase: string;
    qc_required: string | null;
    qc_submitted: boolean;
    planning: string | null;
    packed: boolean;
    packing_date: string | null;
  }>(
    `SELECT it.id, it.ec_no, it.item_type, o.boi,
            (SELECT CASE
                      WHEN bool_or(lower(coalesce(rv.approved,'')) = 'yes')
                        THEN 'Approved'
                      WHEN bool_or(lower(coalesce(rv.issued_to_client,'')) = 'yes')
                        THEN 'Issued to Client'
                      ELSE NULL END
               FROM order_drawing_revisions rv WHERE rv.item_id = it.id) AS drg,
            (CASE
               WHEN COALESCE(o.boi, '') <> 'Yes' THEN 'na'
               WHEN NOT EXISTS (SELECT 1 FROM order_boi_items bi WHERE bi.item_id = it.id) THEN 'pending'
               WHEN EXISTS (SELECT 1 FROM order_boi_items bi WHERE bi.item_id = it.id AND bi.receipt_date IS NULL) THEN 'pending'
               ELSE 'done' END) AS purchase,
            o.qc_required,
            (qc.qc_doc_actual_date IS NOT NULL) AS qc_submitted,
            COALESCE(NULLIF(pl.actual_pump_status, ''),
                     NULLIF(pl.actual_spare_status, ''),
                     NULLIF(pl.planning_status, '')) AS planning,
            (ad.actual_packing_date IS NOT NULL) AS packed,
            to_char(ad.actual_packing_date, 'YYYY-MM-DD') AS packing_date
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
       LEFT JOIN order_qc qc                ON qc.item_id = it.id
       LEFT JOIN order_planning pl          ON pl.item_id = it.id
       LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
      WHERE it.order_id = $1
      ORDER BY it.seq ASC`,
    [orderId]
  );

  const ecs: EcDeptStatus[] = ecRows.rows.map((r) => ({
    id: r.id,
    ec_no: r.ec_no,
    item_type: r.item_type,
    drawing: r.drg ? done(r.drg) : pending(),
    purchase:
      r.purchase === "na"
        ? NA
        : r.purchase === "done"
          ? done("Received")
          : pending(),
    quality:
      String(r.qc_required ?? "") === "No"
        ? NA
        : r.qc_submitted
          ? done("Submitted")
          : pending(),
    planning: r.planning ? done(r.planning) : pending(),
    assembly: r.packed ? done(`Packed`) : pending(),
  }));

  const isChallan = String(head.bill_type ?? "") === "Challan";
  return {
    billing: head.has_pi ? done(isChallan ? "Challan filed" : "PI raised") : pending(),
    // Accounts is skipped for Challan orders (no A/R), matching the workspace.
    accounts: isChallan
      ? NA
      : head.payment_status
        ? done(head.payment_status)
        : pending(),
    dispatch: head.dispatch_status ? done(head.dispatch_status) : pending(),
    targets: {
      drawing: head.drg_target_date,
      purchase: head.purchase_target_date,
      quality: head.qc_doc_target_date,
      assembly: head.dispatch_team_target_date,
      dispatch: head.dispatch_target_date,
      dispatchRevised: head.dispatch_target_revised_date,
    },
    ecs,
  };
}

/**
 * A notification deep link carries an item_id for per-EC events and an
 * order_id otherwise. Both arrive in the same `edit` parameter, so resolve
 * whichever it is to the owning SO — that's what the queues page on.
 */
export async function resolveFocusOrderId(
  id: string | undefined | null
): Promise<string | null> {
  if (!id || !UUID_RE.test(id)) return null;
  const direct = await query<{ id: string }>(
    `SELECT id FROM orders WHERE id = $1`,
    [id]
  );
  if (direct.rows[0]) return direct.rows[0].id;
  const viaItem = await query<{ order_id: string }>(
    `SELECT order_id FROM order_items WHERE id = $1`,
    [id]
  );
  return viaItem.rows[0]?.order_id ?? null;
}

// ---------------------------------------------------------------------------
// Target date history
// ---------------------------------------------------------------------------

/**
 * Undo the most recent value of one target: drop it and fall back to whatever
 * came before, or clear the target when that was its only entry.
 *
 * Only the latest is removable. Deleting from the middle would leave a history
 * that never happened — and the seq numbering, which the unique index relies
 * on, would have a hole in it.
 */
export async function deleteLatestTargetRevision(
  orderId: string,
  target: TargetDate
): Promise<{ removed: string | null; now: string | null }> {
  return withTransaction(async (client) => {
    const latest = await client.query<{ id: string; d: string }>(
      `SELECT id, to_char(target_date, 'YYYY-MM-DD') AS d
         FROM order_target_revisions
        WHERE order_id = $1 AND target_key = $2
        ORDER BY seq DESC
        LIMIT 1
        FOR UPDATE`,
      [orderId, target.key]
    );
    const row = latest.rows[0];
    if (!row) return { removed: null, now: null };

    await client.query(`DELETE FROM order_target_revisions WHERE id = $1`, [
      row.id,
    ]);
    await syncTargetColumns(client, orderId, target);

    const remaining = await client.query<{ d: string }>(
      `SELECT to_char(target_date, 'YYYY-MM-DD') AS d
         FROM order_target_revisions
        WHERE order_id = $1 AND target_key = $2
        ORDER BY seq DESC
        LIMIT 1`,
      [orderId, target.key]
    );
    return { removed: row.d, now: remaining.rows[0]?.d ?? null };
  });
}

/** Every value each of the SO's targets has held, oldest first. */
export async function listTargetRevisions(
  orderId: string
): Promise<TargetRevision[]> {
  if (!UUID_RE.test(orderId)) return [];
  const result = await query<TargetRevision>(
    `SELECT r.id, r.target_key, r.seq::int AS seq,
            to_char(r.target_date, 'YYYY-MM-DD') AS target_date,
            r.reason, u.email AS changed_by_email, r.changed_by_role,
            to_char(r.created_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
       FROM order_target_revisions r
       LEFT JOIN users u ON u.id = r.changed_by
      WHERE r.order_id = $1
      ORDER BY r.target_key, r.seq`,
    [orderId]
  );
  return result.rows;
}

/**
 * Point the `orders` columns at what the history now says.
 *
 * Both the add and the delete path go through here, so the denormalised
 * current value can never disagree with the revisions behind it. Dispatch is
 * the one target with two columns: the original stays put and the latest
 * revision lands in the "revised" column, which is the pair every existing
 * reader COALESCEs. Column names come from TARGET_DATES, never from input.
 */
async function syncTargetColumns(
  client: PoolClient,
  orderId: string,
  target: TargetDate
): Promise<void> {
  const rows = await client.query<{ d: string }>(
    `SELECT to_char(target_date, 'YYYY-MM-DD') AS d
       FROM order_target_revisions
      WHERE order_id = $1 AND target_key = $2
      ORDER BY seq`,
    [orderId, target.key]
  );
  const dates = rows.rows.map((r) => r.d);

  if (target.revisedColumn) {
    await client.query(
      `UPDATE orders SET ${target.column} = $2, ${target.revisedColumn} = $3
        WHERE id = $1`,
      [orderId, dates[0] ?? null, dates.length > 1 ? dates[dates.length - 1] : null]
    );
    return;
  }
  await client.query(`UPDATE orders SET ${target.column} = $2 WHERE id = $1`, [
    orderId,
    dates[dates.length - 1] ?? null,
  ]);
}

/**
 * Record a new value for one target and make it the current one.
 *
 * The history row and the denormalised column on `orders` are written in one
 * transaction: everything else in the app still reads the column, so the two
 * must never drift. `seq` is taken inside the transaction and the table has a
 * unique index on (order_id, target_key, seq), so a double-submit fails loudly
 * instead of writing two revision 3s.
 */
export async function addTargetRevision(input: {
  orderId: string;
  target: TargetDate;
  date: string;
  reason: string | null;
  actorId: string;
  actorRole: string;
}): Promise<{ seq: number }> {
  return withTransaction(async (client) => {
    const next = await client.query<{ seq: number }>(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS seq
         FROM order_target_revisions
        WHERE order_id = $1 AND target_key = $2`,
      [input.orderId, input.target.key]
    );
    const seq = Number(next.rows[0]?.seq ?? 1);

    await client.query(
      `INSERT INTO order_target_revisions
         (order_id, target_key, seq, target_date, reason, changed_by, changed_by_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.orderId,
        input.target.key,
        seq,
        input.date,
        input.reason,
        input.actorId,
        input.actorRole,
      ]
    );

    await syncTargetColumns(client, input.orderId, input.target);
    return { seq };
  });
}
