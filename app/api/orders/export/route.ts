import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { isCentral } from "@/lib/roles";
import { listItemDetails, type ItemDetail } from "@/lib/orders";
import { mappingForHeader } from "@/lib/excel-import";
import { BULK_HEADERS } from "@/lib/import-templates";

export const runtime = "nodejs";

// One row per EC item. "Sl. No." (the parent SO) is prepended for reference.
const HEADERS = ["Sl. No.", ...BULK_HEADERS];

function cellValue(detail: ItemDetail, header: string): string | number | Date | null {
  if (header === "Sl. No.") return Number(detail.order.sl_no ?? null) || null;

  const mapping = mappingForHeader(header);
  if (!mapping) return null;

  // order_lots is 1:many; a single export row carries only the first lot.
  // "orders" is the parent SO, "order_items" is the EC row itself.
  const source: Record<string, unknown> | null =
    mapping.table === "order_lots"
      ? detail.order_lots[0] ?? null
      : mapping.table === "orders"
        ? detail.order
        : mapping.table === "order_items"
          ? detail.item
          : (detail[mapping.table] as Record<string, unknown> | null);
  const raw = source?.[mapping.column];
  if (raw == null || raw === "") return null;

  if (mapping.type === "date") {
    const d = new Date(String(raw));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (mapping.type === "numeric" || mapping.type === "int") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return String(raw);
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isCentral(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  // No `ids` param exports every order; otherwise only the given ids (the
  // caller's current filtered view).
  const idsParam = req.nextUrl.searchParams.get("ids");
  const filtered = idsParam !== null;
  const ids = filtered ? idsParam.split(",").filter(Boolean) : undefined;
  const orders = await listItemDetails(ids);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orders");
  ws.addRow(HEADERS);
  ws.getRow(1).font = { bold: true };

  const dateColumns: number[] = [];
  HEADERS.forEach((h, i) => {
    if (h === "Sl. No.") return;
    if (mappingForHeader(h)?.type === "date") dateColumns.push(i + 1);
  });

  for (const detail of orders) {
    ws.addRow(HEADERS.map((h) => cellValue(detail, h)));
  }
  for (const colIndex of dateColumns) {
    ws.getColumn(colIndex).numFmt = "yyyy-mm-dd";
  }
  ws.columns.forEach((col) => {
    col.width = 16;
  });

  const buffer = await wb.xlsx.writeBuffer();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `orders-export${filtered ? "-filtered" : ""}-${today}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
