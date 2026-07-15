// Shared definition of the order's editable sections/fields. Used by the
// detail/edit UI (client) and the update logic (server), so column names and
// types stay in one place. Plain module — safe to import anywhere.

export type OrderTable =
  | "orders"
  | "order_billing"
  | "order_accounts"
  | "order_drawing"
  | "order_purchase"
  | "order_qc"
  | "order_planning"
  | "order_assembly_dispatch";

export type OrderFieldType = "text" | "date" | "int" | "number" | "select";

export type OrderField = {
  column: string;
  label: string;
  type: OrderFieldType;
  options?: { value: string; label: string }[];
  // When set, the field only applies while another field equals `value`
  // (e.g. GB Status only when Gear Box = "Yes").
  dependsOn?: { column: string; value: string };
  // When true, only Central Visibility / Admin may edit this field; the owning
  // department sees it read-only (e.g. LD in the Planning section).
  centralOnly?: boolean;
};

/** Turn a list of strings into { value, label } option objects. */
function opts(values: string[]): { value: string; label: string }[] {
  return values.map((v) => ({ value: v, label: v }));
}

const YES_NO = opts(["Yes", "No"]);
const PART_STATUS = opts(["PENDING", "RECEIVED", "AVAILABLE STOCK"]);

export const NATURE_OF_SUPPLY_OPTIONS = opts([
  "Domestic",
  "Merchant Export",
  "Export",
]);
export const INDUSTRY_TYPE_OPTIONS = opts(["Sugar", "Non Sugar"]);

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
  fields: OrderField[];
};

export const ORDER_SECTIONS: OrderSection[] = [
  {
    key: "core",
    title: "Order details",
    table: "orders",
    fields: [
      { column: "so_no", label: "SO No.", type: "text" },
      { column: "ec_no", label: "EC No.", type: "text" },
      { column: "ec_generated_date", label: "EC Generated Date", type: "date" },
      { column: "ec_rcvd_operations_date", label: "EC Received in Operations", type: "date" },
      { column: "ec_sent_production_date", label: "EC Sent to Production", type: "date" },
      { column: "file_no", label: "File No.", type: "text" },
      { column: "client_code", label: "Client Code", type: "text" },
      { column: "client_type", label: "Client Type", type: "text" },
      { column: "party", label: "Party", type: "text" },
      { column: "agent", label: "Agent", type: "text" },
      {
        column: "nature_of_supply",
        label: "Nature of Supply",
        type: "select",
        options: NATURE_OF_SUPPLY_OPTIONS,
      },
      {
        column: "industry_type",
        label: "Industry Type",
        type: "select",
        options: INDUSTRY_TYPE_OPTIONS,
      },
      { column: "item", label: "Item", type: "text" },
      { column: "po_no", label: "PO No.", type: "text" },
      { column: "customer_po_date", label: "Customer PO Date", type: "date" },
      { column: "model_no", label: "Model No.", type: "text" },
      { column: "pump_qty", label: "If Pump (Qty)", type: "int" },
      { column: "pump_sno", label: "Pump S.No.", type: "text" },
      { column: "orientation", label: "Orientation", type: "text" },
      { column: "liquid_application", label: "Liquid / Application", type: "text" },
      { column: "version", label: "Version", type: "text" },
      { column: "project", label: "Project", type: "text" },
      { column: "payment_terms", label: "Payment Terms", type: "text" },
      { column: "master_reason_of_delay", label: "Master Reason of Delay", type: "text" },
      { column: "dispatch_target_date", label: "Dispatch Target Date", type: "date" },
      {
        column: "dispatch_target_revised_date",
        label: "Revised Dispatch Target Date",
        type: "date",
      },
      { column: "drg_target_date", label: "Target Date for DRG", type: "date" },
      { column: "order_value", label: "Order Value", type: "number" },
    ],
  },
  {
    key: "billing",
    title: "Billing & Operations",
    table: "order_billing",
    fields: [
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
      { column: "pi_no", label: "PI No.", type: "text" },
      { column: "pi_date", label: "PI Date", type: "date" },
      { column: "pi_value", label: "PI Value", type: "number" },
    ],
  },
  {
    key: "accounts",
    title: "Accounts",
    table: "order_accounts",
    fields: [
      {
        column: "payment_status",
        label: "Payment Status",
        type: "select",
        options: PAYMENT_STATUS_OPTIONS,
      },
      {
        column: "payment_confirmed_date",
        label: "Payment Confirmed Date",
        type: "date",
      },
      { column: "hold_reason", label: "Hold Reason (escalation)", type: "text" },
    ],
  },
  {
    key: "drawing",
    title: "Drawing",
    table: "order_drawing",
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
    key: "purchase",
    title: "Purchase",
    table: "order_purchase",
    fields: [
      { column: "boi", label: "BOI", type: "select", options: YES_NO },
      { column: "gear_box", label: "Gear Box", type: "select", options: YES_NO },
      {
        column: "gb_status",
        label: "GB Status",
        type: "select",
        options: PART_STATUS,
        dependsOn: { column: "gear_box", value: "Yes" },
      },
      { column: "motor", label: "Motor", type: "select", options: YES_NO },
      {
        column: "motor_status",
        label: "Motor Status",
        type: "select",
        options: PART_STATUS,
        dependsOn: { column: "motor", value: "Yes" },
      },
      { column: "pending_parts", label: "Pending Parts / BOI Others", type: "text" },
      { column: "boi_receipt_date", label: "BOI Receipt Date", type: "date" },
      { column: "remarks", label: "Remarks", type: "text" },
    ],
  },
  {
    key: "qc",
    title: "QC",
    table: "order_qc",
    fields: [
      {
        column: "required_qc_documents",
        label: "Required QC Documents",
        type: "select",
        options: opts(["MTC", "IIR", "DIMENSIONAL Report"]),
      },
      { column: "qc_doc_target_date", label: "Target Date for Doc. Submission", type: "date" },
      { column: "qc_doc_actual_date", label: "Actual Date of Doc. Submission", type: "date" },
      { column: "remarks", label: "Remarks", type: "text" },
    ],
  },
  {
    key: "planning",
    title: "Planning",
    table: "order_planning",
    fields: [
      // Filled by Central Visibility, read-only to Planning.
      { column: "ld", label: "LD", type: "select", options: YES_NO, centralOnly: true },
      { column: "ld_date", label: "LD Date", type: "date", centralOnly: true },
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
      { column: "final_packing_dispatch_date", label: "Final Date for Packing & Dispatch", type: "date" },
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
    fields: [
      { column: "dispatch_documents_required", label: "Documents Required by Assembly/Dispatch", type: "text" },
      { column: "dispatch_team_target_date", label: "Target Date for Dispatch Team", type: "date" },
      { column: "actual_packing_date", label: "Actual Material Packing Date", type: "date" },
      { column: "delay_remarks", label: "Remarks / Reason of Delay", type: "text" },
      {
        column: "dispatch_status",
        label: "Dispatch Status",
        type: "select",
        options: opts(["LOT dispatch", "Fully dispatch"]),
      },
    ],
  },
];

export const SECTION_BY_TABLE = new Map<OrderTable, OrderSection>(
  ORDER_SECTIONS.map((s) => [s.table, s])
);

// Dispatch lots are the one remaining 1:many child (an order can have many).
export type ChildTable = "order_lots";

export const LOT_FIELDS: OrderField[] = [
  { column: "lot_no", label: "Lot No.", type: "text" },
  { column: "lot_dispatch_date", label: "Lot Wise Dispatch Date", type: "date" },
  { column: "packing_slip_remark", label: "Packing Slip Remark", type: "text" },
  { column: "invoice_date", label: "Invoice Date", type: "date" },
];

export const CHILD_FIELDS: Record<ChildTable, OrderField[]> = {
  order_lots: LOT_FIELDS,
};

// Payment Terms (owned by Central Visibility) shown read-only in the Billing &
// Operations and Accounts workspaces.
export const PAYMENT_TERMS_CONTEXT_FIELDS: OrderField[] = [
  { column: "payment_terms", label: "Payment Terms", type: "text" },
];

// Target Date for DRG (owned by Central Visibility) shown read-only in Drawing.
export const DRAWING_CONTEXT_FIELDS: OrderField[] = [
  { column: "drg_target_date", label: "Target Date for DRG", type: "date" },
];

// Target Date for Purchase (owned by Planning) shown read-only in Purchase.
export const PURCHASE_CONTEXT_FIELDS: OrderField[] = [
  { column: "purchase_target_date", label: "Target Date for Purchase", type: "date" },
];

// Order-level dispatch dates (owned by Central Visibility) shown read-only in
// the Planning workspace, so Planning sees the dates it must schedule to.
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
