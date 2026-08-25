"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import type { ItemSummary, OrderListRow } from "@/lib/orders";
import { deleteOrderAction } from "@/app/risansi/orders/actions";
import {
  FilterBar,
  Pagination,
  useTableFilters,
  type FilterDef,
} from "./table-tools";
import { AddOnForm } from "./add-on-form";

function searchText(o: OrderListRow): string {
  const items = (o.items ?? [])
    .map((it) => [it.ec_no, it.item_type, it.model_no].filter(Boolean).join(" "))
    .join(" ");
  return [o.sl_no, o.so_no, o.client_name, o.client_code, o.po_no, items]
    .filter(Boolean)
    .join(" ");
}

const ORDER_FILTERS: FilterDef<OrderListRow>[] = [];

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

/**
 * The EC sub-table under an expanded SO. Columns follow the SO's order type:
 * a Spare carries no Pump Type / Series Version (matching the Spare Add-On
 * form), a Pump shows both. Dispatch status is deliberately not here — it's
 * an SO-level value shown once on the parent row.
 */
function ItemRows({
  orderId,
  items,
  orderType,
}: {
  orderId: string;
  items: ItemSummary[];
  orderType: string | null;
}) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted">No EC items yet.</p>
    );
  }
  const isSpareSo = (orderType ?? "").trim().toLowerCase() === "spare";
  return (
    <div className="overflow-x-auto px-4 py-3">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-1.5">EC No.</th>
            <th className="px-3 py-1.5">EC Date</th>
            {!isSpareSo && <th className="px-3 py-1.5">Pump Type</th>}
            <th className="px-3 py-1.5">Model No.</th>
            <th className="px-3 py-1.5">Internal Model</th>
            <th className="px-3 py-1.5">Version</th>
            <th className="px-3 py-1.5">Qty</th>
            <th className="px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="text-foreground">
              <td className="px-3 py-1.5 whitespace-nowrap font-medium">{cell(it.ec_no)}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-muted">
                {formatDate(it.ec_date)}
              </td>
              {!isSpareSo && <td className="px-3 py-1.5">{cell(it.pump_type)}</td>}
              <td className="px-3 py-1.5">{cell(it.model_no)}</td>
              <td className="px-3 py-1.5">{cell(it.internal_model)}</td>
              <td className="px-3 py-1.5">{cell(it.version)}</td>
              <td className="px-3 py-1.5 tabular-nums">{cell(it.quantity)}</td>
              <td className="px-3 py-1.5 whitespace-nowrap text-right">
                <Link
                  href={`/risansi/orders/${orderId}/items/${it.id}`}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-input-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  Open
                  <ChevronRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addFor, setAddFor] = useState<OrderListRow | null>(null);
  const {
    query,
    setQuery,
    selected,
    setFilter,
    clearAll,
    options,
    activeCount,
    pageRows,
    filtered,
    page,
    setPage,
    totalPages,
    total,
    from,
    to,
  } = useTableFilters(orders, searchText, ORDER_FILTERS);

  // expand-toggle + 9 data columns + open + optional Add-On/delete.
  const baseCols = 11;
  const colSpan = baseCols + (canDelete ? 1 : 0);
  const isFiltered = activeCount > 0 || query.trim() !== "";

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    const url = isFiltered
      ? `/api/orders/export?ids=${filtered.map((o) => o.id).join(",")}`
      : "/api/orders/export";
    const a = document.createElement("a");
    a.href = url;
    a.click();
  }

  async function handleDelete(order: OrderListRow) {
    const label = order.so_no ?? `#${order.sl_no}`;
    if (!confirm(`Delete SO ${label}? This permanently removes it and all its EC/department data.`)) {
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
        query={query}
        setQuery={setQuery}
        activeCount={activeCount}
        clearAll={clearAll}
        total={total}
        searchPlaceholder="Search SO, client name, client code, EC…"
      />

      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-900 border border-blue-900 px-3 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {isFiltered ? `Export ${total} filtered` : "Export all"}
        </button>
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Sl. No.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">SO Date</th>
                <th className="px-4 py-3">Client Name</th>
                <th className="px-4 py-3">Client Code</th>
                <th className="px-4 py-3 text-right">Order Value</th>
                <th className="px-4 py-3">Payment Status</th>
                <th className="px-4 py-3">Dispatch Status</th>
                <th className="px-4 py-3 text-center normal-case">ECs</th>
                <th className="px-4 py-3" />
                {canDelete && <th className="px-4 py-3" />}
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
              {pageRows.map((order) => {
                const isOpen = expanded.has(order.id);
                const items = order.items ?? [];
                return (
                  <Fragment key={order.id}>
                    <tr className="text-foreground transition-colors hover:bg-background/60">
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(order.id)}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          aria-expanded={isOpen}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-input-border text-muted-foreground transition-colors hover:bg-background"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">{order.sl_no}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{cell(order.so_no)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatDate(order.so_date)}
                      </td>
                      <td className="px-4 py-3">{cell(order.client_name)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{cell(order.client_code)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatValue(order.order_value)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip value={order.payment_status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusChip value={order.dispatch_status} />
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">{order.ec_count}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/risansi/orders/${order.id}`}
                            className="inline-flex h-8 items-center rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                          >
                            Open
                          </Link>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setAddFor(order)}
                              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              {order.order_type === "Spare"
                                ? "Spare Add-On"
                                : "Pump Add-On"}
                            </button>
                          )}
                        </div>
                      </td>
                      {canDelete && (
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(order)}
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
                    {isOpen && (
                      <tr className="bg-background/40">
                        <td colSpan={colSpan} className="p-0">
                          <ItemRows
                            orderId={order.id}
                            items={items}
                            orderType={order.order_type}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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

      {addFor && (
        <AddOnForm
          orderId={addFor.id}
          soLabel={addFor.so_no ?? `#${addFor.sl_no}`}
          // Without this the modal always fell back to the Pump form, even
          // when the button said "Spare Add-On".
          orderType={addFor.order_type}
          onClose={() => setAddFor(null)}
        />
      )}
    </div>
  );
}
