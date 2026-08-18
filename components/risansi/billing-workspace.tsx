"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ClipboardList, Loader2, Plus } from "lucide-react";
import type { BillingQueueRow } from "@/lib/orders";
import {
  BILLING_DOC_FIELDS,
  FR_REASON_OPTIONS,
  selectOptionsFor,
  type OrderField,
} from "@/lib/order-schema";
import { updateOrderSectionAction } from "@/app/risansi/orders/actions";
import { OrderChildList } from "./order-children";
import { OrderDetailsModal } from "./order-details-modal";
import { Pagination, SearchInput, useTableSearch } from "./table-tools";

type Row = Record<string, unknown>;

function rowSearchText(o: BillingQueueRow): string {
  return [o.sl_no, o.so_no, o.party].filter(Boolean).join(" ");
}

const numberFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
function formatValue(v: string | null): string {
  if (!v || v.trim() === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? numberFmt.format(n) : v;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

// Challan fields on order_billing (flat, single per SO).
const CHALLAN_FIELDS: OrderField[] = [
  { column: "challan_no", label: "Challan No.", type: "text" },
  { column: "challan_date", label: "Challan Date", type: "date" },
  { column: "challan_value", label: "Challan Value", type: "number" },
  {
    column: "fr_reason",
    label: "FR Reason",
    type: "select",
    options: FR_REASON_OPTIONS,
  },
];

/** Inline editor for the flat challan fields of one Challan SO. */
function ChallanInlineForm({
  row,
  canEdit,
}: {
  row: BillingQueueRow;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(CHALLAN_FIELDS.map((f) => [
      f.column,
      str(row[f.column as keyof BillingQueueRow]),
    ]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await updateOrderSectionAction(row.id, "order_billing", values);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  const inputClass =
    "h-9 w-full min-w-[140px] rounded-lg border border-input-border bg-surface px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-70";

  return (
    <form onSubmit={save} className="px-4 py-3">
      {error && (
        <div className="mb-3 rounded-[10px] border border-danger-border bg-danger-bg px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        {CHALLAN_FIELDS.map((f) => (
          <div key={f.column}>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </label>
            {f.type === "select" ? (
              <select
                value={values[f.column] ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.column]: e.target.value }))
                }
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">—</option>
                {selectOptionsFor(f, values[f.column] ?? "").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
                step={f.type === "number" ? "any" : undefined}
                value={values[f.column] ?? ""}
                disabled={!canEdit}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.column]: e.target.value }))
                }
                className={inputClass}
              />
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save challan"}
          </button>
          {savedAt && !saving && (
            <span className="text-xs text-muted">Saved.</span>
          )}
        </div>
      )}
    </form>
  );
}

export function BillingWorkspace({
  rows,
  canEdit,
  openOrderId,
}: {
  rows: BillingQueueRow[];
  canEdit: boolean;
  openOrderId?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [orderDetailsFor, setOrderDetailsFor] = useState<string | null>(null);
  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(rows, rowSearchText);

  useEffect(() => {
    if (!openOrderId) return;
    if (rows.some((r) => r.id === openOrderId)) {
      setExpanded((prev) => new Set(prev).add(openOrderId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrderId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">No orders yet</p>
        <p className="mt-1 text-sm text-muted">
          Orders created by Central Visibility will appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search SO, client…" />
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">Client Name</th>
                <th className="px-4 py-3">Bill Type</th>
                <th className="px-4 py-3">Payment Terms</th>
                <th className="px-4 py-3 text-right">Order Value</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                    No orders match your search.
                  </td>
                </tr>
              )}
              {pageRows.map((row) => {
                const isChallan = row.bill_type === "Challan";
                const isOpen = expanded.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr className="text-foreground transition-colors hover:bg-background/60">
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          aria-expanded={isOpen}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-input-border text-muted-foreground transition-transform hover:bg-background"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">{row.sl_no}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.so_no ?? "—"}</td>
                      <td className="px-4 py-3">{row.party ?? "—"}</td>
                      <td className="px-4 py-3">{row.bill_type ?? "—"}</td>
                      <td className="px-4 py-3">{row.payment_terms ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatValue(row.order_value)}
                        {row.order_currency ? ` ${row.order_currency}` : ""}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setOrderDetailsFor(row.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Order details
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-background/40">
                        <td colSpan={8} className="p-0">
                          {isChallan ? (
                            <ChallanInlineForm row={row} canEdit={canEdit} />
                          ) : (
                            <div className="px-4 py-3">
                              <OrderChildList
                                orderId={row.id}
                                table="order_billing_docs"
                                title="PIs"
                                fields={BILLING_DOC_FIELDS}
                                rows={(row.pi_docs ?? []) as Row[]}
                                canEdit={canEdit}
                              />
                            </div>
                          )}
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

      {orderDetailsFor && (
        <OrderDetailsModal
          orderId={orderDetailsFor}
          onClose={() => setOrderDetailsFor(null)}
        />
      )}
    </div>
  );
}
