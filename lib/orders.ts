import { pool, query } from "@/lib/db";
import type { ParsedOrder } from "@/lib/excel-import";
import {
  coerceField,
  SECTION_BY_TABLE,
  type OrderTable,
} from "@/lib/order-schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A row in the master list/table view. Pulls the core order plus a few
 * high-signal fields from the department detail tables (left-joined, so an
 * order with no detail yet still appears).
 */
export type OrderListRow = {
  id: string;
  sl_no: number;
  so_no: string | null;
  ec_no: string | null;
  party: string | null;
  item: string | null;
  model_no: string | null;
  pi_no: string | null;
  payment_status: string | null;
  dispatch_target_date: string | null;
  dispatch_status: string | null;
  order_value: string | null;
};

/** Fields captured when creating an order (the core `orders` identity row). */
export type NewOrderInput = {
  so_no?: string;
  ec_no?: string;
  ec_generated_date?: string;
  ec_rcvd_operations_date?: string;
  ec_sent_production_date?: string;
  file_no?: string;
  client_code?: string;
  client_type?: string;
  party?: string;
  agent?: string;
  nature_of_supply?: string;
  industry_type?: string;
  item?: string;
  po_no?: string;
  customer_po_date?: string;
  model_no?: string;
  pump_qty?: string;
  orientation?: string;
  liquid_application?: string;
  version?: string;
  project?: string;
  order_value?: string;
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

/** Insert a new core order. Detail tables are filled later per department. */
export async function createOrder(
  input: NewOrderInput
): Promise<{ id: string; sl_no: number }> {
  const result = await query<{ id: string; sl_no: number }>(
    `INSERT INTO orders (
        so_no, ec_no, ec_generated_date, ec_rcvd_operations_date,
        ec_sent_production_date, file_no, client_code, client_type, party, agent,
        nature_of_supply, industry_type, item, po_no, customer_po_date, model_no,
        pump_qty, orientation, liquid_application, version, project, order_value
     ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
     )
     RETURNING id, sl_no::int AS sl_no`,
    [
      nullify(input.so_no),
      nullify(input.ec_no),
      nullify(input.ec_generated_date),
      nullify(input.ec_rcvd_operations_date),
      nullify(input.ec_sent_production_date),
      nullify(input.file_no),
      nullify(input.client_code),
      nullify(input.client_type),
      nullify(input.party),
      nullify(input.agent),
      nullify(input.nature_of_supply),
      nullify(input.industry_type),
      nullify(input.item),
      nullify(input.po_no),
      nullify(input.customer_po_date),
      nullify(input.model_no),
      toInt(input.pump_qty),
      nullify(input.orientation),
      nullify(input.liquid_application),
      nullify(input.version),
      nullify(input.project),
      toNumeric(input.order_value),
    ]
  );
  return result.rows[0];
}

type Row = Record<string, unknown>;

export type OrderDetail = {
  order: Row;
  order_billing: Row | null;
  order_accounts: Row | null;
  order_drawing: Row | null;
  order_purchase: Row | null;
  order_qc: Row | null;
  order_planning: Row | null;
  order_assembly_dispatch: Row | null;
  order_pumps: Row[];
  order_lots: Row[];
};

/** Full record for one order: core + all department detail + pumps/lots. */
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const result = await query<OrderDetail>(
    `SELECT
        to_jsonb(o)  AS order,
        to_jsonb(b)  AS order_billing,
        to_jsonb(ac) AS order_accounts,
        to_jsonb(dr) AS order_drawing,
        to_jsonb(pu) AS order_purchase,
        to_jsonb(qc) AS order_qc,
        to_jsonb(pl) AS order_planning,
        to_jsonb(ad) AS order_assembly_dispatch,
        COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at)
                  FROM order_pumps p WHERE p.order_id = o.id), '[]'::jsonb) AS order_pumps,
        COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at)
                  FROM order_lots l WHERE l.order_id = o.id), '[]'::jsonb) AS order_lots
       FROM orders o
       LEFT JOIN order_billing b            ON b.order_id  = o.id
       LEFT JOIN order_accounts ac          ON ac.order_id = o.id
       LEFT JOIN order_drawing dr           ON dr.order_id = o.id
       LEFT JOIN order_purchase pu          ON pu.order_id = o.id
       LEFT JOIN order_qc qc                ON qc.order_id = o.id
       LEFT JOIN order_planning pl          ON pl.order_id = o.id
       LEFT JOIN order_assembly_dispatch ad ON ad.order_id = o.id
      WHERE o.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * Update one department section of an order. For the core `orders` table this
 * is an UPDATE; for a 1:1 detail table it upserts on order_id. Column names are
 * validated against the section schema (never taken raw from the client).
 */
export async function updateOrderSection(
  orderId: string,
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

  if (table === "orders") {
    const setClause = columns.map((c, i) => `${c} = $${i + 2}`).join(", ");
    await query(`UPDATE orders SET ${setClause} WHERE id = $1`, [
      orderId,
      ...coerced,
    ]);
    return;
  }

  const insertCols = ["order_id", ...columns];
  const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
  const updateClause = columns.map((c) => `${c} = EXCLUDED.${c}`).join(", ");
  await query(
    `INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${placeholders})
     ON CONFLICT (order_id) DO UPDATE SET ${updateClause}`,
    [orderId, ...coerced]
  );
}

// 1:1 detail tables keyed by order_id.
const DETAIL_TABLES = [
  "order_billing",
  "order_accounts",
  "order_drawing",
  "order_purchase",
  "order_qc",
  "order_planning",
  "order_assembly_dispatch",
] as const;

// 1:many child tables (own id, FK order_id).
const CHILD_TABLES = ["order_pumps", "order_lots"] as const;

function insertSql(table: string, columns: string[]): string {
  const cols = columns.join(", ");
  const params = columns.map((_, i) => `$${i + 1}`).join(", ");
  return `INSERT INTO ${table} (${cols}) VALUES (${params})`;
}

/**
 * Bulk-insert parsed orders (from an Excel import) inside one transaction.
 * Each row inserts the core order, then any populated detail/child tables.
 * Column names come from the controlled import mapping, not user input.
 */
export async function insertParsedOrders(
  rows: ParsedOrder[]
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;

    for (const row of rows) {
      const core = row.orders ?? {};
      const coreCols = Object.keys(core);
      const orderResult = coreCols.length
        ? await client.query<{ id: string }>(
            `${insertSql("orders", coreCols)} RETURNING id`,
            coreCols.map((c) => core[c])
          )
        : await client.query<{ id: string }>(
            "INSERT INTO orders DEFAULT VALUES RETURNING id"
          );
      const orderId = orderResult.rows[0].id;

      for (const table of DETAIL_TABLES) {
        const data = row[table];
        if (!data || Object.keys(data).length === 0) continue;
        const cols = ["order_id", ...Object.keys(data)];
        await client.query(insertSql(table, cols), [
          orderId,
          ...Object.keys(data).map((c) => data[c]),
        ]);
      }

      for (const table of CHILD_TABLES) {
        const data = row[table];
        if (!data || Object.keys(data).length === 0) continue;
        const cols = ["order_id", ...Object.keys(data)];
        await client.query(insertSql(table, cols), [
          orderId,
          ...Object.keys(data).map((c) => data[c]),
        ]);
      }

      inserted++;
    }

    await client.query("COMMIT");
    return { inserted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Orders with their core identity plus one department section's fields, for a
 * department workspace queue. `table` must be a 1:1 detail table (not `orders`).
 * Date/number columns are returned as strings ready for form inputs.
 */
export async function listOrdersForSection(
  table: OrderTable
): Promise<Record<string, unknown>[]> {
  const section = SECTION_BY_TABLE.get(table);
  if (!section || table === "orders") return [];

  const detailSelects = section.fields
    .map((f) => {
      if (f.type === "date") {
        return `to_char(d.${f.column}, 'YYYY-MM-DD') AS ${f.column}`;
      }
      if (f.type === "int" || f.type === "number") {
        return `d.${f.column}::text AS ${f.column}`;
      }
      return `d.${f.column}`;
    })
    .join(", ");

  const result = await query<Record<string, unknown>>(
    `SELECT o.id,
            o.sl_no::int AS sl_no,
            o.so_no,
            o.ec_no,
            o.party,
            o.item,
            ${detailSelects}
       FROM orders o
       LEFT JOIN ${table} d ON d.order_id = o.id
      ORDER BY o.sl_no ASC`
  );
  return result.rows;
}

/** All orders for the master table, ordered by Sl. No. */
export async function listOrders(): Promise<OrderListRow[]> {
  const result = await query<OrderListRow>(
    `SELECT o.id,
            o.sl_no::int              AS sl_no,
            o.so_no,
            o.ec_no,
            o.party,
            o.item,
            o.model_no,
            o.order_value::text       AS order_value,
            b.pi_no,
            a.payment_status,
            to_char(p.dispatch_target_date, 'YYYY-MM-DD') AS dispatch_target_date,
            ad.dispatch_status
       FROM orders o
       LEFT JOIN order_billing b            ON b.order_id  = o.id
       LEFT JOIN order_accounts a           ON a.order_id  = o.id
       LEFT JOIN order_planning p           ON p.order_id  = o.id
       LEFT JOIN order_assembly_dispatch ad ON ad.order_id = o.id
      ORDER BY o.sl_no ASC`
  );
  return result.rows;
}
