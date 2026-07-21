"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { OrderListRow } from "@/lib/orders";
import { deleteOrderAction } from "@/app/risansi/orders/actions";
import { DISPATCH_STATUS_OPTIONS } from "@/lib/order-schema";
import {
  FilterBar,
  Pagination,
  useTableFilters,
  type FilterDef,
} from "./table-tools";

function searchText(o: OrderListRow): string {
  return [o.sl_no, o.so_no, o.ec_no, o.party, o.item, o.model_no, o.pi_no]
    .filter(Boolean)
    .join(" ");
}

const ORDER_TEXT_FILTERS: FilterDef<OrderListRow>[] = [
  { key: "agent", label: "Representative", getValue: (o) => o.agent },
  { key: "item", label: "Item", getValue: (o) => o.item },
];

const ORDER_FILTERS: FilterDef<OrderListRow>[] = [
  {
    key: "dispatch_status",
    label: "Dispatch Status",
    getValue: (o) => o.dispatch_status,
    staticOptions: DISPATCH_STATUS_OPTIONS.map((o) => o.value),
  },
];

const numberFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

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

export function OrdersTable({
  orders,
  canDelete = false,
}: {
  orders: OrderListRow[];
  canDelete?: boolean;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    query,
    setQuery,
    selected,
    setFilter,
    textValues,
    setTextFilter,
    clearAll,
    options,
    activeCount,
    pageRows,
    page,
    setPage,
    totalPages,
    total,
    from,
    to,
  } = useTableFilters(orders, searchText, ORDER_FILTERS, ORDER_TEXT_FILTERS);
  const colSpan = canDelete ? 12 : 11;

  async function handleDelete(order: OrderListRow) {
    const label = order.so_no ?? order.ec_no ?? `#${order.sl_no}`;
    if (!confirm(`Delete order ${label}? This permanently removes it and all its department data.`)) {
      return;
    }
    setDeletingId(order.id);
    const res = await deleteOrderAction(order.id);
    setDeletingId(null);
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  return (
    <div>
      <FilterBar
        filters={ORDER_FILTERS}
        options={options}
        selected={selected}
        setFilter={setFilter}
        textFilters={ORDER_TEXT_FILTERS}
        textValues={textValues}
        setTextFilter={setTextFilter}
        query={query}
        setQuery={setQuery}
        activeCount={activeCount}
        clearAll={clearAll}
        total={total}
        searchPlaceholder="Search SO, EC, party, item…"
      />

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
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
            {canDelete && <th className="px-4 py-3"></th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-muted">
                No orders match your search.
              </td>
            </tr>
          )}
          {pageRows.map((order) => (
            <tr
              key={order.id}
              onClick={() => router.push(`/risansi/orders/${order.id}`)}
              className="cursor-pointer text-foreground transition-colors hover:bg-background/60"
            >
              <td className="px-4 py-3 font-medium tabular-nums">{order.sl_no}</td>
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
              {canDelete && (
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(order);
                    }}
                    disabled={deletingId === order.id}
                    aria-label="Delete order"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                  >
                    {deletingId === order.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          from={from}
          to={to}
          total={total}
        />
      </div>
    </div>
  );
}
