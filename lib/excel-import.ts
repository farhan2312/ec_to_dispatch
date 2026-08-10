// Which detail table each field belongs to.
type TargetTable =
  | "orders"
  | "order_items"
  | "order_billing"
  | "order_accounts"
  | "order_drawing"
  | "order_purchase"
  | "order_qc"
  | "order_planning"
  | "order_assembly_dispatch"
  | "order_lots";

type ValueType = "text" | "date" | "int" | "numeric";

export type Mapping = { header: string; table: TargetTable; column: string; type: ValueType };

// Maps every tracker column (assets/excelData.xlsx) to its table + column.
// Sl. No. (auto identity) is intentionally omitted.
const MAPPINGS: Mapping[] = [
  { header: "SO NO.", table: "orders", column: "so_no", type: "text" },
  { header: "Sales Order Date", table: "orders", column: "so_date", type: "date" },
  { header: "EC No.", table: "order_items", column: "ec_no", type: "text" },
  { header: "EC Generated Date", table: "orders", column: "ec_generated_date", type: "date" },
  { header: "EC RCVD In OPERATIONS", table: "orders", column: "ec_rcvd_operations_date", type: "date" },
  { header: "EC sent date in Production", table: "orders", column: "ec_sent_production_date", type: "date" },
  { header: "FILE NO.", table: "orders", column: "file_no", type: "text" },
  { header: "CLIENT CODE", table: "orders", column: "client_code", type: "text" },
  { header: "Client Type", table: "orders", column: "client_type", type: "text" },
  { header: "Party", table: "orders", column: "party", type: "text" },
  { header: "Naure of Supply", table: "orders", column: "nature_of_supply", type: "text" },
  { header: "Nature of Supply", table: "orders", column: "nature_of_supply", type: "text" },
  { header: "INDUSTRY TYPE", table: "orders", column: "industry_type", type: "text" },
  { header: "AGENT", table: "orders", column: "agent", type: "text" },
  { header: "Representative", table: "orders", column: "agent", type: "text" },
  { header: "QC Needed", table: "orders", column: "qc_required", type: "text" },
  { header: "Item", table: "order_items", column: "item_type", type: "text" },
  { header: "PO NO.", table: "orders", column: "po_no", type: "text" },
  { header: "Customer PO Date", table: "orders", column: "customer_po_date", type: "date" },
  { header: "Model No.", table: "order_items", column: "model_no", type: "text" },
  { header: "IF PUMP (QTY)", table: "order_items", column: "quantity", type: "int" },
  { header: "PUMP S.NO.", table: "order_items", column: "pump_sno", type: "text" },
  { header: "ORIENTATION", table: "order_items", column: "orientation", type: "text" },
  { header: "LIQUID/ APPLICATION", table: "order_items", column: "application", type: "text" },
  { header: "VERSION", table: "order_items", column: "version", type: "text" },
  { header: "Payment Terms", table: "orders", column: "payment_terms", type: "text" },
  { header: "Freight Terms", table: "order_billing", column: "freight_terms", type: "text" },
  { header: "Packing Requirement", table: "order_billing", column: "packing_requirement", type: "text" },
  { header: "PI No.", table: "order_billing", column: "pi_no", type: "text" },
  { header: "PI Date", table: "order_billing", column: "pi_date", type: "date" },
  { header: "PI Value", table: "order_billing", column: "pi_value", type: "numeric" },
  { header: "Payment Status", table: "order_accounts", column: "payment_status", type: "text" },
  { header: "DRG. Status", table: "order_drawing", column: "drg_status", type: "text" },
  { header: "DRG SENT TO CLIENT Dt.", table: "order_drawing", column: "drg_sent_to_client_date", type: "date" },
  { header: "DRG. Approval Date", table: "order_drawing", column: "drg_approval_date", type: "date" },
  { header: "Target Dt. For Drg", table: "order_items", column: "drg_target_date", type: "date" },
  { header: "BOI", table: "order_purchase", column: "boi", type: "text" },
  { header: "Gear BOX", table: "order_purchase", column: "gear_box", type: "text" },
  { header: "GB STATUS", table: "order_purchase", column: "gb_status", type: "text" },
  { header: "Motor", table: "order_purchase", column: "motor", type: "text" },
  { header: "MOTOR STATUS", table: "order_purchase", column: "motor_status", type: "text" },
  { header: "PENDING PARTS / BOI Others", table: "order_purchase", column: "pending_parts", type: "text" },
  { header: "BOI DATE RECEIPT DATE", table: "order_purchase", column: "boi_receipt_date", type: "date" },
  { header: "Target Dt. For Purchase", table: "order_planning", column: "purchase_target_date", type: "date" },
  { header: "Required QC Documents", table: "order_qc", column: "required_qc_documents", type: "text" },
  { header: "Target Dt. For Doc. Submission", table: "order_items", column: "qc_doc_target_date", type: "date" },
  { header: "Actual Dt. Of Doc. Submission", table: "order_qc", column: "qc_doc_actual_date", type: "date" },
  { header: "LD (Yes)", table: "orders", column: "ld", type: "text" },
  { header: "LD Date", table: "orders", column: "ld_date", type: "date" },
  { header: "DISP. TARGET DT.", table: "order_items", column: "dispatch_target_date", type: "date" },
  { header: "Revise Disp. Target Dt", table: "order_items", column: "dispatch_target_revised_date", type: "date" },
  { header: "Docuemnts Required from Planning", table: "order_planning", column: "planning_documents_required", type: "text" },
  { header: "Documents Required from Planning", table: "order_planning", column: "planning_documents_required", type: "text" },
  { header: "Pump Readiness Remarks", table: "order_planning", column: "pump_readiness_remarks", type: "text" },
  { header: "Actual PUMP STATUS", table: "order_planning", column: "actual_pump_status", type: "text" },
  { header: "ASSEMBLED/ PACKED QTY", table: "order_planning", column: "assembled_packed_qty", type: "text" },
  { header: "Assembly date", table: "order_planning", column: "assembly_date", type: "date" },
  { header: "Readiness Dt. Rcvd from Planning", table: "order_planning", column: "planning_readiness_date", type: "date" },
  { header: "Final Dt. for Packing & Dispatch", table: "order_assembly_dispatch", column: "final_packing_dispatch_date", type: "date" },
  { header: "Documents Required by Assembly/Dispatch Team", table: "order_assembly_dispatch", column: "dispatch_documents_required", type: "text" },
  { header: "Target Date for Dispatch Team", table: "order_assembly_dispatch", column: "dispatch_team_target_date", type: "date" },
  { header: "ACTUAL Material Packing Date", table: "order_assembly_dispatch", column: "actual_packing_date", type: "date" },
  { header: "PLANNING STATUS", table: "order_planning", column: "planning_status", type: "text" },
  { header: "Project", table: "orders", column: "project", type: "text" },
  { header: "Lot wise Packing slip remark", table: "order_lots", column: "packing_slip_remark", type: "text" },
  { header: "Remarks/Status/Reason of Delay", table: "order_assembly_dispatch", column: "delay_remarks", type: "text" },
  { header: "Master Reason of Delay", table: "orders", column: "master_reason_of_delay", type: "text" },
  { header: "DISPATCH STATUS", table: "order_assembly_dispatch", column: "dispatch_status", type: "text" },
  { header: "LOT NO.", table: "order_lots", column: "lot_no", type: "text" },
  { header: "Lot Wise  Disp. Dt.", table: "order_lots", column: "lot_dispatch_date", type: "date" },
  { header: "Lot Wise Disp. Dt.", table: "order_lots", column: "lot_dispatch_date", type: "date" },
  { header: "Invoice Date", table: "order_lots", column: "invoice_date", type: "date" },
  { header: "Order Value", table: "orders", column: "order_value", type: "numeric" },
  { header: "Currency", table: "orders", column: "order_currency", type: "text" },
];

function normalize(header: unknown): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const MAP_BY_HEADER = new Map<string, Mapping>();
for (const m of MAPPINGS) MAP_BY_HEADER.set(normalize(m.header), m);

/** The table/column/type a canonical export/import header maps to, if any. */
export function mappingForHeader(header: string): Mapping | undefined {
  return MAP_BY_HEADER.get(normalize(header));
}

