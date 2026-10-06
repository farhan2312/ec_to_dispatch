"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare, Pencil, Plus, X } from "lucide-react";
import { OrderThreadModal } from "./order-thread-modal";
import { DATE_PRESETS, presetRange } from "@/lib/order-list-filter";
import {
  BILL_MODE_FILTER_OPTIONS,
  BILL_TYPE_FILTER_OPTIONS,
  OM_DATE_FIELDS,
  OM_FILTER_KEYS,
  isOrderMakingFiltered,
  type OrderMakingFilter,
} from "@/lib/order-making-filter";
import type { OrderListOptions } from "@/lib/orders";
import { SortHeader } from "./sort-header";
import { createOrderAction, updateOrderSectionAction } from "@/app/risansi/orders/actions";
import type { NewOrderInput } from "@/lib/orders";
import {
  ORDER_MAKING_EDITABLE,
  ORDER_MAKING_FIELDS,
  ORDER_MAKING_GROUPS,
  ORDER_TYPE_OPTIONS,
  dependsOnSatisfied,
  selectOptionsFor,
  withValueRules,
  type OrderField,
} from "@/lib/order-schema";
import type { OrderMakingRow } from "@/lib/orders";
import type { PageResult } from "@/lib/pagination";
import type { MarketIntellClient } from "@/lib/market-intell";
import { UrlPagination, UrlSearchInput, useUrlTable } from "./url-table";
import { MultiSelectFilter, SingleSelectFilter } from "./multi-select-filter";
import { ClientLookup } from "./client-lookup";
import { formatDisplay } from "./editable-section";

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const field = (column: string) => ORDER_MAKING_FIELDS.find((f) => f.column === column)!;

const inputClass =
  "h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Order Making's list: every SO newest first with its Client and Purchase
 * Order details, how many of those are still blank, and an Edit that opens
 * just those fields. Nothing else of the SO is shown.
 */
export function OrderMakingWorkspace({
  queue,
  filter,
  options,
  canEdit,
  role,
  unreadThreads,
}: {
  queue: PageResult<OrderMakingRow>;
  filter: OrderMakingFilter;
  /** Zones, reps and markets as the orders carry them. */
  options: OrderListOptions;
  canEdit: boolean;
  /** The viewer's role, for the SO discussion. */
  role: string;
  /** Unread discussion messages per SO, for the chat badge. */
  unreadThreads: Record<string, number>;
}) {
  const router = useRouter();
  const [threadFor, setThreadFor] = useState<{ orderId: string; soLabel: string } | null>(null);
  const missingOnly = filter.missingOnly;
  const activePreset =
    DATE_PRESETS.find((p) => {
      const [from, to] = presetRange(p);
      return from === filter.from && to === filter.to;
    }) ?? null;
  const { setParams } = useUrlTable();
  // A row being edited, or "new" for the New order form.
  const [editing, setEditing] = useState<OrderMakingRow | "new" | null>(null);
  const cols: { column: string; label: string }[] = [
    { column: "so_no", label: "SO No." },
    { column: "so_date", label: "SO Date" },
    { column: "client_code", label: "Client Code" },
    { column: "client_name", label: "Client Name" },
    { column: "order_type", label: "Order Type" },
    { column: "bill_mode", label: "Bill Mode" },
    { column: "bill_type", label: "Bill Type" },
    { column: "po_no", label: "PO No." },
    { column: "order_value", label: "Order Value" },
  ];

  return (
    <div>
      <div className="mb-4 space-y-2 rounded-xl border border-card-border bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchInput placeholder="Search SO, client, client code, PO…" />
        <MultiSelectFilter label="Zone" options={options.zones} selected={filter.zones} onChange={(next) => setParams({ zone: next })} />
        <MultiSelectFilter label="Rep" options={options.reps} selected={filter.reps} onChange={(next) => setParams({ rep: next })} />
        <MultiSelectFilter label="Market" options={options.markets} selected={filter.markets} onChange={(next) => setParams({ market: next })} />
        <MultiSelectFilter
          label="Type"
          options={ORDER_TYPE_OPTIONS.map((o) => o.value)}
          selected={filter.types}
          onChange={(next) => setParams({ type: next })}
        />
        <MultiSelectFilter
          label="Bill mode"
          allLabel="Any mode"
          options={BILL_MODE_FILTER_OPTIONS}
          selected={filter.billModes}
          onChange={(next) => setParams({ bmode: next })}
        />
        <MultiSelectFilter
          label="Bill type"
          allLabel="Any bill type"
          options={BILL_TYPE_FILTER_OPTIONS}
          selected={filter.billTypes}
          onChange={(next) => setParams({ btype: next })}
        />
        <button
          type="button"
          onClick={() => setParams({ missing: missingOnly ? null : "1" })}
          aria-pressed={missingOnly}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
            missingOnly
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
              : "border-input-border text-foreground hover:bg-background"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Details missing only
        </button>
      </div>

      {/* When: by SO date or PO date. */}
      <div className="flex flex-wrap items-center gap-2">
        <SingleSelectFilter
          label="Date"
          allLabel="SO date"
          options={OM_DATE_FIELDS.filter((d) => d.value !== "so_date").map((d) => ({ value: d.value, label: d.label }))}
          selected={filter.dateField === "so_date" ? null : filter.dateField}
          onChange={(next) => setParams({ datefield: next })}
        />
        {DATE_PRESETS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (activePreset === label) return setParams({ from: null, to: null });
              const [from, to] = presetRange(label);
              setParams({ from, to });
            }}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
              activePreset === label
                ? "border-primary/40 bg-primary/[0.06] text-foreground"
                : "border-input-border bg-surface text-muted hover:bg-background hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          From
          <input
            type="date"
            value={filter.from ?? ""}
            max={filter.to ?? undefined}
            onChange={(e) => setParams({ from: e.target.value || null })}
            className="h-8 rounded-lg border border-input-border bg-surface px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          To
          <input
            type="date"
            value={filter.to ?? ""}
            min={filter.from ?? undefined}
            onChange={(e) => setParams({ to: e.target.value || null })}
            className="h-8 rounded-lg border border-input-border bg-surface px-2 text-xs text-foreground focus:border-primary focus:outline-none"
          />
        </label>
        {isOrderMakingFiltered(filter) && (
          <button
            type="button"
            onClick={() => setParams(Object.fromEntries(OM_FILTER_KEYS.map((k) => [k, null])))}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
        <span className="ml-auto text-xs text-muted">
          <span className="font-semibold text-foreground">{queue.total}</span> SO{queue.total === 1 ? "" : "s"}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <Plus className="h-4 w-4" />
            New order
          </button>
        )}
      </div>
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">
                  <SortHeader label="Sl." sortKey="sl" />
                </th>
                {cols.map((c) => (
                  <Fragment key={c.column}>
                    <th className={`px-4 py-3 ${c.column === "order_value" ? "text-right" : ""}`}>
                      {c.column === "so_date" ? <SortHeader label={c.label} sortKey="so_date" /> : c.label}
                    </th>
                    {c.column === "so_no" && <th className="px-4 py-3">Chat</th>}
                  </Fragment>
                ))}
                <th className="px-4 py-3">Details</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {queue.rows.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 4} className="px-4 py-10 text-center text-sm text-muted">
                    {missingOnly ? "Every SO has its client and PO details filled." : "No SOs match."}
                  </td>
                </tr>
              )}
              {queue.rows.map((row) => (
                <tr key={row.id} className="text-foreground transition-colors hover:bg-background/60">
                  <td className="px-4 py-3 font-medium tabular-nums">{row.sl_no}</td>
                  {cols.map((c) => (
                    <Fragment key={c.column}>
                      <td
                        className={`px-4 py-3 ${
                          c.column === "order_value" ? "text-right tabular-nums" : c.column === "client_name" ? "" : "whitespace-nowrap"
                        }`}
                      >
                        {formatDisplay(field(c.column), row[c.column])}
                        {c.column === "order_value" && str(row.order_currency) ? ` ${str(row.order_currency)}` : ""}
                      </td>
                      {/* The SO's discussion with Central Visibility and the departments. */}
                      {c.column === "so_no" && (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setThreadFor({ orderId: row.id, soLabel: str(row.so_no) || String(row.sl_no) })}
                            aria-label="Chat"
                            title="Chat"
                            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input-border text-foreground transition-colors hover:bg-background"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            {(unreadThreads[row.id] ?? 0) > 0 && (
                              <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                                {unreadThreads[row.id]}
                              </span>
                            )}
                          </button>
                        </td>
                      )}
                    </Fragment>
                  ))}
                  <td className="px-4 py-3">
                    {row.missing.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Complete
                      </span>
                    ) : (
                      <span
                        title={row.missing.join(", ")}
                        className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700"
                      >
                        {row.missing.length} missing
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-card-border px-4 py-3">
          <UrlPagination
            page={queue.page}
            totalPages={queue.totalPages}
            from={queue.from}
            to={queue.to}
            total={queue.total}
          />
        </div>
      </div>

      {threadFor && (
        <OrderThreadModal
          orderId={threadFor.orderId}
          role={role}
          soLabel={threadFor.soLabel}
          onClose={() => {
            setThreadFor(null);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <OrderMakingEdit row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

/**
 * Order Making's form: a new SO (row null) or an existing one's Client and
 * Purchase Order details — the only ones Order Making owns. The client
 * directory fills the Client fields.
 */
function OrderMakingEdit({ row, onClose }: { row: OrderMakingRow | null; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ORDER_MAKING_EDITABLE.map((f) => [f.column, str(row?.[f.column]).slice(0, f.type === "date" ? 10 : undefined)])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  const read = (c: string) => values[c] ?? "";
  const set = (c: string, v: string) => setValues((prev) => withValueRules(prev, c, v));

  // Picking a client from the directory fills the Client group.
  function applyClient(client: MarketIntellClient) {
    setValues((prev) => ({
      ...prev,
      client_code: client.code,
      client_name: client.legal_name ?? "",
      market_type: client.market_type ?? "",
      client_type: client.client_type ?? "",
      industry_type: client.industry ?? "",
      zone: client.zone ?? "",
      reps: client.rep_name ?? "",
    }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!values.client_code?.trim()) {
      setError("Client Code is required.");
      return;
    }
    setSaving(true);
    setError(null);
    // Only fields that apply go: a PO typed before switching to FR is not saved.
    const applies = (k: string) => {
      const f = ORDER_MAKING_EDITABLE.find((x) => x.column === k);
      return !f || dependsOnSatisfied(f, read);
    };
    const sending = Object.fromEntries(Object.entries(values).filter(([k]) => applies(k)));
    // Blank fields are left out of a new order rather than sent as "".
    const res = row
      ? await updateOrderSectionAction(row.id, "orders", sending)
      : await createOrderAction(
          Object.fromEntries(Object.entries(sending).filter(([, v]) => v.trim() !== "")) as NewOrderInput
        );
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  // A Challan order is worth 0 INR: its value and currency are set, not typed.
  const challanLocked = (f: OrderField) =>
    read("bill_type") === "Challan" && (f.column === "order_value" || f.column === "order_currency");
  const input = (f: OrderField) => {
    const on = !challanLocked(f);
    return f.type === "select" ? (
      <select
        id={f.column}
        value={read(f.column)}
        disabled={!on}
        onChange={(e) => set(f.column, e.target.value)}
        className={`${inputClass} cursor-pointer`}
      >
        <option value="">—</option>
        {selectOptionsFor(f, read(f.column)).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={f.column}
        type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
        step={f.type === "number" ? "any" : undefined}
        min={f.min}
        value={read(f.column)}
        disabled={!on}
        onChange={(e) => set(f.column, e.target.value)}
        className={inputClass}
      />
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit client and purchase order details"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={() => !saving && onClose()}
    >
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">
              {row ? "Client & purchase order" : "New order"}
            </h2>
            <p className="text-xs text-muted">
              {row ? `SO ${str(row.so_no) || `#${row.sl_no}`} · ` : ""}
              {row
                ? "terms, targets and ECs are Central Visibility's"
                : "Central Visibility is told and fills in the terms, target dates and ECs"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ClientLookup onSelect={applyClient} label="Fill client details from directory" />

        {error && (
          <div role="alert" className="mb-3 rounded-[10px] border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {ORDER_MAKING_GROUPS.map((group) => (
          <section key={group} className="mb-4 rounded-xl border border-card-border p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">{group}</h3>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Only what applies, as the Order details form: FR takes a
                  complaint instead of a quotation and PO, a Spare has no total
                  quantity. */}
              {ORDER_MAKING_EDITABLE.filter((f) => f.group === group && dependsOnSatisfied(f, read)).map((f) => (
                <label key={f.column} htmlFor={f.column} className="block text-sm">
                  <span className="mb-1 block text-[13px] font-medium text-brand-label">
                    {f.label}
                    {f.column === "client_code" && <span className="text-danger"> *</span>}
                  </span>
                  {input(f)}
                  {challanLocked(f) && (
                    <span className="mt-1 block text-[11px] text-muted">0 INR on a Challan order</span>
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-lg border border-input-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {row ? "Save" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}
