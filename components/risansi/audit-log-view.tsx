"use client";

import { UrlPagination, UrlSearchInput, useUrlTable } from "./url-table";
import { roleLabel } from "@/lib/roles";
import type { AuditEvent, AuditStats, AuditUserRow } from "@/lib/audit";
import type { PageResult } from "@/lib/pagination";
import { AUDIT_RANGES, AUDIT_TABS } from "@/lib/audit-range";

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tone = "green" | "red" | "amber" | "blue" | "neutral";
const TONE: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-rose-50 text-rose-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  neutral: "bg-slate-100 text-slate-600",
};

const ACTION_META: Record<string, { label: string; tone: Tone }> = {
  login: { label: "Signed in", tone: "green" },
  login_failed: { label: "Failed sign-in", tone: "red" },
  logout: { label: "Signed out", tone: "neutral" },
  "password.change": { label: "Changed password", tone: "blue" },
  "order.create": { label: "Created order", tone: "green" },
  "order.update": { label: "Updated order", tone: "blue" },
  "order.import": { label: "Imported orders", tone: "blue" },
  "access.request": { label: "Requested access", tone: "amber" },
  "access.approve": { label: "Approved access", tone: "green" },
  "access.reject": { label: "Rejected access", tone: "red" },
};

function ActionChip({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, tone: "neutral" as Tone };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE[meta.tone]}`}
    >
      {meta.label}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

export function AuditLogView({
  stats,
  tab,
  range,
  users,
  events,
}: {
  stats: AuditStats;
  tab: string;
  range: string;
  // Exactly one of these is populated — whichever tab is on screen.
  users: PageResult<AuditUserRow> | null;
  events: PageResult<AuditEvent> | null;
}) {
  const { setParams } = useUrlTable();
  const isByUser = tab === "by_user";
  const result = (isByUser ? users : events) ?? {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 0,
    totalPages: 1,
    from: 0,
    to: 0,
  };
  const pageRows = result.rows;

  // Aggregation, filtering and paging all happen in SQL now.
  const summary = isByUser
    ? `${result.total} user${result.total === 1 ? "" : "s"} active`
    : `${result.total} event${result.total === 1 ? "" : "s"}`;
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Audit Log
        </h1>
        <p className="text-sm text-muted">
          Full activity trail · who signed in, when, and everything they did
        </p>
      </div>

      {/* stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Logins · 24h" value={stats.logins} />
        <StatCard label="Failed · 24h" value={stats.failed} />
        <StatCard label="Active Users · 24h" value={stats.activeUsers} />
        <StatCard label="Actions · 24h" value={stats.actions} />
      </div>

      {/* tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-card-border">
        {AUDIT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setParams({ tab: t.key === "by_user" ? null : t.key })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* range pills + summary + search */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {AUDIT_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setParams({ range: r.key === "7d" ? null : r.key })}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                range === r.key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input-border text-foreground hover:bg-background"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {/* The 'By user' tab has no event columns — its rows are just user
            identity + role, so the placeholder shifts to match. */}
        <UrlSearchInput
          placeholder={
            isByUser
              ? "Search email, role…"
              : "Search user, action, target…"
          }
        />
      </div>

      <p className="mb-3 text-sm text-muted">{summary}</p>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          {isByUser ? (
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Actions</th>
                  <th className="px-4 py-3">Sessions</th>
                  <th className="px-4 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                      No activity in this range.
                    </td>
                  </tr>
                )}
                {(pageRows as AuditUserRow[]).map((u) => (
                  <tr key={u.email} className="text-foreground">
                    <td className="px-4 py-3 font-medium">{u.email}</td>
                    <td className="px-4 py-3 text-muted">
                      {u.role ? roleLabel(u.role) : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{u.actions}</td>
                    <td className="px-4 py-3 tabular-nums">{u.sessions}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {fmt(u.lastActive)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border">
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                      No events in this range.
                    </td>
                  </tr>
                )}
                {(pageRows as AuditEvent[]).map((e) => (
                  <tr key={e.id} className="text-foreground">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {fmt(e.created_at)}
                    </td>
                    <td className="px-4 py-3">{e.user_email ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">
                      {e.user_role ? roleLabel(e.user_role) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <ActionChip action={e.action} />
                    </td>
                    <td className="px-4 py-3 text-muted">{e.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <UrlPagination
          page={result.page}
          totalPages={result.totalPages}
          from={result.from}
          to={result.to}
          total={result.total}
        />
      </div>
    </div>
  );
}
