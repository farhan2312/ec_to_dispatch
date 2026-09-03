import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Plus, Upload } from "lucide-react";
import { listOrdersPage } from "@/lib/orders";
import { parseList, parsePage, parseQuery } from "@/lib/pagination";
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
  searchParams: Promise<{ page?: string; q?: string; zone?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The whole-order list/summary is Central Visibility & Admin only;
  // department roles use their own workspace instead.
  if (!isCentral(user.role)) redirect("/risansi/dashboard");

  const { page, q, zone } = await searchParams;
  const result = await listOrdersPage({
    page: parsePage(page),
    search: parseQuery(q),
    zones: parseList(zone),
  });
  const canCreate = canCreateOrders(user.role);

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

        {canCreate && (
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        )}
      </div>

      <OrdersTable result={result} canDelete={canCreate} />
    </div>
  );
}
