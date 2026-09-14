"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Loader2, X } from "lucide-react";
import type { SoDeptStatus } from "@/lib/orders";
import { orderDeptStatusAction } from "@/app/risansi/orders/actions";
import { DeptStatusBoard } from "./dept-status-board";

/**
 * Read-only snapshot of every department's status for one SO: SO-scope depts
 * (Billing / Accounts / Dispatch) up top, then a per-EC matrix. The same board
 * the order overview page shows, so the popup is a quick look at what that
 * page carries in full.
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
            <DeptStatusBoard status={status} compact />
          )}
        </div>
      </div>
    </div>
  );
}
