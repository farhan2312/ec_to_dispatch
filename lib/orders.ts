import { query } from "@/lib/db";
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

/** One EC/pump summary, embedded in the SO list and SO detail. */
export type ItemSummary = {
  id: string;
  seq: number;
  ec_no: string | null;
  ec_date: string | null;
  item_type: string | null;
  pump_type: string | null;
  model_no: string | null;
  quantity: string | null;
  dispatch_status: string | null;
};

/** A row in the master SO list — one per sales order, with its EC items. */
export type OrderListRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  so_date: string | null;
  party: string | null;
  client_code: string | null;
  agent: string | null;
  po_no: string | null;
  order_type: string | null;
  order_value: string | null;
  payment_status: string | null;
  ec_count: number;
  items: ItemSummary[];
};

/** Fields captured when creating an SO (the core `orders` identity row). */
export type NewOrderInput = {
  so_no?: string;
  so_date?: string;
  client_code?: string;
  client_type?: string;
  party?: string;
  agent?: string;
  nature_of_supply?: string;
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
        so_no, so_date, client_code, client_type, party, agent,
        nature_of_supply, industry_type, quotation_no, po_no, customer_po_date,
        order_value, order_currency, qc_required, payment_terms, ld, ld_date,
        freight_terms, packing_requirement, delivery_date_as_per_so,
        order_type, bill_type, boi,
        total_quantity, drg_target_date, dispatch_target_date,
        dispatch_target_revised_date, qc_doc_target_date, purchase_target_date,
        packing_details_required, dispatch_team_target_date
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
        $22,$23,$24,$25,$26,$27,$28,$29,$30,$31
     )
     RETURNING id, sl_no::int AS sl_no`,
    [
      nullify(input.so_no),
      nullify(input.so_date),
      nullify(input.client_code),
      nullify(input.client_type),
      nullify(input.party),
      nullify(input.agent),
      nullify(input.nature_of_supply),
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
        order_id, ec_no, ec_date, item_type, pump_type, model_no, quantity,
        orientation, suction, delivery, pump_sno, application, version
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
     )
     RETURNING id, seq::int AS seq`,
    [
      orderId,
      nullify(input.ec_no),
      nullify(input.ec_date),
      nullify(input.item_type),
      nullify(input.pump_type),
      nullify(input.model_no),
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
        COALESCE((
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.seq)
            FROM (
              SELECT it.*, o.dispatch_status
                FROM order_items it
               WHERE it.order_id = o.id
            ) x
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
              FROM order_packing_slips ps WHERE ps.item_id = it.id), '[]'::jsonb) AS order_packing_slips
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
    (c) => fieldByColumn.has(c) && !fieldByColumn.get(c)!.computed
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

/** Update a child row's fields, validated against the child schema. */
export async function updateChildRow(
  table: ChildTable,
  id: string,
  values: Record<string, string>
): Promise<void> {
  if (!UUID_RE.test(id)) return;
  const byColumn = new Map(CHILD_FIELDS[table].map((f) => [f.column, f]));
  const columns = Object.keys(values).filter(
    (c) => byColumn.has(c) && !byColumn.get(c)!.computed
  );
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
         SELECT COUNT(*) AS n,
                SUM(invoice_quantity) AS qty,
                SUM(invoice_value) AS val
           FROM order_invoices WHERE order_id = $1
       ) inv
      WHERE o.id = $1`,
    [orderId]
  );
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
  party: string | null;
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
            it.ec_no,
            o.party,
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
  party: string | null;
  industry_type: string | null;
  nature_of_supply: string | null;
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
            o.party,
            o.industry_type,
            o.nature_of_supply,
            CASE WHEN it.seq = MIN(it.seq) OVER (PARTITION BY o.id)
                 THEN o.order_value::text END AS order_value,
            -- Any PI exists? (Billing progress in the pipeline: Tax Invoice
            -- SOs are "done" once at least one PI is added; Challan SOs are
            -- done once a challan number is filled on order_billing.)
            (EXISTS (SELECT 1 FROM order_billing_docs d WHERE d.order_id = o.id)
             OR b.challan_no IS NOT NULL) AS has_pi,
            a.payment_status,
            dr.drg_status,
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
  party: string | null;
  hold_reason: string | null;
  order_value: string | null;
};

/** SOs whose payment is on Hold (escalated to Central Visibility). */
export async function listPaymentHolds(): Promise<PaymentHoldRow[]> {
  const result = await query<PaymentHoldRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            o.party,
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
  contextColumns: ContextColumn[] = []
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

  const result = await query<Row>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            NULL::text AS ec_no,
            o.party
            ,${detailSelects}${contextSelects}
       FROM orders o
       LEFT JOIN ${table} d ON d.order_id = o.id
       ${extraJoinSql}
      ORDER BY o.sl_no ASC`
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
  contextColumns: ContextColumn[] = []
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
  const whereSql =
    table === "order_qc"
      ? `WHERE (o.qc_required IS NULL OR o.qc_required <> 'No')`
      : "";

  // Sections backed by a per-EC child list (Planning/Packing → packing slips)
  // carry those rows inline so the workspace can edit them without a round
  // trip. `client_type` rides along for the export-only column gate.
  // childKind is a schema constant, never user input — still pinned to the
  // known values so it can never widen what goes into the SQL text.
  const slipKind = section.childKind === "tentative" ? "tentative" : "actual";
  const childSelect =
    section.childTable === "order_packing_slips"
      ? `, o.nature_of_supply, o.packing_details_required,
         COALESCE((SELECT jsonb_agg(to_jsonb(ps) ORDER BY ps.seq)
                     FROM order_packing_slips ps
                    WHERE ps.item_id = it.id
                      AND ps.kind = '${slipKind}'),
                  '[]'::jsonb) AS child_rows`
      : "";

  const result = await query<Row>(
    `SELECT it.id,
            it.seq::int AS seq,
            o.sl_no::int AS sl_no,
            o.so_no,
            it.ec_no,
            it.item_type,
            o.party
            ${childSelect}
            ,${detailSelects}${contextSelects}
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
       LEFT JOIN ${table} d ON d.item_id = it.id
       ${extraJoinSql}
      ${whereSql}
      ORDER BY o.sl_no ASC, it.seq ASC`
  );
  return result.rows;
}

export type BillingQueueRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  party: string | null;
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
export async function listOrdersForBilling(): Promise<BillingQueueRow[]> {
  const result = await query<BillingQueueRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            o.party,
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
      ORDER BY o.sl_no ASC`
  );
  return result.rows;
}

export type PurchaseQueueRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
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
export async function listItemsForPurchase(): Promise<PurchaseQueueRow[]> {
  // BOI = No SOs don't need Purchase involvement — hide them from the queue.
  const result = await query<PurchaseQueueRow>(
    `SELECT it.id,
            o.sl_no::int AS sl_no,
            o.so_no,
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
      ORDER BY o.sl_no ASC, it.seq ASC`
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
export async function listOrders(): Promise<OrderListRow[]> {
  const result = await query<OrderListRow>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            to_char(o.so_date, 'YYYY-MM-DD') AS so_date,
            o.party,
            o.client_code,
            o.agent,
            o.po_no,
            o.order_type,
            o.order_value::text AS order_value,
            a.payment_status,
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
                         it.quantity::text AS quantity,
                         o.dispatch_status
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
