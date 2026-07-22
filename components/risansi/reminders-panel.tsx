"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, ChevronDown, Clock } from "lucide-react";
import type { ReminderRow, ReminderTier } from "@/lib/reminders";

const TIER_STYLE: Record<
  ReminderTier,
  { label: string; chip: string; dot: string }
> = {
  "24h": {
    label: "Within 24h",
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    dot: "bg-rose-500",
  },
  "72h": {
    label: "Within 72h",
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  "7d": {
    label: "Within 7 days",
    chip: "bg-blue-50 text-blue-700 ring-blue-200",
    dot: "bg-blue-500",
  },
};

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dueText(daysLeft: number): string {
  if (daysLeft <= 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  return `Due in ${daysLeft} days`;
}

/**
 * Upcoming department deadlines (7d / 72h / 24h). Renders nothing when there
 * are none, so it stays out of the way until something is actually coming due.
 * `showDepartment` labels each row with its department (for cross-department
 * views); omit it on a single-department page.
 */
export function RemindersPanel({
  reminders,
  showDepartment = false,
}: {
  reminders: ReminderRow[];
  showDepartment?: boolean;
}) {
  const [open, setOpen] = useState(true);

  if (reminders.length === 0) return null;

  const critical = reminders.filter((r) => r.tier === "24h").length;

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-card-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 border-b border-card-border px-5 py-3.5 text-left transition-colors hover:bg-background/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
          <BellRing className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">Reminders</p>
          <p className="text-xs text-muted">
            {reminders.length} upcoming deadline
            {reminders.length === 1 ? "" : "s"}
            {critical > 0 ? ` · ${critical} due within 24h` : ""}
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul className="divide-y divide-card-border">
          {reminders.map((r) => {
            const style = TIER_STYLE[r.tier];
            return (
              <li
                key={`${r.id}-${r.dept}`}
                className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.chip}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {dueText(r.days_left)} · {formatDate(r.due_date)}
                      {showDepartment ? ` · ${r.department}` : ""}
                    </p>
                    <p className="truncate text-xs text-muted">
                      #{r.sl_no} · {r.so_no ?? "—"}
                      {r.ec_no ? ` · ${r.ec_no}` : ""}
                      {r.party ? ` · ${r.party}` : ""}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/risansi/orders/${r.id}`}
                  className="shrink-0 text-sm font-medium text-primary hover:text-primary-hover"
                >
                  Open
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
