"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardList,
  IndianRupee,
  PauseCircle,
} from "lucide-react";
import type { OrderOverviewRow } from "@/lib/orders";
import { Pagination } from "./table-tools";

const PIPELINE_PAGE_SIZE = 12;

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

function isOverdue(row: OrderOverviewRow): boolean {
  if (!row.dispatch_target_date) return false;
  if ((row.dispatch_status ?? "").trim() !== "") return false;
  const target = new Date(row.dispatch_target_date);
  if (Number.isNaN(target.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return target < today;
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

export function CentralDashboard({ rows }: { rows: OrderOverviewRow[] }) {
  const total = rows.length;
  const holds = rows.filter((r) => isHold(r.payment_status)).length;
  const overdue = rows.filter(isOverdue).length;
  const totalValue = rows.reduce((sum, r) => sum + (Number(r.order_value) || 0), 0);

  // Department progress — share of orders each department has acted on.
  const departments = [
    { label: "Billing", done: rows.filter((r) => r.pi_no).length },
    { label: "Accounts", done: rows.filter((r) => r.payment_status).length },
    { label: "Drawing", done: rows.filter((r) => r.drg_status).length },
    {
      label: "Purchase",
      done: rows.filter((r) => r.gb_status || r.motor_status).length,
    },
    { label: "QC", done: rows.filter((r) => r.qc_submitted).length },
    { label: "Planning", done: rows.filter((r) => r.planning_status).length },
    { label: "Dispatch", done: rows.filter((r) => r.dispatch_status).length },
  ];

  // Pipeline pagination.
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PIPELINE_PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pipelineRows = rows.slice(
    (current - 1) * PIPELINE_PAGE_SIZE,
    current * PIPELINE_PAGE_SIZE
  );
  const from = rows.length === 0 ? 0 : (current - 1) * PIPELINE_PAGE_SIZE + 1;
  const to = Math.min(current * PIPELINE_PAGE_SIZE, rows.length);

  // Payment status — a reserved status palette (each swatch is labeled).
  const paymentBuckets = [
    { key: "Received", color: "#10b981", count: rows.filter((r) => paymentGroup(r.payment_status) === "Received").length },
    { key: "Awaited", color: "#3b82f6", count: rows.filter((r) => paymentGroup(r.payment_status) === "Awaited").length },
    { key: "Hold", color: "#f59e0b", count: rows.filter((r) => paymentGroup(r.payment_status) === "Hold").length },
    { key: "Not set", color: "#d8dee9", count: rows.filter((r) => paymentGroup(r.payment_status) === "Not set").length },
  ];

  return (
    <div className="px-8 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Central Dashboard
        </h1>
        <p className="text-sm text-muted">
          Full visibility of every department&apos;s progress across all orders.
        </p>
      </div>

      {/* stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          label="Total orders"
          value={numberFmt.format(total)}
          accent="bg-primary/10 text-primary"
        />
        <StatCard
          icon={PauseCircle}
          label="Payment holds"
          value={numberFmt.format(holds)}
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

      {/* charts */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* department progress — single-hue magnitude bars */}
        <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
            Department progress
          </h3>
          <div className="space-y-3">
            {departments.map((d) => {
              const pct = total ? Math.round((d.done / total) * 100) : 0;
              return (
                <div key={d.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-muted">{d.label}</span>
                    <span className="tabular-nums text-foreground">
                      {d.done}/{total} · {pct}%
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
        </div>

        {/* payment status — reserved status palette, labeled legend */}
        <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
          <h3 className="mb-4 font-display text-sm font-semibold text-foreground">
            Payment status
          </h3>
          {total === 0 ? (
            <p className="text-sm text-muted">No orders yet.</p>
          ) : (
            <>
              <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
                {paymentBuckets
                  .filter((b) => b.count > 0)
                  .map((b) => (
                    <div
                      key={b.key}
                      title={`${b.key}: ${b.count}`}
                      style={{
                        width: `${(b.count / total) * 100}%`,
                        background: b.color,
                      }}
                    />
                  ))}
              </div>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
                {paymentBuckets.map((b) => (
                  <li
                    key={b.key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ background: b.color }}
                      />
                      <span className="text-muted">{b.key}</span>
                    </span>
                    <span className="tabular-nums text-foreground">{b.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* pipeline */}
      <h2 className="mb-3 font-display text-base font-semibold text-foreground">
        Order pipeline
      </h2>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">No orders yet</p>
          <p className="mt-1 text-sm text-muted">
            Department progress will appear here as orders are added.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-card-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO / EC</th>
                <th className="px-4 py-3">Party</th>
                <th className="px-3 py-3">Billing</th>
                <th className="px-3 py-3">Accounts</th>
                <th className="px-3 py-3">Drawing</th>
                <th className="px-3 py-3">Purchase</th>
                <th className="px-3 py-3">QC</th>
                <th className="px-3 py-3">Planning</th>
                <th className="px-3 py-3">Dispatch</th>
                <th className="px-3 py-3">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pipelineRows.map((row) => {
                const overdueRow = isOverdue(row);
                const purchase =
                  [row.gb_status, row.motor_status]
                    .filter((s) => s && s.trim() !== "")
                    .join(" / ") || null;
                return (
                  <tr key={row.id} className="text-foreground">
                    <td className="px-4 py-3 font-medium tabular-nums">
                      <Link
                        href={`/risansi/orders/${row.id}`}
                        className="text-primary hover:text-primary-hover"
                      >
                        {row.sl_no}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div>{row.so_no ?? "—"}</div>
                      <div className="text-xs text-muted">{row.ec_no ?? ""}</div>
                    </td>
                    <td className="px-4 py-3">{row.party ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Chip
                        value={row.pi_no ? "PI done" : null}
                        tone={row.pi_no ? "green" : "neutral"}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Chip
                        value={row.payment_status}
                        tone={paymentTone(row.payment_status)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Chip value={row.drg_status} />
                    </td>
                    <td className="px-3 py-3">
                      <Chip value={purchase} />
                    </td>
                    <td className="px-3 py-3">
                      <Chip
                        value={row.qc_submitted ? "Submitted" : null}
                        tone={row.qc_submitted ? "green" : "neutral"}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Chip value={row.planning_status} />
                    </td>
                    <td className="px-3 py-3">
                      <Chip
                        value={row.dispatch_status}
                        tone={row.dispatch_status ? "green" : "neutral"}
                      />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={overdueRow ? "font-medium text-rose-600" : "text-muted"}>
                        {formatDate(row.dispatch_target_date)}
                      </span>
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
      )}
    </div>
  );
}
