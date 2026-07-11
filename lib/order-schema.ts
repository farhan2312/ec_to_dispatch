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

export type OrderFieldType = "text" | "date" | "int" | "number";

export type OrderField = {
  column: string;
  label: string;
  type: OrderFieldType;
};

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
      { column: "nature_of_supply", label: "Nature of Supply", type: "text" },
      { column: "industry_type", label: "Industry Type", type: "text" },
      { column: "item", label: "Item", type: "text" },
      { column: "po_no", label: "PO No.", type: "text" },
      { column: "customer_po_date", label: "Customer PO Date", type: "date" },
      { column: "model_no", label: "Model No.", type: "text" },
      { column: "pump_qty", label: "If Pump (Qty)", type: "int" },
      { column: "orientation", label: "Orientation", type: "text" },
      { column: "liquid_application", label: "Liquid / Application", type: "text" },
      { column: "version", label: "Version", type: "text" },
      { column: "project", label: "Project", type: "text" },
      { column: "order_value", label: "Order Value", type: "number" },
    ],
  },
  {
    key: "billing",
    title: "Billing & Operations",
    table: "order_billing",
    fields: [
      { column: "payment_terms", label: "Payment Terms", type: "text" },
      { column: "freight_terms", label: "Freight Terms", type: "text" },
      { column: "packing_requirement", label: "Packing Requirement", type: "text" },
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
      { column: "payment_status", label: "Payment Status", type: "text" },
    ],
  },
  {
    key: "drawing",
    title: "Drawing",
    table: "order_drawing",
    fields: [
      { column: "drg_status", label: "DRG Status", type: "text" },
      { column: "drg_sent_to_client_date", label: "DRG Sent to Client", type: "date" },
      { column: "drg_approval_date", label: "DRG Approval Date", type: "date" },
      { column: "drg_target_date", label: "Target Date for DRG", type: "date" },
    ],
  },
  {
    key: "purchase",
    title: "Purchase",
    table: "order_purchase",
    fields: [
      { column: "boi", label: "BOI", type: "text" },
      { column: "gear_box", label: "Gear Box", type: "text" },
      { column: "gb_status", label: "GB Status", type: "text" },
      { column: "motor", label: "Motor", type: "text" },
      { column: "motor_status", label: "Motor Status", type: "text" },
      { column: "pending_parts", label: "Pending Parts / BOI Others", type: "text" },
      { column: "boi_receipt_date", label: "BOI Receipt Date", type: "date" },
      { column: "purchase_target_date", label: "Target Date for Purchase", type: "date" },
    ],
  },
  {
    key: "qc",
    title: "QC",
    table: "order_qc",
    fields: [
      { column: "required_qc_documents", label: "Required QC Documents", type: "text" },
      { column: "qc_doc_target_date", label: "Target Date for Doc. Submission", type: "date" },
      { column: "qc_doc_actual_date", label: "Actual Date of Doc. Submission", type: "date" },
      { column: "ld_applicable", label: "LD (Yes)", type: "text" },
    ],
  },
  {
    key: "planning",
    title: "Planning",
    table: "order_planning",
    fields: [
      { column: "ld_date", label: "LD Date", type: "date" },
      { column: "dispatch_target_date", label: "Dispatch Target Date", type: "date" },
      { column: "dispatch_target_revised_date", label: "Revised Dispatch Target Date", type: "date" },
      { column: "planning_documents_required", label: "Documents Required from Planning", type: "text" },
      { column: "pump_readiness_remarks", label: "Pump Readiness Remarks", type: "text" },
      { column: "planning_readiness_date", label: "Readiness Date Rcvd from Planning", type: "date" },
      { column: "final_packing_dispatch_date", label: "Final Date for Packing & Dispatch", type: "date" },
      { column: "planning_status", label: "Planning Status", type: "text" },
    ],
  },
  {
    key: "assembly_dispatch",
    title: "Assembly & Dispatch",
    table: "order_assembly_dispatch",
    fields: [
      { column: "actual_pump_status", label: "Actual Pump Status", type: "text" },
      { column: "assembled_packed_qty", label: "Assembled / Packed Qty", type: "text" },
      { column: "assembly_date", label: "Assembly Date", type: "date" },
      { column: "dispatch_documents_required", label: "Documents Required by Assembly/Dispatch", type: "text" },
      { column: "dispatch_team_target_date", label: "Target Date for Dispatch Team", type: "date" },
      { column: "actual_packing_date", label: "Actual Material Packing Date", type: "date" },
      { column: "delay_remarks", label: "Remarks / Reason of Delay", type: "text" },
      { column: "master_reason_of_delay", label: "Master Reason of Delay", type: "text" },
      { column: "dispatch_status", label: "Dispatch Status", type: "text" },
    ],
  },
];

export const SECTION_BY_TABLE = new Map<OrderTable, OrderSection>(
  ORDER_SECTIONS.map((s) => [s.table, s])
);

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
  return trimmed; // text, or date as 'YYYY-MM-DD'
}
