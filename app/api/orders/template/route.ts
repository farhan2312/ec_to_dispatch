import type { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { canCreateOrders } from "@/lib/roles";
import {
  BULK_HEADERS,
  SYSTEM_GENERATED_HEADERS,
} from "@/lib/import-templates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canCreateOrders(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type") === "bulk" ? "bulk" : "system";
  const headers = type === "bulk" ? BULK_HEADERS : SYSTEM_GENERATED_HEADERS;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Orders");
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();

  const filename =
    type === "bulk"
      ? "orders-import-template-full.xlsx"
      : "orders-import-template-system.xlsx";

  return new Response(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
