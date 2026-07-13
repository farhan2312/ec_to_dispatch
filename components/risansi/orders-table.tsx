"use client";

import { useRouter } from "next/navigation";
import type { OrderListRow } from "@/lib/orders";
import { Pagination, SearchInput, useTableSearch } from "./table-tools";

function searchText(o: OrderListRow): string {
  return [o.sl_no, o.so_no, o.ec_no, o.party, o.item, o.model_no, o.pi_no]
    .filter(Boolean)
    .join(" ");
}

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

export function OrdersTable({ orders }: { orders: OrderListRow[] }) {
  const router = useRouter();
  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(orders, searchText);

  return (
    <div>
      <div className="mb-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search SO, EC, party, item…"
        />
      </div>

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
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted">
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
