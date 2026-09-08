"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Loader2, X } from "lucide-react";
import type { DeptCell, DeptTargets, SoDeptStatus } from "@/lib/orders";
import { orderDeptStatusAction } from "@/app/risansi/orders/actions";

function Badge({ cell }: { cell: DeptCell }) {
  const tone =
    cell.state === "done"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : cell.state === "pending"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-slate-100 text-slate-500 border-transparent";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {cell.label}
    </span>
  );
}

const EC_DEPTS: {
  key: keyof SoDeptStatus["ecs"][number];
  label: string;
  // Which target this department works to. Planning has no target column of
  // its own — it schedules the order to the Dispatch Target Date, so that is
  // the date it is judged against here.
  target?: keyof DeptTargets;
}[] = [
  { key: "drawing", label: "Drawing", target: "drawing" },
  { key: "purchase", label: "Purchase", target: "purchase" },
  { key: "quality", label: "Quality", target: "quality" },
  { key: "planning", label: "Planning", target: "dispatch" },
  { key: "assembly", label: "Assembly & Packing", target: "assembly" },
];

/**
 * The date a column is judged against. A revised dispatch date supersedes the
 * original wherever the dispatch target is shown, so Planning and the Dispatch
 * card never quote a date that has since moved.
 */
function targetFor(
  targets: DeptTargets,
  key: keyof DeptTargets
): { date: string | null; label: string } {
  if (key !== "dispatch") return { date: targets[key], label: "Target" };
  return targets.dispatchRevised
    ? { date: targets.dispatchRevised, label: "Revised dispatch target" }
    : { date: targets.dispatch, label: "Dispatch target" };
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isPast(value: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * The target under a department's name. Turns red once the date has passed and
 * that department still has work outstanding — a target nobody has met yet is
 * the thing worth seeing at a glance.
 */
function Target({
  date,
  overdue,
  label = "Target",
}: {
  date: string | null;
  overdue: boolean;
  label?: string;
}) {
  const text = formatDate(date);
  if (!text) {
    return (
      <span className="block text-[10px] font-normal normal-case text-muted-foreground">
        No target
      </span>
    );
  }
  return (
    <span
      className={`block text-[10px] font-normal normal-case ${
        overdue ? "text-danger" : "text-muted-foreground"
      }`}
    >
      {label} {text}
      {overdue ? " · overdue" : ""}
    </span>
  );
}

/**
 * Read-only snapshot of every department's status for one SO: SO-scope depts
 * (Billing / Accounts / Dispatch) up top, then a per-EC matrix.
 */
export function DeptStatusModal({
  orderId,
  soLabel,
  onClose,
}: {
  orderId: string;
  soLabel?: string;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<SoDeptStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await orderDeptStatusAction(orderId);
      if (cancelled) return;
      if (!res.ok) setError(res.error);
      else setStatus(res.status);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Department status for SO ${soLabel ?? ""}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-card-border px-5 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <LayoutGrid className="h-3.5 w-3.5" />
              Department status
            </p>
            <p className="truncate font-display text-sm font-semibold text-foreground">
              {soLabel || "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {error ? (
            <p role="alert" className="py-8 text-sm text-danger">
              {error}
            </p>
          ) : !status ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="space-y-6">
              {/* SO-level departments. */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Order level
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { label: "Billing & Operations", cell: status.billing },
                      { label: "Accounts", cell: status.accounts },
                      {
                        label: "Dispatch",
                        cell: status.dispatch,
                        target: "dispatch",
                      },
                    ] as const
                  ).map((d) => {
                    const target =
                      "target" in d ? targetFor(status.targets, d.target) : null;
                    return (
                      <div
                        key={d.label}
                        className="flex items-center justify-between gap-2 rounded-lg border border-card-border bg-background px-3 py-2.5"
                      >
                        <span className="text-xs font-medium text-foreground">
                          {d.label}
                          {target && (
                            <Target
                              date={target.date}
                              label={target.label}
                              overdue={
                                isPast(target.date) &&
                                d.cell.state === "pending"
                              }
                            />
                          )}
                        </span>
                        <Badge cell={d.cell} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-EC matrix. */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  EC level
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    Target dates are set per order, so every EC below works to
                    the same one.
                  </span>
                </p>
                {status.ecs.length === 0 ? (
                  <p className="rounded-lg border border-card-border bg-background px-3 py-4 text-sm text-muted">
                    No ECs on this order yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-card-border">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead className="bg-background">
                        <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2.5">EC No.</th>
                          {EC_DEPTS.map((d) => {
                            const target = d.target
                              ? targetFor(status.targets, d.target)
                              : null;
                            return (
                              <th
                                key={d.key}
                                className="px-3 py-2.5 whitespace-nowrap align-top"
                              >
                                {d.label}
                                {target && (
                                  <Target
                                    date={target.date}
                                    label={target.label}
                                    overdue={
                                      isPast(target.date) &&
                                      status.ecs.some(
                                        (ec) =>
                                          (ec[d.key] as DeptCell).state ===
                                          "pending"
                                      )
                                    }
                                  />
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-card-border">
                        {status.ecs.map((ec) => (
                          <tr key={ec.id} className="text-foreground">
                            <td className="px-3 py-2.5 whitespace-nowrap font-medium">
                              {ec.ec_no || "—"}
                              {ec.item_type && (
                                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                                  {ec.item_type}
                                </span>
                              )}
                            </td>
                            {EC_DEPTS.map((d) => (
                              <td key={d.key} className="px-3 py-2.5">
                                <Badge cell={ec[d.key] as DeptCell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
