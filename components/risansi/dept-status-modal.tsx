"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Loader2, X } from "lucide-react";
import type { DeptCell, SoDeptStatus } from "@/lib/orders";
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

const EC_DEPTS: { key: keyof SoDeptStatus["ecs"][number]; label: string }[] = [
  { key: "drawing", label: "Drawing" },
  { key: "purchase", label: "Purchase" },
  { key: "quality", label: "Quality" },
  { key: "planning", label: "Planning" },
  { key: "assembly", label: "Assembly & Packing" },
];

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
                      { label: "Dispatch", cell: status.dispatch },
                    ] as const
                  ).map((d) => (
                    <div
                      key={d.label}
                      className="flex items-center justify-between gap-2 rounded-lg border border-card-border bg-background px-3 py-2.5"
                    >
                      <span className="text-xs font-medium text-foreground">
                        {d.label}
                      </span>
                      <Badge cell={d.cell} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-EC matrix. */}
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  EC level
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
                          {EC_DEPTS.map((d) => (
                            <th key={d.key} className="px-3 py-2.5 whitespace-nowrap">
                              {d.label}
                            </th>
                          ))}
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
