"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bug,
  ChevronDown,
  ExternalLink,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
} from "lucide-react";
import type { BugReportRow, BugStatus } from "@/lib/bug-reports";
import { updateBugReportStatusAction } from "@/app/risansi/bug-reports/actions";

const STATUS_OPTIONS: { value: BugStatus; label: string; tone: string }[] = [
  { value: "open", label: "Open", tone: "bg-rose-50 text-rose-700" },
  { value: "in_progress", label: "In progress", tone: "bg-blue-50 text-blue-700" },
  { value: "resolved", label: "Resolved", tone: "bg-emerald-50 text-emerald-700" },
  { value: "wont_fix", label: "Won't fix", tone: "bg-slate-100 text-slate-600" },
];

const SEVERITY_TONES: Record<string, string> = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-blue-50 text-blue-700",
  High: "bg-amber-50 text-amber-700",
  Critical: "bg-rose-50 text-rose-700",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BugReportsView({ rows }: { rows: BugReportRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setStatus(id: string, status: BugStatus) {
    setSavingId(id);
    const res = await updateBugReportStatusAction(id, status);
    setSavingId(null);
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">No reports yet</p>
        <p className="mt-1 text-sm text-muted">
          Submissions from the &ldquo;Report a Bug&rdquo; button will show here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-card-border bg-surface shadow-sm">
      <ul className="divide-y divide-card-border">
        {rows.map((r) => {
          const isOpen = open.has(r.id);
          const statusMeta =
            STATUS_OPTIONS.find((s) => s.value === r.status) ?? STATUS_OPTIONS[0];
          const isFeature = r.kind === "feature";
          return (
            <li key={r.id} className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      isFeature
                        ? "bg-amber-50 text-amber-600"
                        : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {isFeature ? (
                      <Lightbulb className="h-4 w-4" />
                    ) : (
                      <Bug className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{r.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>{timeAgo(r.created_at)}</span>
                      {r.user_email && (
                        <>
                          <span>·</span>
                          <span>{r.user_email}</span>
                        </>
                      )}
                      {r.page_path && (
                        <>
                          <span>·</span>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                            {r.page_path}
                          </span>
                        </>
                      )}
                      {r.severity && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            SEVERITY_TONES[r.severity] ?? "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.severity}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusMeta.tone}`}
                  >
                    {statusMeta.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-expanded={isOpen}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-input-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                  >
                    Details
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-4 space-y-4 rounded-lg bg-background/40 p-4">
                  {r.description ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {r.description}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">No description provided.</p>
                  )}

                  {r.screenshot_name && (
                    <a
                      href={`/api/bug-reports/${r.id}/screenshot`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-input-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      {r.screenshot_name}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </span>
                    {STATUS_OPTIONS.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setStatus(r.id, s.value)}
                        disabled={savingId === r.id || s.value === r.status}
                        className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-60 ${
                          s.value === r.status
                            ? s.tone
                            : "border border-input-border text-foreground hover:bg-background"
                        }`}
                      >
                        {savingId === r.id && s.value !== r.status && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
