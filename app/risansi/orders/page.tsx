import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Download, Plus, Upload } from "lucide-react";
import { listOrdersPage } from "@/lib/orders";
import { parseList, parsePage, parseQuery } from "@/lib/pagination";
import { parseDeptFilter } from "@/lib/dept-status";
import { getCurrentUser } from "@/lib/session";
import { canCreateOrders, isCentral } from "@/lib/roles";
import { OrdersTable } from "@/components/risansi/orders-table";

export const metadata: Metadata = {
  title: "Orders | Risansi",
};

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    zone?: string;
    dept?: string;
    dstatus?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The whole-order list/summary is Central Visibility & Admin only;
  // department roles use their own workspace instead.
  if (!isCentral(user.role)) redirect("/risansi/dashboard");

  const { page, q, zone, dept, dstatus } = await searchParams;
  const search = parseQuery(q);
  const zones = parseList(zone);
  const deptFilter = parseDeptFilter(dept, dstatus);
  const result = await listOrdersPage({
    page: parsePage(page),
    search,
    zones,
    ...deptFilter,
  });
  const canCreate = canCreateOrders(user.role);

  // The export mirrors whatever the list is showing: with any filter on it
  // downloads just those SOs, otherwise the whole tracker.
  const exportParams = new URLSearchParams();
  if (search) exportParams.set("q", search);
  if (zones.length > 0) exportParams.set("zone", zones.join(","));
  if (deptFilter.dept && deptFilter.deptStatus) {
    exportParams.set("dept", deptFilter.dept);
    exportParams.set("dstatus", deptFilter.deptStatus);
  }
  const isFiltered = exportParams.size > 0;
  const exportHref = isFiltered
    ? `/api/orders/export?${exportParams}`
    : "/api/orders/export";

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Orders
            </h1>
            <p className="text-sm text-muted">
              Master Order-to-Dispatch tracker — {result.total}{" "}
              {result.total === 1 ? "order" : "orders"}.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-input-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
          >
            <Download className="h-4 w-4" />
            {isFiltered ? `Export ${result.total} filtered` : "Export all"}
          </a>
          {canCreate && (
            <>
              <Link
                href="/risansi/orders/import"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-input-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
              >
                <Upload className="h-4 w-4" />
                Import orders
              </Link>
              <Link
                href="/risansi/orders/new"
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-4 w-4" />
                New order
              </Link>
            </>
          )}
        </div>
      </div>

      <OrdersTable result={result} canDelete={canCreate} />
    </div>
  );
}
