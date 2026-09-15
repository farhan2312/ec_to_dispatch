"use client";

import { AlertTriangle, PackageCheck, X } from "lucide-react";
import { UrlSearchInput, useUrlTable } from "./url-table";
import { MultiSelectFilter, SingleSelectFilter } from "./multi-select-filter";
import {
  DEPTS_WITHOUT_PARTY,
  DEPT_FILTER_KEYS,
  DEPT_FILTER_LABELS,
  statusesFor,
  type DeptFilterKey,
} from "@/lib/dept-status";
import {
  DATE_PRESETS,
  ORDER_DATE_FIELDS,
  SIGN_OFF_OPTIONS,
  isOrderListFiltered,
  parseDeptFilter,
  presetRange,
} from "@/lib/order-list-filter";
import type { OrderListOptions } from "@/lib/orders";

/** Every parameter the filter owns — what "Clear all" empties. */
const FILTER_KEYS = [
  "q",
  "zone",
  "rep",
  "market",
  "type",
  "dept",
  "dstatus",
  "signoff",
  "datefield",
  "from",
  "to",
  "overdue",
  "ready",
];

/**
 * The central dashboard's filters, for the orders list. Every control writes
 * to the URL and the server filters the whole table, so what you see — and
 * what Export downloads — is every matching SO, not just the page on screen.
 */
export function OrderListFilterBar({
  options,
  total,
  dept,
  searchPlaceholder = "Search SO, client name, client code, EC…",
  hasTarget = true,
}: {
  options: OrderListOptions;
  total: number;
  /**
   * Inside a department's own queue the department is not a choice: it is
   * pinned, the selector is dropped, and Status and Completion read that
   * department's vocabulary.
   */
  dept?: DeptFilterKey;
  searchPlaceholder?: string;
  /** Whether the pinned department works to a target date at all. */
  hasTarget?: boolean;
}) {
  // Who the customer is does not change what these departments do: they work
  // to dates and statuses, so the party facets are noise on their queues.
  const showsParty = !dept || !DEPTS_WITHOUT_PARTY.has(dept);
  const { get, setParams } = useUrlTable();
  const filter = parseDeptFilter(
    (key) => get(key) || undefined,
    dept ?? null
  );
  const filtered = isOrderListFiltered(filter);
  const activeDept = dept ?? filter.dept;

  const activePreset =
    DATE_PRESETS.find((p) => {
      const [from, to] = presetRange(p);
      return from === filter.from && to === filter.to;
    }) ?? null;

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-card-border bg-surface p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchInput placeholder={searchPlaceholder} />
        {showsParty && (
        <>
        <MultiSelectFilter
          label="Zone"
          options={options.zones}
          selected={filter.zones}
          onChange={(next) => setParams({ zone: next })}
        />
        <MultiSelectFilter
          label="Rep"
          options={options.reps}
          selected={filter.reps}
          onChange={(next) => setParams({ rep: next })}
        />
        <MultiSelectFilter
          label="Market"
          options={options.markets}
          selected={filter.markets}
          onChange={(next) => setParams({ market: next })}
        />
        <MultiSelectFilter
          label="Type"
          options={options.types}
          selected={filter.types}
          onChange={(next) => setParams({ type: next })}
        />
        </>
        )}
        {!dept && (
        <SingleSelectFilter
          label="Department"
          allLabel="All departments"
          options={DEPT_FILTER_KEYS.map((k) => ({ value: k, label: DEPT_FILTER_LABELS[k] }))}
          selected={filter.dept}
          onChange={(next) => {
            // A status is one department's word; keep it only if the new
            // department has it too. Sign-off belongs to a department, so it
            // goes when the department does.
            const status =
              next && filter.deptStatus &&
              statusesFor(next as DeptFilterKey).includes(filter.deptStatus)
                ? filter.deptStatus
                : null;
            setParams({
              dept: next,
              dstatus: status,
              signoff: next ? filter.signOff : null,
            });
          }}
        />
        )}
        <SingleSelectFilter
          label="Status"
          allLabel="Any status"
          disabled={!activeDept}
          options={(activeDept ? statusesFor(activeDept) : []).map((v) => ({
            value: v,
            label: v,
          }))}
          selected={filter.deptStatus}
          onChange={(next) => setParams({ dstatus: next })}
        />
        <SingleSelectFilter
          label="Completion"
          allLabel="Any"
          disabled={!activeDept}
          options={SIGN_OFF_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          selected={filter.signOff}
          onChange={(next) => setParams({ signoff: next })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Past its own target with work outstanding — only meaningful for a
            department that works to a date. */}
        {activeDept && hasTarget && (
          <button
            type="button"
            onClick={() => setParams({ overdue: filter.overdue ? null : "1" })}
            aria-pressed={filter.overdue}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filter.overdue
                ? "border-danger-border bg-danger-bg text-danger"
                : "border-input-border text-foreground hover:bg-background"
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Overdue only
          </button>
        )}
        {/* Dispatch comes after Assembly & Packing: this is the shortlist
            of orders they have packed and that have not gone out. */}
        {activeDept === "dispatch" && (
          <button
            type="button"
            onClick={() => setParams({ ready: filter.ready ? null : "1" })}
            aria-pressed={filter.ready}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
              filter.ready
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                : "border-input-border text-foreground hover:bg-background"
            }`}
          >
            <PackageCheck className="h-3.5 w-3.5" />
            Ready to dispatch
          </button>
        )}
        <SingleSelectFilter
          label="Date"
          allLabel={dept ? "Target date" : "Dispatch target"}
          // A department has no use for somebody else's target; it keeps its
          // own, the order's own dates, and when work was completed.
          options={ORDER_DATE_FIELDS.filter(
            (f) => !dept || f.value !== "dispatch_target"
          ).map((f) => ({ value: f.value, label: f.label }))}
          selected={filter.dateField}
          onChange={(next) =>
            setParams({
              datefield:
                next === (dept ? "dept_target" : "dispatch_target") ? null : next,
            })
          }
        />
        {DATE_PRESETS.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (activePreset === label) {
                setParams({ from: null, to: null });
                return;
              }
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
        {filtered && (
          <>
            <button
              type="button"
              onClick={() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-input-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
            <span className="ml-auto text-xs text-muted">
              <span className="font-semibold text-foreground">{total}</span> matching{" "}
              {total === 1 ? "order" : "orders"}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
