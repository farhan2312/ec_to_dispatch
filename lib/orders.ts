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
  "dispatch_target_date",
  "dispatch_target_revised_date",
  "drg_target_date",
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
  model_no: string | null;
  quantity: string | null;
  dispatch_target_date: string | null;
  drg_target_date: string | null;
  qc_doc_target_date: string | null;
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
  qc_required?: string;
  po_no?: string;
  customer_po_date?: string;
  payment_terms?: string;
  ld?: string;
  ld_date?: string;
  order_value?: string;
  order_currency?: string;
};

/** Fields captured when adding an EC/pump item (the Add-On form). */
export type NewItemInput = {
  ec_no?: string;
  ec_date?: string;
  item_type?: string;
  model_no?: string;
  quantity?: string;
  orientation?: string;
  pump_sno?: string;
  application?: string;
  version?: string;
  boi?: string;
  dispatch_target_date?: string;
  dispatch_target_revised_date?: string;
  drg_target_date?: string;
  qc_doc_target_date?: string;
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
        nature_of_supply, industry_type, po_no, customer_po_date,
        order_value, order_currency, qc_required, payment_terms, ld, ld_date
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
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
      nullify(input.po_no),
      nullify(input.customer_po_date),
      toNumeric(input.order_value),
      nullify(input.order_currency),
      nullify(input.qc_required),
      nullify(input.payment_terms),
      nullify(input.ld),
      nullify(input.ld_date),
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
        order_id, ec_no, ec_date, item_type, model_no, quantity, orientation,
        pump_sno, application, version, boi, dispatch_target_date,
        dispatch_target_revised_date, drg_target_date, qc_doc_target_date
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
     )
     RETURNING id, seq::int AS seq`,
    [
      orderId,
      nullify(input.ec_no),
      nullify(input.ec_date),
      nullify(input.item_type),
      nullify(input.model_no),
      toInt(input.quantity),
      nullify(input.orientation),
      nullify(input.pump_sno),
      nullify(input.application),
      nullify(input.version),
      nullify(input.boi),
      nullify(input.dispatch_target_date),
      nullify(input.dispatch_target_revised_date),
      nullify(input.drg_target_date),
      nullify(input.qc_doc_target_date),
    ]
  );
  return result.rows[0];
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
            it.model_no,
            it.quantity::text AS quantity,
            to_char(it.dispatch_target_date, 'YYYY-MM-DD') AS dispatch_target_date,
            to_char(it.drg_target_date, 'YYYY-MM-DD') AS drg_target_date,
            to_char(it.qc_doc_target_date, 'YYYY-MM-DD') AS qc_doc_target_date,
            ad.dispatch_status
       FROM order_items it
       LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
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
  items: Row[];
};

/** SO detail: core + billing + accounts + its EC items. */
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const result = await query<OrderDetail>(
    `SELECT
        to_jsonb(o)  AS order,
        to_jsonb(b)  AS order_billing,
        to_jsonb(ac) AS order_accounts,
        COALESCE((
          SELECT jsonb_agg(to_jsonb(x) ORDER BY x.seq)
            FROM (
              SELECT it.*, ad.dispatch_status
                FROM order_items it
                LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
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
              FROM order_lots l WHERE l.item_id = it.id), '[]'::jsonb) AS order_lots
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

  const fieldByColumn = new Map(section.fields.map((f) => [f.column, f]));
  const columns = Object.keys(values).filter((c) => fieldByColumn.has(c));
  if (columns.length === 0) return;

  const coerced = columns.map((c) =>
    coerceField(fieldByColumn.get(c)!.type, values[c])
  );

  // Base identity tables update by their own id.
  if (table === "orders" || table === "order_items") {
    const setClause = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, [
      id,
      ...coerced,
    ]);
    return;
  }

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

/** Add a blank lot to an EC item. */
export async function addChildRow(
  table: ChildTable,
  itemId: string
): Promise<void> {
  await query(`INSERT INTO ${table} (item_id) VALUES ($1)`, [itemId]);
}

/** Update a child (lot) row's fields, validated against the child schema. */
export async function updateChildRow(
  table: ChildTable,
  id: string,
  values: Record<string, string>
): Promise<void> {
  if (!UUID_RE.test(id)) return;
  const byColumn = new Map(CHILD_FIELDS[table].map((f) => [f.column, f]));
  const columns = Object.keys(values).filter((c) => byColumn.has(c));
  if (columns.length === 0) return;
  const coerced = columns.map((c) =>
    coerceField(byColumn.get(c)!.type, values[c])
  );
  const setClause = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");
  await query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, [id, ...coerced]);
}

/** Delete a child (lot) row by id. */
export async function deleteChildRow(
  table: ChildTable,
  id: string
): Promise<void> {
  if (!UUID_RE.test(id)) return;
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
            ad.dispatch_status
       FROM order_lots l
       JOIN order_items it ON it.id = l.item_id
       JOIN orders o ON o.id = it.order_id
       LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
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
  pi_no: string | null;
  payment_status: string | null;
  drg_status: string | null;
  gb_status: string | null;
  motor_status: string | null;
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
            b.pi_no,
            a.payment_status,
            dr.drg_status,
            pu.gb_status,
            pu.motor_status,
            (qc.qc_doc_actual_date IS NOT NULL) AS qc_submitted,
            o.qc_required,
            pl.planning_status,
            to_char(it.dispatch_target_date, 'YYYY-MM-DD') AS dispatch_target_date,
            ad.dispatch_status
       FROM order_items it
       JOIN orders o ON o.id = it.order_id
       LEFT JOIN order_billing b            ON b.order_id  = o.id
       LEFT JOIN order_accounts a           ON a.order_id  = o.id
       LEFT JOIN order_drawing dr           ON dr.item_id = it.id
       LEFT JOIN order_purchase pu          ON pu.item_id = it.id
       LEFT JOIN order_qc qc                ON qc.item_id = it.id
       LEFT JOIN order_planning pl          ON pl.item_id = it.id
       LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
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

  const result = await query<Row>(
    `SELECT it.id,
            it.seq::int AS seq,
            o.sl_no::int AS sl_no,
            o.so_no,
            it.ec_no,
            it.item_type,
            o.party
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
                         it.model_no,
                         it.quantity::text AS quantity,
                         to_char(it.dispatch_target_date, 'YYYY-MM-DD') AS dispatch_target_date,
                         to_char(it.drg_target_date, 'YYYY-MM-DD') AS drg_target_date,
                         to_char(it.qc_doc_target_date, 'YYYY-MM-DD') AS qc_doc_target_date,
                         ad.dispatch_status
                    FROM order_items it
                    LEFT JOIN order_assembly_dispatch ad ON ad.item_id = it.id
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
