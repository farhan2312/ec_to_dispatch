import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Bell, OctagonAlert, PauseCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canSeeEscalations } from "@/lib/roles";
import { listAlerts, type AlertRow } from "@/lib/alerts";

export const metadata: Metadata = {
  title: "Notifications | Risansi",
};

export const dynamic = "force-dynamic";

type Severity = "escalation" | "serious" | "warning";

function severityOf(alert: AlertRow): Severity {
  if (alert.type === "hold") return "escalation";
  if (alert.type === "ld_risk") return "serious";
  return (alert.days_overdue ?? 0) >= 7 ? "serious" : "warning";
}

function messageOf(alert: AlertRow): string {
  if (alert.type === "hold") return "Payment on hold — escalated to Central Visibility";
  const days = alert.days_overdue ?? 0;
  if (alert.type === "ld_risk") return `QC docs overdue by ${days} day(s) — LD risk`;
  return `${alert.department} overdue by ${days} day(s)`;
}

const SEVERITY_STYLES: Record<
  Severity,
  { icon: typeof AlertTriangle; chip: string; label: string }
> = {
  escalation: {
    icon: PauseCircle,
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    label: "Escalation",
  },
  serious: {
    icon: OctagonAlert,
    chip: "bg-rose-50 text-rose-700 ring-rose-200",
    label: "Serious",
  },
  warning: {
    icon: AlertTriangle,
    chip: "bg-amber-50 text-amber-700 ring-amber-200",
    label: "Warning",
  },
};

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

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canSeeEscalations(user.role)) redirect("/risansi/dashboard");

  const alerts = await listAlerts();

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Notifications &amp; Escalations
          </h1>
          <p className="text-sm text-muted">
            Overdue department steps, LD risks and payment holds across all
            orders — {alerts.length} active.
          </p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-foreground">All clear</p>
          <p className="mt-1 text-sm text-muted">
            No overdue steps, LD risks or payment holds right now.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-card-border bg-surface shadow-sm">
          <ul className="divide-y divide-card-border">
            {alerts.map((alert, i) => {
              const severity = severityOf(alert);
              const style = SEVERITY_STYLES[severity];
              const Icon = style.icon;
              return (
                <li
                  key={`${alert.id}-${alert.department}-${i}`}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style.chip}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {alert.department}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {messageOf(alert)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        #{alert.sl_no} · {alert.so_no ?? "—"}
                        {alert.ec_no ? ` · ${alert.ec_no}` : ""}
                        {alert.party ? ` · ${alert.party}` : ""}
                        {alert.due_date ? ` · due ${formatDate(alert.due_date)}` : ""}
                      </p>
                    </div>
                  </div>
                  <Link
                    href={`/risansi/orders/${alert.id}`}
                    className="shrink-0 text-sm font-medium text-primary hover:text-primary-hover"
                  >
                    Open
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
