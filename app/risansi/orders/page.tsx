import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList, Plus } from "lucide-react";
import { listOrders } from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";
import { canCreateOrders, isCentral } from "@/lib/roles";
import { OrdersTable } from "@/components/risansi/orders-table";
import { ImportOrdersButton } from "@/components/risansi/import-orders-button";

export const metadata: Metadata = {
  title: "Orders | Risansi",
};

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The whole-order list/summary is Central Visibility & Admin only;
  // department roles use their own workspace instead.
  if (!isCentral(user.role)) redirect("/risansi/dashboard");

  const orders = await listOrders();
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
              Master Order-to-Dispatch tracker — {orders.length}{" "}
              {orders.length === 1 ? "order" : "orders"}.
            </p>
          </div>
        </div>

        {canCreate && (
          <div className="flex shrink-0 items-center gap-2">
            <ImportOrdersButton />
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

      {orders.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No orders yet</p>
          <p className="mt-1 text-sm text-muted">
            Orders will appear here once added via the create form or Excel
            import.
          </p>
        </div>
      ) : (
        <OrdersTable orders={orders} canDelete={canCreate} />
      )}
    </div>
  );
}
