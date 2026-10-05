"use client";

import { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { getReadyLotHistoryAction } from "@/app/risansi/orders/actions";
import type { ReadyLotEvent } from "@/lib/orders";

const ROLE_NAMES: Record<string, string> = {
  planning: "Planning",
  central_visibility: "Central Visibility",
  admin: "Admin",
};

function day(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function when(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One history entry as a sentence. */
function describe(e: ReadyLotEvent): string {
  const lot = `Lot ${e.lot_no}`;
  // Planning's status / date with no lots.
  if (e.lot_no === 0) {
    if (e.action === "recorded") return `${e.status ?? "—"} · ${day(e.ready_date)} — first recorded`;
    const parts: string[] = [];
    if (e.prev_status !== e.status) parts.push(`${e.prev_status ?? "—"} → ${e.status ?? "—"}`);
    else if (e.status) parts.push(e.status);
    if (e.prev_ready_date !== e.ready_date) parts.push(`${day(e.prev_ready_date)} → ${day(e.ready_date)}`);
    else parts.push(day(e.ready_date));
    return parts.join(" · ");
  }
  switch (e.action) {
    case "added":
      return `${lot} added · ${e.status ?? "—"} · ${day(e.ready_date)}`;
    case "removed":
      return `${lot} removed (was ${e.status ?? "—"} · ${day(e.ready_date)})`;
    case "recorded":
      return `${lot} · ${e.status ?? "—"} · ${day(e.ready_date)} — first recorded`;
    default: {
      const parts: string[] = [];
      if (e.prev_status !== e.status) parts.push(`${e.prev_status ?? "—"} → ${e.status ?? "—"}`);
      if (e.prev_ready_date !== e.ready_date) parts.push(`${day(e.prev_ready_date)} → ${day(e.ready_date)}`);
      return `${lot} · ${parts.join(" · ") || "updated"}`;
    }
  }
}

/**
 * The readiness date, clickable: opens how the SO's readiness lots moved —
 * every lot added, re-dated or re-statused, by whom and when.
 */
export function ReadyLotHistoryButton({
  orderId,
  label,
  soLabel,
}: {
  orderId: string;
  label: string;
  soLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ReadyLotEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getReadyLotHistoryAction(orderId).then((res) => {
      if (!live) return;
      if (res.ok) setEvents(res.events);
      else setError(res.error);
    });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      live = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, orderId]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setEvents(null);
          setError(null);
          setOpen(true);
        }}
        title="See how the readiness lots changed"
        className="inline-flex items-center gap-1 whitespace-nowrap text-left underline decoration-dotted underline-offset-2 hover:text-foreground"
      >
        {label}
        <History className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Readiness history for ${soLabel}`}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-foreground">Readiness history</h2>
                <p className="text-xs text-muted">{soLabel} · newest first</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {error ? (
              <p className="text-sm text-danger">{error}</p>
            ) : events === null ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted">Nothing recorded on this SO yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {events.map((e, i) => (
                  <li key={i} className="rounded-lg border border-card-border px-3 py-2">
                    <p className="text-sm font-medium text-foreground">{describe(e)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {e.action === "recorded"
                        ? `before history was kept · ${when(e.changed_at)}`
                        : `by ${e.changed_by_name ?? "—"}${
                            e.changed_by_role ? ` (${ROLE_NAMES[e.changed_by_role] ?? e.changed_by_role})` : ""
                          } · ${when(e.changed_at)}`}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </>
  );
}
