"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Search,
  X,
} from "lucide-react";
import type { OrderOverviewRow } from "@/lib/orders";
import type { DeptCompletion } from "@/lib/dept-completion";
import { describeDays } from "@/lib/dept-completion";
import { DEPT_VIEWS, type DeptKey } from "@/lib/dept-view";
import { MultiSelectFilter, SingleSelectFilter } from "./multi-select-filter";
import { Pagination } from "./table-tools";

const PAGE_SIZE = 15;

/** "Today" in IST — the dates are IST calendar dates, so compare as strings. */
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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

/** Whole days from today, negative for the past. */
function daysFromToday(date: string): number {
  const a = new Date(`${todayIso()}T00:00:00Z`).getTime();
  const b = new Date(`${date}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

const PAST_PRESETS = [
  "Today",
  "Yesterday",
  "Last 7 days",
  "This month",
  "This year",
] as const;
// Only a deadline can be in the future, so "Next 7 days" is offered only when
// the department has one.
const DATE_PRESETS = [...PAST_PRESETS, "Next 7 days"] as const;
type DatePreset = (typeof DATE_PRESETS)[number];

function presetRange(preset: DatePreset): [string, string] {
  const today = todayIso();
  const shift = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  switch (preset) {
    case "Today":
      return [today, today];
    case "Yesterday":
      return [shift(-1), shift(-1)];
    case "Last 7 days":
      return [shift(-6), today];
    // A department looks forward as often as back — what is due next week is
    // the question its own target date actually answers.
    case "Next 7 days":
      return [today, shift(7)];
    case "This month":
      return [`${today.slice(0, 7)}-01`, today];
    default:
      return [`${today.slice(0, 4)}-01-01`, today];
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: number;
  hint?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-2xl font-bold tracking-tight text-foreground">
            {value}
          </div>
          <div className="truncate text-xs text-muted">{label}</div>
        </div>
      </div>
      {hint && <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Horizontal bars, longest first — the department's own status vocabulary. */
function StatusBars({
  items,
  total,
}: {
  items: { label: string; count: number; done: boolean }[];
  total: number;
}) {
  if (total === 0) {
    return <p className="py-6 text-sm text-muted">Nothing assigned yet.</p>;
  }
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = total === 0 ? 0 : Math.round((item.count / total) * 100);
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-foreground">{item.label}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {item.count} · {pct}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background">
              <div
                className={`h-full rounded-full ${
                  item.done ? "bg-emerald-500" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * One department's own dashboard: what is on their plate, what state it is in,
 * what is late, and what is due next — over the same rows the central pipeline
 * reads, narrowed to the part of each order that is theirs.
 */
export function DepartmentDashboard({
  dept,
  rows: allRows,
  completions = [],
  workspaceHref,
}: {
  // The key, not the view itself: a view carries functions, and functions
  // cannot cross the server/client boundary.
  dept: DeptKey;
  rows: OrderOverviewRow[];
  completions?: DeptCompletion[];
  // Where a row opens — the department's own workspace.
  workspaceHref?: string | null;
}) {
  const view = DEPT_VIEWS[dept];
  // A department with no deadline of its own filters by when the order came
  // in instead — the presets stay useful either way.
  const dateOf = (r: OrderOverviewRow) =>
    view.hasTarget ? view.target(r) : r.so_date;
  const dateLabel = view.hasTarget ? "Target date" : "SO date";
  const presets = view.hasTarget ? DATE_PRESETS : PAST_PRESETS;
  const [text, setText] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [reps, setReps] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [terms, setTerms] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [signOff, setSignOff] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const signedBy = useMemo(() => {
    const map = new Map<string, DeptCompletion>();
    for (const c of completions) {
      if (c.dept !== view.key) continue;
      map.set(c.item_id ?? c.order_id, c);
    }
    return map;
  }, [completions, view.key]);

  /** The rows this department actually works on. */
  const mine = useMemo(() => {
    // Per-EC departments work on ECs; the SO-scope ones see each order once,
    // so an order's ECs must not multiply its row.
    if (view.perEc) return allRows.filter((r) => r.id !== null);
    const seen = new Set<string>();
    return allRows.filter((r) => {
      if (seen.has(r.order_id)) return false;
      seen.add(r.order_id);
      return true;
    });
  }, [allRows, view.perEc]);

  const signOffOf = (r: OrderOverviewRow) =>
    signedBy.get((view.perEc ? r.id : r.order_id) ?? "") ?? null;

  // Facet options come from the rows themselves, so a value nobody uses never
  // appears in the dropdown.
  const optionsOf = (pick: (r: OrderOverviewRow) => string | null) =>
    [...new Set(mine.map(pick).filter((v): v is string => !!v?.trim()))].sort();
  const zoneOptions = optionsOf((r) => r.zone);
  const repOptions = optionsOf((r) => r.reps);
  const typeOptions = optionsOf((r) => r.item_type ?? r.order_type);
  const termOptions = optionsOf((r) => r.payment_terms);
  const statusOptions = [...new Set(mine.map(view.status))].sort();

  const rows = useMemo(() => {
    const needle = text.trim().toLowerCase();
    const has = (v: string | null, list: string[]) =>
      list.length === 0 || (v ? list.includes(v.trim()) : false);

    return mine.filter((r) => {
      if (needle) {
        const hay = [r.so_no, r.ec_no, r.client_name, r.client_code]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (!has(r.zone, zones)) return false;
      if (!has(r.reps, reps)) return false;
      if (!has(r.item_type ?? r.order_type, types)) return false;
      if (!has(r.payment_terms, terms)) return false;
      if (status && view.status(r) !== status) return false;

      const signed = signOffOf(r);
      if (signOff === "Signed off" && !signed) return false;
      if (signOff === "Not signed off" && signed) return false;

      if (fromDate || toDate) {
        const d = dateOf(r) ?? "";
        if (!d) return false;
        if (fromDate && d < fromDate) return false;
        if (toDate && d > toDate) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, text, zones, reps, types, terms, status, signOff, fromDate, toDate, view, signedBy]);

  const filterActive =
    !!text.trim() ||
    zones.length > 0 ||
    reps.length > 0 ||
    types.length > 0 ||
    terms.length > 0 ||
    !!status ||
    !!signOff ||
    !!fromDate ||
    !!toDate;

  function applyPreset(next: string | null) {
    setPreset(next);
    setPage(1);
    if (!next) {
      setFromDate("");
      setToDate("");
      return;
    }
    const [from, to] = presetRange(next as DatePreset);
    setFromDate(from);
    setToDate(to);
  }

  function clearFilters() {
    setText("");
    setZones([]);
    setReps([]);
    setTypes([]);
    setTerms([]);
    setStatus(null);
    setSignOff(null);
    setPreset(null);
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  // --- the numbers, over everything assigned rather than the filtered view,
  // --- so the cards describe the department's plate, not its current search.
  const applicable = mine.filter((r) => !view.na(r));
  const finished = applicable.filter(view.done);
  const outstanding = applicable.filter((r) => !view.done(r));
  const overdue = outstanding.filter((r) => {
    const t = view.target(r);
    return !!t && t < todayIso();
  });
  const dueSoon = outstanding.filter((r) => {
    const t = view.target(r);
    if (!t) return false;
    const days = daysFromToday(t);
    return days >= 0 && days <= 7;
  });
  const signedOff = applicable.filter((r) => signOffOf(r)).length;

  // Newest sign-offs first, for the departments with no deadline to show.
  const recentSignOffs = mine
    .map((row) => ({ row, done: signOffOf(row) }))
    .filter((x): x is { row: OrderOverviewRow; done: DeptCompletion } => !!x.done)
    .sort((a, b) => (a.done.completed_on < b.done.completed_on ? 1 : -1))
    .slice(0, 6);

  const statusBars = [...new Set(mine.map(view.status))]
    .map((label) => ({
      label,
      count: mine.filter((r) => view.status(r) === label).length,
      done: mine.some((r) => view.status(r) === label && view.done(r)),
    }))
    .sort((a, b) => b.count - a.count);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const from = rows.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const to = Math.min(current * PAGE_SIZE, rows.length);

  const rowHref = (r: OrderOverviewRow) =>
    workspaceHref
      ? `${workspaceHref}?edit=${view.perEc ? (r.id ?? r.order_id) : r.order_id}`
      : `/risansi/orders/${r.order_id}`;

  return (
    <div>
      {/* the numbers */}
      <div
        className={`mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 ${
          view.hasTarget ? "lg:grid-cols-5" : "lg:grid-cols-3"
        }`}
      >
        <StatCard
          icon={ClipboardList}
          label={view.perEc ? "ECs assigned" : "Orders assigned"}
          value={applicable.length}
          hint={
            mine.length !== applicable.length
              ? `${mine.length - applicable.length} not applicable`
              : undefined
          }
          accent="bg-primary/10 text-primary"
        />
        <StatCard
          icon={Clock}
          label="Still open"
          value={outstanding.length}
          accent="bg-blue-50 text-blue-600"
        />
        {view.hasTarget && (
          <>
            <StatCard
              icon={AlertTriangle}
              label="Overdue"
              value={overdue.length}
              hint="past target, not finished"
              accent="bg-rose-50 text-rose-600"
            />
            <StatCard
              icon={CalendarClock}
              label="Due in 7 days"
              value={dueSoon.length}
              accent="bg-amber-50 text-amber-600"
            />
          </>
        )}
        <StatCard
          icon={CheckCircle2}
          label="Finished"
          value={finished.length}
          hint={`${signedOff} signed off`}
          accent="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* where the work stands */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
            Status breakdown
          </h3>
          <StatusBars items={statusBars} total={mine.length} />
        </div>
        <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
            {view.hasTarget ? "Next deadlines" : "Recent sign-offs"}
          </h3>
          {!view.hasTarget ? (
            recentSignOffs.length === 0 ? (
              <p className="py-6 text-sm text-muted">Nothing signed off yet.</p>
            ) : (
              <ol className="space-y-2">
                {recentSignOffs.map(({ row, done }) => (
                  <li
                    key={String(row.id ?? row.order_id)}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <Link
                      href={rowHref(row)}
                      className="truncate font-medium text-primary hover:text-primary-hover"
                    >
                      {row.so_no ?? `#${row.sl_no}`}
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted">
                      {formatDate(done.completed_on)}
                    </span>
                  </li>
                ))}
              </ol>
            )
          ) : dueSoon.length + overdue.length === 0 ? (
            <p className="py-6 text-sm text-muted">Nothing due in the next week.</p>
          ) : (
            <ol className="space-y-2">
              {[...overdue, ...dueSoon]
                .sort((a, b) => (view.target(a)! < view.target(b)! ? -1 : 1))
                .slice(0, 6)
                .map((r) => {
                  const t = view.target(r)!;
                  const days = daysFromToday(t);
                  return (
                    <li
                      key={String(r.id ?? r.order_id)}
                      className="flex items-baseline justify-between gap-2 text-xs"
                    >
                      <Link
                        href={rowHref(r)}
                        className="truncate font-medium text-primary hover:text-primary-hover"
                      >
                        {r.so_no ?? `#${r.sl_no}`}
                        {view.perEc && r.ec_no ? ` · ${r.ec_no}` : ""}
                      </Link>
                      <span
                        className={`shrink-0 tabular-nums ${
                          days < 0 ? "font-semibold text-rose-600" : "text-muted"
                        }`}
                      >
                        {days < 0
                          ? `${Math.abs(days)}d late`
                          : days === 0
                            ? "today"
                            : `in ${days}d`}
                      </span>
                    </li>
                  );
                })}
            </ol>
          )}
        </div>
      </div>

      {/* filters */}
      <div className="mb-4 space-y-2 rounded-xl border border-card-border bg-surface p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPage(1);
              }}
              placeholder="Search SO, EC, client…"
              aria-label="Search orders"
              className="h-9 w-60 rounded-lg border border-input-border bg-surface pl-8 pr-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <MultiSelectFilter label="Zone" options={zoneOptions} selected={zones} onChange={setZones} />
          <MultiSelectFilter label="Rep" options={repOptions} selected={reps} onChange={setReps} />
          <MultiSelectFilter label="Type" options={typeOptions} selected={types} onChange={setTypes} />
          {!view.perEc && termOptions.length > 0 && (
            <MultiSelectFilter
              label="Terms"
              options={termOptions}
              selected={terms}
              onChange={setTerms}
            />
          )}
          <SingleSelectFilter
            label="Status"
            allLabel="Any status"
            options={statusOptions.map((s) => ({ value: s, label: s }))}
            selected={status}
            onChange={setStatus}
          />
          <SingleSelectFilter
            label="Sign-off"
            allLabel="Any"
            options={[
              { value: "Signed off", label: "Signed off" },
              { value: "Not signed off", label: "Not signed off" },
            ]}
            selected={signOff}
            onChange={setSignOff}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {dateLabel}
          </span>
          {presets.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => applyPreset(preset === label ? null : label)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                preset === label
                  ? "border-primary/40 bg-primary/[0.06] text-foreground"
                  : "border-input-border bg-surface text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            aria-label={`${dateLabel} from`}
            value={fromDate}
            onChange={(e) => {
              setPreset(null);
              setFromDate(e.target.value);
              setPage(1);
            }}
            max={toDate || undefined}
            className="h-8 rounded-lg border border-input-border bg-surface px-2 text-xs text-foreground"
          />
          <input
            type="date"
            aria-label={`${dateLabel} to`}
            value={toDate}
            onChange={(e) => {
              setPreset(null);
              setToDate(e.target.value);
              setPage(1);
            }}
            min={fromDate || undefined}
            className="h-8 rounded-lg border border-input-border bg-surface px-2 text-xs text-foreground"
          />
          {filterActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-input-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          )}
          <span className="ml-auto text-xs text-muted">
            <span className="font-semibold text-foreground">{rows.length}</span>{" "}
            of {mine.length}
          </span>
        </div>
      </div>

      {/* the work */}
      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                {view.perEc && <th className="px-4 py-3">EC No.</th>}
                <th className="px-4 py-3">Client</th>
                <th className="px-3 py-3">Zone</th>
                <th className="px-3 py-3">Status</th>
                {view.hasTarget && <th className="px-3 py-3">Target</th>}
                <th className="px-3 py-3">Sign-off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={5 + (view.perEc ? 1 : 0) + (view.hasTarget ? 1 : 0) + 1}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    {filterActive
                      ? "No orders match these filters."
                      : "Nothing assigned yet."}
                  </td>
                </tr>
              )}
              {pageRows.map((r) => {
                const target = view.target(r);
                const late = !!target && target < todayIso() && !view.done(r);
                const signed = signOffOf(r);
                return (
                  <tr
                    key={String(r.id ?? r.order_id)}
                    className="text-foreground transition-colors hover:bg-background/60"
                  >
                    <td className="px-4 py-3 tabular-nums">{r.sl_no}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      <Link
                        href={rowHref(r)}
                        className="text-primary hover:text-primary-hover"
                      >
                        {r.so_no ?? "—"}
                      </Link>
                    </td>
                    {view.perEc && (
                      <td className="px-4 py-3 whitespace-nowrap">{r.ec_no ?? "—"}</td>
                    )}
                    <td className="px-4 py-3">{r.client_name ?? "—"}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-muted">
                      {r.zone ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          view.na(r)
                            ? "bg-slate-100 text-slate-500"
                            : view.done(r)
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {view.status(r)}
                      </span>
                    </td>
                    {view.hasTarget && (
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={late ? "font-medium text-rose-600" : "text-muted"}
                        >
                          {formatDate(target)}
                          {late ? " · overdue" : ""}
                        </span>
                      </td>
                    )}
                    <td className="px-3 py-3 whitespace-nowrap">
                      {signed ? (
                        <span className="text-[11px] font-medium text-emerald-700">
                          {formatDate(signed.completed_on)}
                          {describeDays(signed.days_taken)
                            ? ` · ${describeDays(signed.days_taken)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          page={current}
          totalPages={totalPages}
          setPage={setPage}
          from={from}
          to={to}
          total={rows.length}
        />
      </div>
    </div>
  );
}
