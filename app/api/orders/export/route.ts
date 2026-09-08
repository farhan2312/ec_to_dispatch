import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isCentral } from "@/lib/roles";
import { listOrderExports, listOrderIdsMatching } from "@/lib/orders";
import { buildOrdersWorkbook } from "@/lib/order-export";
import { parseList, parseQuery } from "@/lib/pagination";
import { DEPT_FILTER_LABELS, parseDeptFilter } from "@/lib/dept-status";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isCentral(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  // Same q/zone the orders list uses. With neither, this exports everything;
  // with either, it exports exactly the SOs behind the caller's filtered view
  // — resolved here rather than posted as ids, since the table only holds the
  // page on screen.
  const params = req.nextUrl.searchParams;
  const search = parseQuery(params.get("q") ?? undefined);
  const zones = parseList(params.get("zone") ?? undefined);
  const deptFilter = parseDeptFilter(
    params.get("dept") ?? undefined,
    params.get("dstatus") ?? undefined
  );
  const filtered =
    search !== "" || zones.length > 0 || deptFilter.dept !== null;
  const ids = filtered
    ? await listOrderIdsMatching({ search, zones, ...deptFilter })
    : undefined;

  const orders = await listOrderExports(ids);
  const scope = filtered
    ? [
        search ? `Search: ${search}` : null,
        zones.length > 0 ? `Zone: ${zones.join(", ")}` : null,
        deptFilter.dept
          ? `${DEPT_FILTER_LABELS[deptFilter.dept]}: ${deptFilter.deptStatus}`
          : null,
      ]
        .filter(Boolean)
        .join("  ·  ")
    : "All orders";
  const buffer = await buildOrdersWorkbook(orders, scope).xlsx.writeBuffer();

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
