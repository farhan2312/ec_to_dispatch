"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { addTargetRevisionAction } from "@/app/risansi/orders/actions";
import {
  TARGET_DATES,
  type TargetKey,
  type TargetRevision,
} from "@/lib/target-dates";

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

function formatWhen(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** How far a revision moved the date, in days. */
function shift(from: string, to: string): number | null {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * The SO's target dates, each with a "+" to move it and the history of every
 * value it has held. How often a date moved — and by how much — is the delay
 * story a single current date can't tell.
 */
export function TargetDatesPanel({
  orderId,
  revisions,
  canEdit,
}: {
  orderId: string;
  revisions: TargetRevision[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [openFor, setOpenFor] = useState<TargetKey | null>(null);
  const [expanded, setExpanded] = useState<Set<TargetKey>>(new Set());
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleHistory(key: TargetKey) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function openForm(key: TargetKey) {
    setOpenFor(key);
    setDate("");
    setReason("");
    setError(null);
  }

  async function save(key: TargetKey) {
    if (!date) {
      setError("Choose a date.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await addTargetRevisionAction(orderId, key, date, reason);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpenFor(null);
    // Keep the history open on the row just changed, so the new entry is
    // visible the moment the page refreshes.
    setExpanded((prev) => new Set(prev).add(key));
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h2 className="font-display text-base font-semibold text-foreground">
          Target Dates
        </h2>
        <span className="text-xs text-muted">
          One target per department, for the whole order
        </span>
      </div>

      <div className="divide-y divide-card-border">
        {TARGET_DATES.map((target) => {
          const history = revisions
            .filter((r) => r.target_key === target.key)
            .sort((a, b) => a.seq - b.seq);
          const current = history[history.length - 1] ?? null;
          // Revision 1 is the original, so anything beyond it is a change.
          const changes = Math.max(history.length - 1, 0);
          const isOpen = expanded.has(target.key);

          return (
            <div key={target.key} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="min-w-56 flex-1">
                  <p className="text-[13px] font-medium text-foreground">
                    {target.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {target.hint}
                  </p>
                </div>

                <p className="text-sm font-semibold tabular-nums text-foreground">
                  {formatDate(current?.target_date ?? null)}
                </p>

                {changes > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleHistory(target.key)}
                    aria-expanded={isOpen}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    changed {changes}×
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
                {changes === 0 && history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleHistory(target.key)}
                    aria-expanded={isOpen}
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[11px] font-medium text-muted transition-colors hover:text-foreground"
                  >
                    history
                    <ChevronDown
                      className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                )}

                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      openFor === target.key
                        ? setOpenFor(null)
                        : openForm(target.key)
                    }
                    aria-label={`${history.length === 0 ? "Set" : "Change"} ${target.label}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-input-border text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    {openFor === target.key ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>

              {openFor === target.key && (
                <div className="mt-3 rounded-lg border border-card-border bg-background p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        New date
                      </span>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="h-9 rounded-lg border border-input-border bg-surface px-3 text-sm text-foreground"
                      />
                    </label>
                    <label className="block min-w-64 flex-1">
                      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">
                        Reason{history.length > 0 ? "" : " (optional)"}
                      </span>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why is the date moving?"
                        className="h-9 w-full rounded-lg border border-input-border bg-surface px-3 text-sm text-foreground"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => save(target.key)}
                      disabled={saving}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {history.length === 0 ? "Set date" : "Save revision"}
                    </button>
                  </div>
                  {error && (
                    <p role="alert" className="mt-2 text-xs text-danger">
                      {error}
                    </p>
                  )}
                </div>
              )}

              {isOpen && history.length > 0 && (
                <ol className="mt-3 space-y-1.5 border-l-2 border-card-border pl-3">
                  {history.map((rev, i) => {
                    const previous = history[i - 1];
                    const moved = previous
                      ? shift(previous.target_date, rev.target_date)
                      : null;
                    return (
                      <li
                        key={rev.id}
                        className="flex flex-wrap items-baseline gap-x-2 text-xs"
                      >
                        <span className="font-medium tabular-nums text-foreground">
                          {formatDate(rev.target_date)}
                        </span>
                        {moved !== null && moved !== 0 && (
                          <span
                            className={
                              moved > 0 ? "text-danger" : "text-emerald-600"
                            }
                          >
                            {moved > 0 ? `+${moved}` : moved} d
                          </span>
                        )}
                        <span className="text-muted">
                          {rev.seq === 1 ? "original" : `revision ${rev.seq - 1}`}
                        </span>
                        {rev.reason && (
                          <span className="text-muted-foreground">
                            · {rev.reason}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          · {rev.changed_by_email ?? "—"} ·{" "}
                          {formatWhen(rev.created_at)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
