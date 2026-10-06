import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { canEditSection } from "@/lib/roles";
import { listItemsForSectionPage, parseQueueSort } from "@/lib/orders";
import { parseQuery } from "@/lib/pagination";
import { describeOrderListFilter, parseDeptFilter } from "@/lib/order-list-filter";
import { PLANNING_CONTEXT_FIELDS } from "@/lib/order-schema";
import { buildPlanningReportPdf } from "@/lib/planning-report-pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TABLE = "order_planning" as const;

/**
 * Planning's queue as one PDF — every SO the queue's filter, search and sort
 * select, not just the page on screen. Opens in the browser, or saves with
 * ?download=1.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not authorized", { status: 401 });
  if (!canEditSection(user.role, TABLE)) return new NextResponse("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key) ?? undefined;
  const filter = parseDeptFilter(get, "planning");
  const search = parseQuery(get("q"));

  const queue = await listItemsForSectionPage(
    TABLE,
    PLANNING_CONTEXT_FIELDS.map((f) => ({
      column: f.column,
      type: f.type,
      from: f.from ?? ("orders" as const),
    })),
    { page: 1, search, filter, sort: parseQueueSort(get("sort")), all: true }
  );

  const filterLine = [describeOrderListFilter(filter), search && `Search: ${search}`]
    .filter(Boolean)
    .join("  ·  ");
  const bytes = await buildPlanningReportPdf(queue.rows, filterLine);

  const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const download = get("download") === "1";
  return new NextResponse(bytes as unknown as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="planning-report-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
