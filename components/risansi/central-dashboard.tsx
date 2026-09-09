"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ClipboardList,
  FileText,
  IndianRupee,
  Loader2,
  PauseCircle,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import type { OrderOverviewRow } from "@/lib/orders";
import { PAYMENT_STATUS_OPTIONS } from "@/lib/order-schema";
import { Pagination } from "./table-tools";

const PIPELINE_PAGE_SIZE = 12;

// Distinct color per payment status value (labels always accompany them).
const PAYMENT_COLORS: Record<string, string> = {
  "Outstanding hold": "#f59e0b",
  "Payment Rcvd": "#10b981",
  "Advance Rcvd": "#3b82f6",
  "Advance Rcvd & Balance payment Awaited": "#6366f1",
  "Payment Awaited": "#94a3b8",
  "After Receipt": "#14b8a6",
};

const numberFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function isHold(value: string | null): boolean {
  return (value ?? "").trim().toLowerCase() === "outstanding hold";
}

// Group the six payment-status values into a small, readable set for the chart.
function paymentGroup(
  value: string | null
): "Hold" | "Awaited" | "Received" | "Not set" {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "") return "Not set";
  if (v === "outstanding hold") return "Hold";
  if (v.includes("awaited")) return "Awaited";
  return "Received"; // Payment Rcvd, Advance Rcvd, After Receipt
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

// "Today" in IST as a YYYY-MM-DD string — matches how dispatch_target_date is
// serialized, so this is a plain string compare with no Date-object timezone
// ambiguity (the runtime's own local timezone never enters into it, whether
// this renders on the server or in the browser).
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** A revised dispatch date supersedes the original wherever it is quoted. */
function dispatchTarget(row: OrderOverviewRow): string | null {
  return row.dispatch_target_revised_date ?? row.dispatch_target_date;
}

/** Past its date and still not finished. */
function late(date: string | null, isDone: boolean): boolean {
  if (!date || isDone) return false;
  return date < todayIso();
}

function isOverdue(row: OrderOverviewRow): boolean {
  if (!row.dispatch_target_date) return false;
  if ((row.dispatch_status ?? "").trim() !== "") return false;
  return row.dispatch_target_date < todayIso();
}

type Tone = "neutral" | "green" | "amber" | "red" | "blue";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-rose-50 text-rose-700",
  blue: "bg-blue-50 text-blue-700",
};

function Chip({ value, tone = "neutral" }: { value: string | null; tone?: Tone }) {
  if (!value || value.trim() === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {value}
    </span>
  );
}

function paymentTone(value: string | null): Tone {
  const group = paymentGroup(value);
  if (group === "Hold") return "amber";
  if (group === "Received") return "green";
  if (group === "Awaited") return "blue";
  return "neutral";
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-display text-2xl font-bold tracking-tight text-foreground">
            {value}
          </div>
          <div className="text-xs text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

type BarItem = { label: string; count: number; color: string };

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
      <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Donut / pie chart with a legend on the right. Slices are drawn from
 * cumulative percentages; a hole in the middle carries the total count for
 * quick scanning. Falls back to an empty ring when nothing is set.
 */
function PieChart({
  items,
  total,
  totalLabel = "Total",
}: {
  items: BarItem[];
  total: number;
  totalLabel?: string;
}) {
  const size = 176;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 80;
  const innerR = 50; // donut hole
  const nonZero = items.filter((i) => i.count > 0);

  function slicePath(startFrac: number, endFrac: number): string {
    // A full-circle "slice" wouldn't render as a path — special-case it as
    // two half-slices so 100% still draws.
    if (endFrac - startFrac >= 1) {
      return (
        slicePath(0, 0.5) + " " + slicePath(0.5, 0.9999)
      );
    }
    const s = startFrac * 2 * Math.PI - Math.PI / 2;
    const e = endFrac * 2 * Math.PI - Math.PI / 2;
    const largeArc = endFrac - startFrac > 0.5 ? 1 : 0;
    const [x1, y1] = [cx + outerR * Math.cos(s), cy + outerR * Math.sin(s)];
    const [x2, y2] = [cx + outerR * Math.cos(e), cy + outerR * Math.sin(e)];
    const [x3, y3] = [cx + innerR * Math.cos(e), cy + innerR * Math.sin(e)];
    const [x4, y4] = [cx + innerR * Math.cos(s), cy + innerR * Math.sin(s)];
    return `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  }

  let acc = 0;
  const slices = nonZero.map((item) => {
    const frac = item.count / total;
    const path = slicePath(acc, acc + frac);
    acc += frac;
    return { ...item, path };
  });

  if (total === 0) return <p className="text-sm text-muted">No orders yet.</p>;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Payment status breakdown">
          {/* faint background ring so a single-slice chart still reads as a ring */}
          <circle cx={cx} cy={cy} r={outerR} fill="var(--card-border, #e4e7ec)" />
          <circle cx={cx} cy={cy} r={innerR} fill="var(--surface, #ffffff)" />
          {slices.map((s) => (
            <path key={s.label} d={s.path} fill={s.color}>
              <title>{`${s.label}: ${s.count} (${Math.round((s.count / total) * 100)}%)`}</title>
            </path>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl font-bold tabular-nums text-foreground">
            {total}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted">
            {totalLabel}
          </span>
        </div>
      </div>
      <ul className="grid min-w-0 flex-1 grid-cols-1 gap-1.5">
        {items.map((item) => {
          const pct = total ? Math.round((item.count / total) * 100) : 0;
          return (
            <li key={item.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 text-muted">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: item.color }}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {item.count} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Horizontal bars scaled to the largest count; each row is labeled. */
function BarList({ items, total }: { items: BarItem[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (total === 0) return <p className="text-sm text-muted">No orders yet.</p>;
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = total ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="flex items-center gap-2 text-muted">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: item.color }}
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {item.count} · {pct}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-card-border">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(item.count / max) * 100}%`,
                  background: item.color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Same completion condition each department uses in the pipeline/notification
// logic. Kept local (and small) to avoid a dependency on lib/notifications.
const done = {
  billing: (r: OrderOverviewRow) => r.has_pi,
  accounts: (r: OrderOverviewRow) => {
    const p = (r.payment_status ?? "").trim().toLowerCase();
    return p === "payment rcvd" || p === "after receipt";
  },
  drawing: (r: OrderOverviewRow) =>
    (r.drg_status ?? "").trim().toLowerCase() === "drg approved",
  // BOI items all received (or the SO doesn't need BOI).
  purchase: (r: OrderOverviewRow) => r.purchase_done,
  qc: (r: OrderOverviewRow) => r.qc_submitted,
  planning: (r: OrderOverviewRow) =>
    (r.planning_status ?? "").trim().toLowerCase() === "completed",
  dispatch: (r: OrderOverviewRow) =>
    (r.dispatch_status ?? "").trim().toLowerCase() === "fully dispatch",
};

/**
 * A department's deadline, shown under its status chip: the target date it
 * works to, or the payment terms for the two that have no date of their own.
 * Turns red once the date has passed and that department still isn't done —
 * the same rule the reminders and the Departments popup use.
 *
 * These all live on the SO, so every EC of an order shows the same value.
 */
function DeptDeadline({
  value,
  isDate = true,
  overdue = false,
}: {
  value: string | null;
  isDate?: boolean;
  overdue?: boolean;
}) {
  const text = value?.trim()
    ? isDate
      ? formatDate(value)
      : value
    : null;
  if (!text) return null;
  return (
    <div
      // Sits inside uppercase table headers as well as normal-case cards, so it
      // resets the casing rather than inheriting "24 AUG 2026".
      className={`mt-0.5 text-[10px] font-normal normal-case tracking-normal ${
        overdue ? "font-medium text-rose-600" : "text-muted-foreground"
      }`}
    >
      {text}
      {overdue ? " · overdue" : ""}
    </div>
  );
}

/** Dispatch status has its own colour scale in both places it is shown. */
function dispatchTone(value: string | null): Tone {
  const v = (value ?? "").toLowerCase();
  if (v === "fully dispatch") return "green";
  if (v === "lot dispatch") return "blue";
  if (v === "pending") return "amber";
  return "neutral";
}

/**
 * The per-EC half of the pipeline, matching the Departments popup: the same
 * five departments, each with the deadline it works to. Planning has no target
 * of its own — it schedules to the dispatch date.
 */
const EC_DEPTS: {
  label: string;
  target: (row: OrderOverviewRow) => string | null;
  done: (row: OrderOverviewRow) => boolean;
  chip: (row: OrderOverviewRow) => React.ReactNode;
}[] = [
  {
    label: "Drawing",
    target: (r) => r.drg_target_date,
    done: done.drawing,
    chip: (r) => <Chip value={r.drg_status} />,
  },
  {
    label: "Purchase",
    target: (r) => r.purchase_target_date,
    done: done.purchase,
    chip: (r) => (
      <Chip
        value={
          (r.boi ?? "") !== "Yes"
            ? "No BOI"
            : r.purchase_done
              ? "BOI received"
              : "BOI pending"
        }
      />
    ),
  },
  {
    label: "Quality",
    target: (r) => r.qc_doc_target_date,
    done: done.qc,
    chip: (r) => (
      <Chip
        value={r.qc_submitted ? "Submitted" : null}
        tone={r.qc_submitted ? "green" : "neutral"}
      />
    ),
  },
  {
    label: "Planning",
    target: dispatchTarget,
    done: done.planning,
    chip: (r) => <Chip value={r.planning_status} />,
  },
  {
    label: "Assembly & Packing",
    target: (r) => r.dispatch_team_target_date,
    done: (r) => r.assembly_done,
    chip: (r) => (
      <Chip
        value={r.assembly_done ? "Packed" : null}
        tone={r.assembly_done ? "green" : "neutral"}
      />
    ),
  },
];

export function CentralDashboard({ rows: allRows }: { rows: OrderOverviewRow[] }) {
  const router = useRouter();
  // Date range filter (inclusive) on each item's dispatch_target_date.
  // ISO YYYY-MM-DD compares as strings, matching how the column is serialized
  // in listOrdersOverview — no Date-object timezone drift.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(() => {
    if (!fromDate && !toDate) return allRows;
    return allRows.filter((r) => {
      const d = r.dispatch_target_date ?? "";
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      return true;
    });
  }, [allRows, fromDate, toDate]);
  const filterActive = !!fromDate || !!toDate;

  function clearFilter() {
    setFromDate("");
    setToDate("");
  }
  function refresh() {
    setRefreshing(true);
    router.refresh();
    // The server-component refetch is quick, but give the spinner a beat so
    // the click registers visibly.
    setTimeout(() => setRefreshing(false), 500);
  }

  const total = rows.length;
  const overdue = rows.filter(isOverdue).length;
  // order_value is only emitted on the SO's first EC (see listOrdersOverview),
  // so summing across all rows gives the true book value.
  const totalValue = rows.reduce((sum, r) => sum + (Number(r.order_value) || 0), 0);

  // Share of orders each department has completed. QC's denominator excludes
  // orders flagged "QC Needed = No", since that department isn't involved.
  const qcApplicable = rows.filter(
    (r) => (r.qc_required ?? "").trim().toLowerCase() !== "no"
  ).length;
  const departmentProgress: { label: string; done: number; of: number }[] = [
    { label: "Billing & Operations", done: rows.filter(done.billing).length, of: total },
    { label: "Accounts", done: rows.filter(done.accounts).length, of: total },
    { label: "Drawing", done: rows.filter(done.drawing).length, of: total },
    { label: "Purchase", done: rows.filter(done.purchase).length, of: total },
    { label: "Quality", done: rows.filter(done.qc).length, of: qcApplicable },
    { label: "Planning", done: rows.filter(done.planning).length, of: total },
    { label: "Assembly & Packing", done: rows.filter(done.dispatch).length, of: total },
  ];

  // Group the per-EC rows into SO cards so each SO is one line with its ECs
  // nested inside. Pagination lives on SO groups so an SO's ECs never
  // straddle two pages.
  type SoCard = {
    order_id: string;
    sl_no: number;
    so_no: string | null;
    client_name: string | null;
    // The three SO-scope departments, on the SO line where they belong: they
    // hold one value for the whole order, so repeating them per EC said
    // nothing. Their deadlines ride along.
    has_pi: boolean;
    payment_status: string | null;
    payment_terms: string | null;
    dispatch_status: string | null;
    dispatch_target: string | null;
    dispatch_done: boolean;
    order_value: string | null;
    ecs: OrderOverviewRow[];
  };
  const soCards: SoCard[] = useMemo(() => {
    const map = new Map<string, SoCard>();
    for (const r of rows) {
      const key = r.order_id;
      const card = map.get(key);
      if (card) card.ecs.push(r);
      else map.set(key, {
        order_id: r.order_id,
        sl_no: r.sl_no,
        so_no: r.so_no,
        client_name: r.client_name,
        has_pi: r.has_pi,
        payment_status: r.payment_status,
        payment_terms: r.payment_terms,
        dispatch_status: r.dispatch_status,
        dispatch_target: dispatchTarget(r),
        dispatch_done: done.dispatch(r),
        order_value: r.order_value,
        ecs: [r],
      });
    }
    return [...map.values()].sort((a, b) => a.sl_no - b.sl_no);
  }, [rows]);

  // Expand/collapse each SO card individually.
  const [expandedSo, setExpandedSo] = useState<Set<string>>(new Set());
  function toggleSo(id: string) {
    setExpandedSo((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(soCards.length / PIPELINE_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pipelineCards = soCards.slice(
    (current - 1) * PIPELINE_PAGE_SIZE,
    current * PIPELINE_PAGE_SIZE
  );
  const from = soCards.length === 0 ? 0 : (current - 1) * PIPELINE_PAGE_SIZE + 1;
  const to = Math.min(current * PIPELINE_PAGE_SIZE, soCards.length);

  // Payment + dispatch status live on the SO, not the EC — so both charts
  // count one per SO card (deduped). Otherwise a 5-EC SO would show up
  // five times in its payment slice and skew the picture.
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
  const soTotal = soCards.length;
  const soHolds = soCards.filter((c) => isHold(c.payment_status)).length;
  const paymentBreakdown: BarItem[] = [
    ...PAYMENT_STATUS_OPTIONS.map((o) => ({
      label: o.label,
      color: PAYMENT_COLORS[o.value] ?? "#94a3b8",
      count: soCards.filter((c) => norm(c.payment_status) === norm(o.value)).length,
    })),
    {
      label: "Not set",
      color: "#d8dee9",
      count: soCards.filter((c) => norm(c.payment_status) === "").length,
    },
  ];

  // Dispatch status breakdown, per SO. "Pending" is its own bucket
  // (recomputed status when the SO has no invoices yet); "Not set" catches
  // any legacy SOs still carrying null before the first recomputation.
  const dispatchBreakdown: BarItem[] = [
    {
      label: "Fully dispatch",
      color: "#10b981",
      count: soCards.filter((c) => norm(c.dispatch_status) === "fully dispatch").length,
    },
    {
      label: "LOT dispatch",
      color: "#3b82f6",
      count: soCards.filter((c) => norm(c.dispatch_status) === "lot dispatch").length,
    },
    {
      label: "Pending",
      color: "#f59e0b",
      count: soCards.filter((c) => norm(c.dispatch_status) === "pending").length,
    },
    {
      label: "Not set",
      color: "#d8dee9",
      count: soCards.filter((c) => norm(c.dispatch_status) === "").length,
    },
  ];

  // Orders by industry type.
  const industryBreakdown: BarItem[] = [
    {
      label: "Sugar",
      color: "#f59e0b",
      count: rows.filter((r) => norm(r.industry_type) === "sugar").length,
    },
    {
      label: "Non Sugar",
      color: "#6366f1",
      count: rows.filter((r) => norm(r.industry_type) === "non sugar").length,
    },
    {
      label: "Not set",
      color: "#d8dee9",
      count: rows.filter(
        (r) =>
          norm(r.industry_type) !== "sugar" &&
          norm(r.industry_type) !== "non sugar"
      ).length,
    },
  ];

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Central Dashboard
          </h1>
          <p className="text-sm text-muted">
            Full visibility of every department&apos;s progress across all
            orders.
          </p>
        </div>

        {/* Date range (on dispatch_target_date) + refresh. */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col">
            <label
              htmlFor="dash-from"
              className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              From
            </label>
            <input
              id="dash-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              max={toDate || undefined}
              className="h-9 rounded-lg border border-input-border bg-surface px-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div className="flex flex-col">
            <label
              htmlFor="dash-to"
              className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              To
            </label>
            <input
              id="dash-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              min={fromDate || undefined}
              className="h-9 rounded-lg border border-input-border bg-surface px-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
          {filterActive && (
            <button
              type="button"
              onClick={clearFilter}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-input-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-background disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {filterActive && (
        <div className="mb-4 rounded-lg border border-card-border bg-surface px-3 py-2 text-xs text-muted">
          Showing <span className="font-semibold text-foreground">{total}</span>{" "}
          of {allRows.length} items with a dispatch target date
          {fromDate ? ` from ${fromDate}` : ""}
          {toDate ? ` to ${toDate}` : ""}.
        </div>
      )}

      {/* stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={FileText}
          label="Total SOs"
          value={numberFmt.format(soTotal)}
          accent="bg-indigo-100 text-indigo-700"
        />
        <StatCard
          icon={ClipboardList}
          label="Total ECs"
          value={numberFmt.format(total)}
          accent="bg-primary/10 text-primary"
        />
        <StatCard
          icon={PauseCircle}
          label="Payment holds"
          value={numberFmt.format(soHolds)}
          accent="bg-amber-100 text-amber-700"
        />
        <StatCard
          icon={AlertTriangle}
          label="Overdue dispatch"
          value={numberFmt.format(overdue)}
          accent="bg-rose-100 text-rose-700"
        />
        <StatCard
          icon={IndianRupee}
          label="Total order value"
          value={numberFmt.format(totalValue)}
          accent="bg-emerald-100 text-emerald-700"
        />
      </div>

      {/* department progress — one full-width row */}
     {/* <div className="mb-8">
        <ChartCard title="Department progress">
          {total === 0 ? (
            <p className="text-sm text-muted">No orders yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {departmentProgress.map((d) => {
                const pct = d.of > 0 ? Math.round((d.done / d.of) * 100) : 0;
                return (
                  <div key={d.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted">{d.label}</span>
                      <span className="tabular-nums text-foreground">
                        {d.done}/{d.of} · {pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-card-border">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChartCard>
      </div>
     */}
      {/* charts — both keyed off SO count, since payment_status and
          dispatch_status live on the SO. */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Payment status">
          <PieChart items={paymentBreakdown} total={soTotal} totalLabel="SOs" />
        </ChartCard>

        <ChartCard title="Dispatch status">
          <BarList items={dispatchBreakdown} total={soTotal} />
        </ChartCard>

      </div>

      {/* pipeline */}
      <h2 className="mb-3 font-display text-base font-semibold text-foreground">
        Order pipeline
      </h2>

      {soCards.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No orders yet</p>
          <p className="mt-1 text-sm text-muted">
            Department progress will appear here as orders are added.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-card-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">Client Name</th>
                <th className="px-3 py-3">Billing</th>
                <th className="px-3 py-3">Accounts</th>
                <th className="px-3 py-3">Dispatch</th>
                <th className="px-3 py-3 text-center normal-case">ECs</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pipelineCards.map((card) => {
                const isOpen = expandedSo.has(card.order_id);
                return (
                  <Fragment key={card.order_id}>
                    <tr className="text-foreground transition-colors hover:bg-background/60">
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSo(card.order_id)}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          aria-expanded={isOpen}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-input-border text-muted-foreground transition-colors hover:bg-background"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">
                        <Link
                          href={`/risansi/orders/${card.order_id}`}
                          className="text-primary hover:text-primary-hover"
                        >
                          {card.sl_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">
                        {card.so_no ?? "—"}
                      </td>
                      <td className="px-4 py-3">{card.client_name ?? "—"}</td>
                      <td className="px-3 py-3 align-top">
                        <Chip
                          value={card.has_pi ? "PI done" : null}
                          tone={card.has_pi ? "green" : "neutral"}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Chip
                          value={card.payment_status}
                          tone={paymentTone(card.payment_status)}
                        />
                        {/* Payment terms are the deadline behind both Billing
                            and Accounts; printed once, under the department
                            that chases it. */}
                        <DeptDeadline value={card.payment_terms} isDate={false} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Chip
                          value={card.dispatch_status}
                          tone={dispatchTone(card.dispatch_status)}
                        />
                        <DeptDeadline
                          value={card.dispatch_target}
                          overdue={late(card.dispatch_target, card.dispatch_done)}
                        />
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums">
                        {card.ecs.length}
                      </td>
                      <td className="px-3 py-3" />
                    </tr>

                    {isOpen && (
                      <tr className="bg-background/40">
                        <td colSpan={9} className="p-0">
                          {/* The per-EC half of the Departments popup: one column
                              per department, each with the target date it is
                              judged against in its header rather than repeated
                              down every row. The three SO-scope departments sit
                              on the SO line above. */}
                          <div className="px-4 py-3">
                            <div>
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                EC level
                                <span className="ml-2 font-normal normal-case tracking-normal">
                                  Target dates are set per order, so every EC
                                  below works to the same one.
                                </span>
                              </p>
                              <div className="overflow-x-auto rounded-lg border border-card-border bg-surface">
                                <table className="w-full min-w-[820px] text-sm">
                                  <thead>
                                    <tr className="border-b border-card-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                                      <th className="px-3 py-2 align-top">EC · Type</th>
                                      {EC_DEPTS.map((dept) => {
                                        const head = card.ecs[0];
                                        const target = head
                                          ? dept.target(head)
                                          : null;
                                        return (
                                          <th
                                            key={dept.label}
                                            className="px-3 py-2 align-top whitespace-nowrap"
                                          >
                                            {dept.label}
                                            <DeptDeadline
                                              value={target}
                                              overdue={
                                                !!head &&
                                                late(
                                                  target,
                                                  card.ecs.every((r) => dept.done(r))
                                                )
                                              }
                                            />
                                          </th>
                                        );
                                      })}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-card-border">
                                    {card.ecs.map((row) => (
                                      <tr key={row.id} className="text-foreground">
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <Link
                                            href={`/risansi/orders/${row.order_id}/items/${row.id}`}
                                            className="text-primary hover:text-primary-hover"
                                          >
                                            {row.ec_no ?? "—"}
                                          </Link>
                                          {row.item_type && (
                                            <div className="text-[11px] text-muted">
                                              {row.item_type}
                                            </div>
                                          )}
                                        </td>
                                        {EC_DEPTS.map((dept) => (
                                          <td key={dept.label} className="px-3 py-2">
                                            {dept.chip(row)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
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
            page={current}
            totalPages={totalPages}
            setPage={setPage}
            from={from}
            to={to}
            total={soCards.length}
          />
        </div>
      )}
    </div>
  );
}
