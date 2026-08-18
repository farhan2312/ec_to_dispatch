// Shared definition of the order's editable sections/fields. Used by the
// detail/edit UI (client) and the update logic (server), so column names and
// types stay in one place. Plain module — safe to import anywhere.

export type OrderTable =
  | "orders"
  | "order_items"
  | "order_billing"
  | "order_accounts"
  | "order_drawing"
  | "order_purchase"
  | "order_qc"
  | "order_planning"
  | "order_assembly_dispatch";

// SO-level tables are keyed by order_id (one row per sales order); item-level
// tables are keyed by item_id (one row per EC/pump). Drives which reader/writer
// path and which detail page a section belongs to.
export type SectionScope = "so" | "item";

export type OrderFieldType = "text" | "date" | "int" | "number" | "select";

export type OrderField = {
  column: string;
  label: string;
  type: OrderFieldType;
  options?: { value: string; label: string }[];
  // When set, the field only applies while every listed field equals its
  // `value` (e.g. GB Status only when Gear Box = "Yes"; AND-ed together so a
  // field can gate on more than one condition, e.g. BOI = "Yes" AND Gear Box
  // = "Yes").
  dependsOn?: { column: string; value: string }[];
  // When true, only Central Visibility / Admin may edit this field; the owning
  // department sees it read-only (e.g. LD in the Planning section).
  centralOnly?: boolean;
  // When true, the field is never editable — it's derived and displayed only
  // (e.g. Balance of Payment = order value − amount received, set server-side).
  computed?: boolean;
};

/** Turn a list of strings into { value, label } option objects. */
function opts(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v }));
}

const YES_NO = opts(["Yes", "No"]);
export const YES_NO_OPTIONS = YES_NO;

export const INDUSTRY_TYPE_OPTIONS = opts(["Sugar", "Non Sugar"]);
export const CURRENCY_OPTIONS = opts(["INR", "USD"]);
export const ITEM_OPTIONS = opts(["Pump", "Spare", "ROLB"]);
// SO-level Order Type; each EC/Add-On inherits it as its item_type.
export const ORDER_TYPE_OPTIONS = opts(["Pump", "Spare"]);
// Bill Type (SO-level) — decides which billing document fields apply to each
// PI: Tax Invoice → PI No./Date/Value; Challan → Challan No./Date/Value + FR.
export const BILL_TYPE_OPTIONS = opts(["Tax Invoice", "Challan"]);
// FR (financial reconciliation) reason for a Challan.
export const FR_REASON_OPTIONS = opts([
  "Wrong supply",
  "Short supply",
  "Damage",
  "FOC",
]);
// Bought-out items Purchase can add under an EC when the SO's BOI = Yes.
export const BOI_ITEM_OPTIONS = opts([
  "Gear Box",
  "Motor",
  "VFD",
  "Panel",
  "Strainers",
  "Mechanical seal",
  "Gland Packing",
  "Pully",
  "Others",
]);
export const DISPATCH_STATUS_OPTIONS = opts([
  "Pending",
  "LOT dispatch",
  "Fully dispatch",
]);

// Payment status values. "Outstanding hold" is the escalation trigger.
export const PAYMENT_HOLD_VALUE = "Outstanding hold";
export const PAYMENT_STATUS_OPTIONS = opts([
  "Outstanding hold",
  "Payment Rcvd",
  "Advance Rcvd",
  "Advance Rcvd & Balance payment Awaited",
  "Payment Awaited",
  "After Receipt",
]);

export type OrderSection = {
  key: string;
  title: string;
  table: OrderTable;
  scope: SectionScope;
  fields: OrderField[];
  // A section may render a 1:many child list instead of / alongside flat
  // fields (e.g. Purchase → BOI items). Shown only when childGate is satisfied
  // by the parent SO/EC data (e.g. the SO's boi = Yes).
  childTable?: ChildTable;
  childGate?: { column: string; value: string };
};

export const ORDER_SECTIONS: OrderSection[] = [
  {
    key: "core",
    title: "Order details",
    table: "orders",
    scope: "so",
    fields: [
      // Client — client_code and client_type are compulsory at creation.
      { column: "client_code", label: "Client Code", type: "text" },
      { column: "party", label: "Client Name", type: "text" },
      { column: "industry_type", label: "Industry", type: "text" },
      { column: "client_type", label: "Client Type", type: "text" },
      { column: "nature_of_supply", label: "Market Type", type: "text" },
      { column: "agent", label: "Rep(s)", type: "text" },

      // Purchase Order Details.
      // SO Order Type — every EC added under this SO inherits it.
      {
        column: "order_type",
        label: "Order Type",
        type: "select",
        options: ORDER_TYPE_OPTIONS,
      },
      {
        column: "bill_type",
        label: "Bill Type",
        type: "select",
        options: BILL_TYPE_OPTIONS,
      },
      // BOI (bought-out items) flag — Purchase sees it read-only and, when Yes,
      // adds the individual BOI items per EC.
      { column: "boi", label: "BOI", type: "select", options: YES_NO },
      { column: "po_no", label: "Purchase Order Number", type: "text" },
      { column: "customer_po_date", label: "Purchase Order Date", type: "date" },
      {
        column: "order_value",
        label: "Purchase/Sales Order Value (without GST)",
        type: "number",
      },
      {
        column: "order_currency",
        label: "Currency",
        type: "select",
        options: CURRENCY_OPTIONS,
      },
      { column: "so_no", label: "Sales Order Number", type: "text" },
      { column: "so_date", label: "Sales Order Date", type: "date" },

      // Operations — freight & packing (visible read-only to Billing).
      {
        column: "freight_terms",
        label: "Freight Terms",
        type: "select",
        options: opts(["Paid", "To Pay"]),
      },
      {
        column: "packing_requirement",
        label: "Packing Requirement",
        type: "select",
        options: opts(["Wooden Box", "Loose"]),
      },

      // 'No' means the QC department isn't involved for this order — its ECs
      // are skipped by the QC workspace and QC reminders.
      {
        column: "qc_required",
        label: "QC Req",
        type: "select",
        options: YES_NO,
      },

      // Commercial. Payment Terms is free text (varies per order).
      { column: "payment_terms", label: "Payment Terms", type: "text" },
      { column: "ld", label: "LD", type: "select", options: YES_NO },
      {
        column: "ld_date",
        label: "LD Date",
        type: "date",
        dependsOn: [{ column: "ld", value: "Yes" }],
      },

      // --- Everything below is commented out, not deleted: the orders table
      // was trimmed to Client + Purchase Order Details columns only, and
      // these columns don't exist right now. Restore a block verbatim (and
      // re-add its column via ALTER TABLE) when that data comes back.
      //
      // // Order identity.
      // { column: "ec_no", label: "EC No.", type: "text" },
      // { column: "ec_generated_date", label: "EC Generated Date", type: "date" },
      // { column: "ec_rcvd_operations_date", label: "EC Received in Operations", type: "date" },
      // { column: "ec_sent_production_date", label: "EC Sent to Production", type: "date" },
      // { column: "file_no", label: "File No.", type: "text" },
      //
      // // Item (remaining columns).
      // { column: "model_no", label: "Model No.", type: "text" },
      // { column: "pump_qty", label: "If Pump (Qty)", type: "int" },
      // { column: "pump_sno", label: "Pump S.No.", type: "text" },
      // { column: "orientation", label: "Orientation", type: "text" },
      // { column: "liquid_application", label: "Liquid / Application", type: "text" },
      // { column: "version", label: "Version", type: "text" },
      //
      // // Commercial & dispatch (remaining columns).
      // { column: "project", label: "Project", type: "select", options: YES_NO },
      // { column: "master_reason_of_delay", label: "Master Reason of Delay", type: "text" },
      // { column: "dispatch_target_date", label: "Dispatch Target Date", type: "date" },
      // {
      //   column: "dispatch_target_revised_date",
      //   label: "Revised Dispatch Target Date",
      //   type: "date",
      // },
      // { column: "drg_target_date", label: "Target Date for DRG", type: "date" },
    ],
  },
  {
    // The EC / pump-or-spare line item under an SO. Central Visibility fills
    // this on the Add-On form; it carries the per-EC intake attributes and the
    // target dates each department works to.
    key: "item",
    title: "EC / Pump order",
    table: "order_items",
    scope: "item",
    fields: [
      { column: "ec_no", label: "EC No.", type: "text" },
      { column: "ec_date", label: "EC Date", type: "date" },
      {
        column: "item_type",
        label: "Pump Type",
        type: "select",
        options: ITEM_OPTIONS,
      },
      { column: "model_no", label: "Model No.", type: "text" },
      { column: "quantity", label: "Quantity", type: "int" },
      { column: "orientation", label: "Pump Orientation", type: "text" },
      { column: "pump_sno", label: "Pump Serial No.", type: "text" },
      { column: "application", label: "Application", type: "text" },
      { column: "version", label: "Series Version", type: "text" },
      { column: "dispatch_target_date", label: "Dispatch Date", type: "date" },
      {
        column: "dispatch_target_revised_date",
        label: "Revised Dispatch Date",
        type: "date",
      },
      { column: "drg_target_date", label: "Target Date for Drawing", type: "date" },
      { column: "qc_doc_target_date", label: "QC Target Date", type: "date" },
    ],
  },
  {
    // Billing shape depends on the SO's Bill Type:
    //  • Tax Invoice → PI list (order_billing_docs, add-on to create more).
    //  • Challan     → one flat set of challan fields on order_billing.
    key: "billing",
    title: "Billing & Operations",
    table: "order_billing",
    scope: "so",
    fields: [
      { column: "challan_no", label: "Challan No.", type: "text", dependsOn: [{ column: "bill_type", value: "Challan" }] },
      { column: "challan_date", label: "Challan Date", type: "date", dependsOn: [{ column: "bill_type", value: "Challan" }] },
      { column: "challan_value", label: "Challan Value", type: "number", dependsOn: [{ column: "bill_type", value: "Challan" }] },
      {
        column: "fr_reason",
        label: "FR Reason",
        type: "select",
        options: FR_REASON_OPTIONS,
        dependsOn: [{ column: "bill_type", value: "Challan" }],
      },
    ],
    childTable: "order_billing_docs",
    childGate: { column: "bill_type", value: "Tax Invoice" },
  },
  {
    // Accounts is per-SO. The PI list is view-only here (a "View PIs" button
    // on the edit form opens Billing's PI list). Balance of Payment auto =
    // order value − amount received, recomputed on save.
    key: "accounts",
    title: "Accounts",
    table: "order_accounts",
    scope: "so",
    fields: [
      {
        column: "payment_status",
        label: "Payment Status",
        type: "select",
        options: PAYMENT_STATUS_OPTIONS,
      },
      { column: "payment_confirmed_date", label: "Payment Confirmed Date", type: "date" },
      { column: "amount_received", label: "Amount Received (without GST)", type: "number" },
      {
        column: "balance_of_payment",
        label: "Balance of Payment",
        type: "number",
        computed: true,
      },
      { column: "hold_reason", label: "Hold Reason (escalation)", type: "text" },
    ],
  },
  {
    key: "drawing",
    title: "Drawing",
    table: "order_drawing",
    scope: "item",
    fields: [
      {
        column: "drg_status",
        label: "DRG Status",
        type: "select",
        options: opts(["Drg. Not issued", "Drg Not Approved", "Drg approved"]),
      },
      { column: "drg_sent_to_client_date", label: "DRG Sent to Client", type: "date" },
      { column: "drg_approval_date", label: "DRG Approval Date", type: "date" },
    ],
  },
  {
    // Purchase is now a per-EC list of bought-out items (order_boi_items),
    // shown only when the SO's BOI = Yes. No flat fields of its own.
    key: "purchase",
    title: "Purchase",
    table: "order_purchase",
    scope: "item",
    fields: [],
    childTable: "order_boi_items",
    childGate: { column: "boi", value: "Yes" },
  },
  {
    key: "qc",
    title: "QC",
    table: "order_qc",
    scope: "item",
    fields: [
      // Filled by Central Visibility, read-only to QC. (The QC target date is
      // now an EC attribute — see the item section / QC_CONTEXT_FIELDS.)
      {
        column: "required_qc_documents",
        label: "Required QC Documents",
        type: "text",
        centralOnly: true,
      },
      // Filled by QC.
      { column: "qc_doc_actual_date", label: "Actual Date of Doc. Submission", type: "date" },
      { column: "remarks", label: "Remarks", type: "text" },
    ],
  },
  {
    key: "planning",
    title: "Planning",
    table: "order_planning",
    scope: "item",
    fields: [
      // Filled by Central Visibility, read-only to Planning.
      {
        column: "planning_documents_required",
        label: "Documents Required from Planning",
        type: "text",
        centralOnly: true,
      },
      // Filled by Planning.
      { column: "purchase_target_date", label: "Target Date for Purchase", type: "date" },
      { column: "pump_readiness_remarks", label: "Pump Readiness Remarks", type: "text" },
      { column: "planning_readiness_date", label: "Readiness Date Rcvd from Planning", type: "date" },
      { column: "planning_status", label: "Planning Status", type: "text" },
      {
        column: "actual_pump_status",
        label: "Actual Pump Status",
        type: "select",
        options: opts([
          "Date awaited",
          "EC under preparation",
          "Partial assembled",
          "In plan",
          "Assembled",
          "Packed",
        ]),
      },
      { column: "assembled_packed_qty", label: "Assembled / Packed Qty", type: "text" },
      { column: "assembly_date", label: "Assembly Date", type: "date" },
    ],
  },
  {
    key: "assembly_dispatch",
    title: "Assembly & Dispatch",
    table: "order_assembly_dispatch",
    scope: "item",
    fields: [
      {
        column: "dispatch_documents_required",
        label: "Documents Required by Assembly/Dispatch",
        type: "text",
        centralOnly: true,
      },
      {
        column: "dispatch_team_target_date",
        label: "Target Date for Dispatch Team",
        type: "date",
        centralOnly: true,
      },
      { column: "final_packing_dispatch_date", label: "Final Date for Packing & Dispatch", type: "date" },
      { column: "actual_packing_date", label: "Actual Material Packing Date", type: "date" },
      { column: "delay_remarks", label: "Remarks / Reason of Delay", type: "text" },
      {
        column: "dispatch_status",
        label: "Dispatch Status",
        type: "select",
        options: DISPATCH_STATUS_OPTIONS,
      },
    ],
  },
];

export const SECTION_BY_TABLE = new Map<OrderTable, OrderSection>(
  ORDER_SECTIONS.map((s) => [s.table, s])
);

// SO-level sections (keyed by order_id) shown on the order "Open" detail;
// item-level sections (keyed by item_id) shown on an EC's detail page.
export const SO_SECTIONS = ORDER_SECTIONS.filter((s) => s.scope === "so");
export const ITEM_SECTIONS = ORDER_SECTIONS.filter((s) => s.scope === "item");

/**
 * For a select field, the option value that matches `raw` case-insensitively;
 * otherwise `raw` trimmed. Lets a stored value like "yes" or "PUMP" (from an
 * import with loose casing) resolve to the canonical option "Yes" / "Pump", so
 * the dropdown shows it and a save writes it back cleanly. Non-select fields
 * and unmatched values are returned unchanged.
 */
export function canonicalSelectValue(field: OrderField, raw: string): string {
  const t = (raw ?? "").trim();
  if (field.type !== "select" || !field.options || t === "") return t;
  const match = field.options.find(
    (o) => o.value.toLowerCase() === t.toLowerCase()
  );
  return match ? match.value : t;
}

/**
 * The option list to render for a select, with the current value appended when
 * it isn't already one of the defined options — so an unrecognized stored value
 * still displays (and is preserved on save) rather than showing blank.
 */
export function selectOptionsFor(
  field: OrderField,
  current: string
): { value: string; label: string }[] {
  const opts = field.options ?? [];
  const t = (current ?? "").trim();
  if (t !== "" && !opts.some((o) => o.value === t)) {
    return [...opts, { value: t, label: t }];
  }
  return opts;
}

// 1:many children: dispatch lots + BOI items (per EC), PIs (per SO).
export type ChildTable = "order_lots" | "order_boi_items" | "order_billing_docs";

// A PI under an SO (Tax Invoice bill type only). Billing owns these fields;
// each save fires a "PI created" notification to Accounts (see actions.ts).
export const BILLING_DOC_FIELDS: OrderField[] = [
  { column: "pi_no", label: "PI No.", type: "text" },
  { column: "pi_date", label: "PI Date", type: "date" },
  { column: "pi_value", label: "PI Value", type: "number" },
];

export const LOT_FIELDS: OrderField[] = [
  { column: "lot_no", label: "Lot No.", type: "text" },
  { column: "lot_dispatch_date", label: "Lot Wise Dispatch Date", type: "date" },
  { column: "packing_slip_remark", label: "Packing Slip Remark", type: "text" },
  { column: "invoice_date", label: "Invoice Date", type: "date" },
];

export const BOI_ITEM_FIELDS: OrderField[] = [
  { column: "boi_item", label: "Item", type: "select", options: BOI_ITEM_OPTIONS },
  {
    column: "boi_item_other",
    label: "Item (Others)",
    type: "text",
    dependsOn: [{ column: "boi_item", value: "Others" }],
  },
  { column: "receipt_date", label: "Receipt Date", type: "date" },
  { column: "remarks", label: "Remarks", type: "text" },
];

export const CHILD_FIELDS: Record<ChildTable, OrderField[]> = {
  order_lots: LOT_FIELDS,
  order_boi_items: BOI_ITEM_FIELDS,
  order_billing_docs: BILLING_DOC_FIELDS,
};

// Payment Terms (owned by Central Visibility) shown read-only in the Accounts
// workspace.
export const PAYMENT_TERMS_CONTEXT_FIELDS: OrderField[] = [
  { column: "payment_terms", label: "Payment Terms", type: "text" },
];

// Billing's read-only SO context: Payment Terms / Bill Type / Freight /
// Packing. bill_type is what each PI's document fields gate on. (Amount
// Received / Balance are per-PI now — see BILLING_DOC_FIELDS.)
export const BILLING_CONTEXT_FIELDS: OrderField[] = [
  { column: "payment_terms", label: "Payment Terms", type: "text" },
  {
    column: "bill_type",
    label: "Bill Type",
    type: "select",
    options: BILL_TYPE_OPTIONS,
  },
  {
    column: "freight_terms",
    label: "Freight Terms",
    type: "select",
    options: opts(["Paid", "To Pay"]),
  },
  {
    column: "packing_requirement",
    label: "Packing Requirement",
    type: "select",
    options: opts(["Wooden Box", "Loose"]),
  },
];

// Target Date for Drawing — an EC attribute (order_items) shown read-only in
// the Drawing workspace.
export const DRAWING_CONTEXT_FIELDS: OrderField[] = [
  { column: "drg_target_date", label: "Target Date for Drawing", type: "date" },
];

// QC target date — an EC attribute (order_items) shown read-only in the QC
// workspace (Central Visibility sets it on the Add-On form).
export const QC_CONTEXT_FIELDS: OrderField[] = [
  { column: "qc_doc_target_date", label: "QC Target Date", type: "date" },
];

// BOI (SO-level, on orders), Target Date for Purchase (on order_planning) and
// LD / LD Date (SO-level) shown read-only in the Purchase workspace.
export const PURCHASE_CONTEXT_FIELDS: OrderField[] = [
  { column: "boi", label: "BOI", type: "select", options: YES_NO },
  { column: "purchase_target_date", label: "Target Date for Purchase", type: "date" },
  { column: "ld", label: "LD", type: "select", options: YES_NO },
  { column: "ld_date", label: "LD Date", type: "date" },
];

// Per-EC dispatch dates (order_items) shown read-only in the Planning
// workspace, so Planning sees the dates it must schedule to.
export const PLANNING_CONTEXT_FIELDS: OrderField[] = [
  { column: "dispatch_target_date", label: "Dispatch Target Date", type: "date" },
  {
    column: "dispatch_target_revised_date",
    label: "Revised Dispatch Target Date",
    type: "date",
  },
];

/** Coerce a raw form string to the storable value for a field type. */
export function coerceField(
  type: OrderFieldType,
  raw: string | undefined
): string | number | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  if (type === "int") {
    const n = Number.parseInt(trimmed, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (type === "number") {
    const n = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return trimmed; // text, select, or date as 'YYYY-MM-DD'
}
