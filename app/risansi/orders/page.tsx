import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { listOrders, type OrderListRow } from "@/lib/orders";
import { ImportOrdersButton } from "@/components/risansi/import-orders-button";

export const metadata: Metadata = {
  title: "Orders | Risansi",
};

export const dynamic = "force-dynamic";

const numberFmt = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 2,
});

function formatValue(value: string | null): string {
  if (value === null || value.trim() === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? numberFmt.format(n) : value;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cell(value: string | null): string {
  return value && value.trim() !== "" ? value : "—";
}

function StatusChip({ value }: { value: string | null }) {
  if (!value || value.trim() === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {value}
    </span>
  );
}

export default async function OrdersPage() {
  const orders = await listOrders();

  return (
    <div className="px-8 py-8">
      {/* header */}
      <div className="mb-6 flex items-center justify-between gap-3">
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
        <div className="overflow-x-auto rounded-xl border border-card-border bg-surface shadow-sm">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Sl. No.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">EC No.</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Model No.</th>
                <th className="px-4 py-3">PI No.</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3">Dispatch Target</th>
                <th className="px-4 py-3">Dispatch Status</th>
                <th className="px-4 py-3 text-right">Order Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {orders.map((order: OrderListRow) => (
                <tr
                  key={order.id}
                  className="text-foreground transition-colors hover:bg-background/60"
                >
                  <td className="px-4 py-3 font-medium tabular-nums">
                    {order.sl_no}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{cell(order.so_no)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{cell(order.ec_no)}</td>
                  <td className="px-4 py-3">{cell(order.party)}</td>
                  <td className="px-4 py-3">{cell(order.item)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{cell(order.model_no)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{cell(order.pi_no)}</td>
                  <td className="px-4 py-3">
                    <StatusChip value={order.payment_status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted">
                    {formatDate(order.dispatch_target_date)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip value={order.dispatch_status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatValue(order.order_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
