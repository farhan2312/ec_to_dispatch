import ExcelJS from "exceljs";

// Which detail table each field belongs to.
type TargetTable =
  | "orders"
  | "order_billing"
  | "order_accounts"
  | "order_drawing"
  | "order_purchase"
  | "order_qc"
  | "order_planning"
  | "order_assembly_dispatch"
  | "order_pumps"
  | "order_lots";

type ValueType = "text" | "date" | "int" | "numeric";

type Mapping = { header: string; table: TargetTable; column: string; type: ValueType };

// Maps every tracker column (assets/excelData.xlsx) to its table + column.
// Sl. No. (auto identity) is intentionally omitted.
const MAPPINGS: Mapping[] = [
  { header: "SO NO.", table: "orders", column: "so_no", type: "text" },
  { header: "EC No.", table: "orders", column: "ec_no", type: "text" },
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
  { header: "Item", table: "orders", column: "item", type: "text" },
  { header: "PO NO.", table: "orders", column: "po_no", type: "text" },
  { header: "Customer PO Date", table: "orders", column: "customer_po_date", type: "date" },
  { header: "Model No.", table: "orders", column: "model_no", type: "text" },
  { header: "IF PUMP (QTY)", table: "orders", column: "pump_qty", type: "int" },
  { header: "PUMP S.NO.", table: "order_pumps", column: "pump_sno", type: "text" },
  { header: "ORIENTATION", table: "orders", column: "orientation", type: "text" },
  { header: "LIQUID/ APPLICATION", table: "orders", column: "liquid_application", type: "text" },
  { header: "VERSION", table: "orders", column: "version", type: "text" },
  { header: "Payment Terms", table: "order_billing", column: "payment_terms", type: "text" },
  { header: "Freight Terms", table: "order_billing", column: "freight_terms", type: "text" },
  { header: "Packing Requirement", table: "order_billing", column: "packing_requirement", type: "text" },
  { header: "PI No.", table: "order_billing", column: "pi_no", type: "text" },
  { header: "PI Date", table: "order_billing", column: "pi_date", type: "date" },
  { header: "PI Value", table: "order_billing", column: "pi_value", type: "numeric" },
  { header: "Payment Status", table: "order_accounts", column: "payment_status", type: "text" },
  { header: "DRG. Status", table: "order_drawing", column: "drg_status", type: "text" },
  { header: "DRG SENT TO CLIENT Dt.", table: "order_drawing", column: "drg_sent_to_client_date", type: "date" },
  { header: "DRG. Approval Date", table: "order_drawing", column: "drg_approval_date", type: "date" },
  { header: "Target Dt. For Drg", table: "order_drawing", column: "drg_target_date", type: "date" },
  { header: "BOI", table: "order_purchase", column: "boi", type: "text" },
  { header: "Gear BOX", table: "order_purchase", column: "gear_box", type: "text" },
  { header: "GB STATUS", table: "order_purchase", column: "gb_status", type: "text" },
  { header: "Motor", table: "order_purchase", column: "motor", type: "text" },
  { header: "MOTOR STATUS", table: "order_purchase", column: "motor_status", type: "text" },
  { header: "PENDING PARTS / BOI Others", table: "order_purchase", column: "pending_parts", type: "text" },
  { header: "BOI DATE RECEIPT DATE", table: "order_purchase", column: "boi_receipt_date", type: "date" },
  { header: "Target Dt. For Purchase", table: "order_purchase", column: "purchase_target_date", type: "date" },
  { header: "Required QC Documents", table: "order_qc", column: "required_qc_documents", type: "text" },
  { header: "Target Dt. For Doc. Submission", table: "order_qc", column: "qc_doc_target_date", type: "date" },
  { header: "Actual Dt. Of Doc. Submission", table: "order_qc", column: "qc_doc_actual_date", type: "date" },
  { header: "LD (Yes)", table: "order_qc", column: "ld_applicable", type: "text" },
  { header: "LD Date", table: "order_planning", column: "ld_date", type: "date" },
  { header: "DISP. TARGET DT.", table: "order_planning", column: "dispatch_target_date", type: "date" },
  { header: "Revise Disp. Target Dt", table: "order_planning", column: "dispatch_target_revised_date", type: "date" },
  { header: "Docuemnts Required from Planning", table: "order_planning", column: "planning_documents_required", type: "text" },
  { header: "Documents Required from Planning", table: "order_planning", column: "planning_documents_required", type: "text" },
  { header: "Pump Readiness Remarks", table: "order_planning", column: "pump_readiness_remarks", type: "text" },
  { header: "Actual PUMP STATUS", table: "order_assembly_dispatch", column: "actual_pump_status", type: "text" },
  { header: "ASSEMBLED/ PACKED QTY", table: "order_assembly_dispatch", column: "assembled_packed_qty", type: "text" },
  { header: "Assembly date", table: "order_assembly_dispatch", column: "assembly_date", type: "date" },
  { header: "Readiness Dt. Rcvd from Planning", table: "order_planning", column: "planning_readiness_date", type: "date" },
  { header: "Final Dt. for Packing & Dispatch", table: "order_planning", column: "final_packing_dispatch_date", type: "date" },
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
];

function normalize(header: unknown): string {
  return String(header ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const MAP_BY_HEADER = new Map<string, Mapping>();
for (const m of MAPPINGS) MAP_BY_HEADER.set(normalize(m.header), m);

function coerceDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function coerceNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function coerceInt(value: unknown): number | null {
  const n = coerceNumber(value);
  return n == null ? null : Math.trunc(n);
}

function cellText(value: unknown): string | null {
  if (value == null) return null;
  // exceljs rich text / hyperlink / formula objects
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if ("text" in obj) return String(obj.text).trim() || null;
    if ("result" in obj) return String(obj.result).trim() || null;
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (
        obj.richText.map((r) => (r as { text?: string }).text ?? "").join("").trim() ||
        null
      );
    }
  }
  const s = String(value).trim();
  return s === "" ? null : s;
}

export type ParsedOrder = Partial<Record<TargetTable, Record<string, unknown>>>;

export type ParseResult = {
  rows: ParsedOrder[];
  matchedColumns: number;
  totalDataRows: number;
  skipped: number;
};

/**
 * Parse an uploaded workbook buffer into structured rows keyed by target table.
 * Auto-detects the header row (scans the first 10 rows for the best match).
 */
export async function parseOrdersWorkbook(
  buffer: ArrayBuffer
): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return { rows: [], matchedColumns: 0, totalDataRows: 0, skipped: 0 };

  // Find the header row: the row (within the first 10) with the most matches.
  let headerRowNum = 1;
  let bestMatches = 0;
  const scanTo = Math.min(sheet.rowCount, 10);
  for (let r = 1; r <= scanTo; r++) {
    const row = sheet.getRow(r);
    let matches = 0;
    row.eachCell((cell) => {
      if (MAP_BY_HEADER.has(normalize(cellText(cell.value)))) matches++;
    });
    if (matches > bestMatches) {
      bestMatches = matches;
      headerRowNum = r;
    }
  }

  // Column index -> mapping.
  const colMap = new Map<number, Mapping>();
  const headerRow = sheet.getRow(headerRowNum);
  headerRow.eachCell((cell, colNumber) => {
    const mapping = MAP_BY_HEADER.get(normalize(cellText(cell.value)));
    if (mapping) colMap.set(colNumber, mapping);
  });

  const rows: ParsedOrder[] = [];
  let skipped = 0;

  for (let r = headerRowNum + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const parsed: ParsedOrder = {};
    let hasValue = false;

    for (const [colNumber, mapping] of colMap) {
      const raw = row.getCell(colNumber).value;
      let value: unknown = null;
      if (mapping.type === "date") value = coerceDate(raw);
      else if (mapping.type === "numeric") value = coerceNumber(raw);
      else if (mapping.type === "int") value = coerceInt(raw);
      else value = cellText(raw);

      if (value == null) continue;
      hasValue = true;
      const bucket = (parsed[mapping.table] ??= {});
      bucket[mapping.column] = value;
    }

    if (!hasValue) {
      skipped++;
      continue;
    }
    rows.push(parsed);
  }

  return {
    rows,
    matchedColumns: colMap.size,
    totalDataRows: rows.length + skipped,
    skipped,
  };
}
