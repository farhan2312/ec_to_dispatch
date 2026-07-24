import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock,
  OctagonAlert,
  PauseCircle,
  Pencil,
} from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canSeeEscalations, departmentHrefForRole } from "@/lib/roles";
import { listAlerts, type AlertRow } from "@/lib/alerts";
import {
  listNotifications,
  recipientRolesForUser,
  type NotificationRow,
} from "@/lib/notifications";
import { MarkNotificationsSeen } from "@/components/risansi/mark-notifications-seen";

export const metadata: Metadata = {
  title: "Notifications | Risansi",
};

export const dynamic = "force-dynamic";

// ---------- event feed ----------

const NOTIF_ICON = {
  payment_terms: PauseCircle,
  target_date: Clock,
  dept_complete: CheckCircle2,
  dept_update: Pencil,
} as const;

const NOTIF_TONE = {
  payment_terms: "bg-amber-50 text-amber-600",
  target_date: "bg-blue-50 text-blue-600",
  dept_complete: "bg-emerald-50 text-emerald-600",
  dept_update: "bg-slate-100 text-slate-600",
} as const;

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
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function NotificationFeed({
  items,
  hrefFor,
}: {
  items: NotificationRow[];
  // Where "Open" should land — a department's own edit form, or the order
  // summary for central/admin (see the page component below).
  hrefFor: (orderId: string) => string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">No notifications yet</p>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll be notified here as orders progress.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-surface shadow-sm">
      <ul className="divide-y divide-card-border">
        {items.map((n) => {
          const Icon = NOTIF_ICON[n.type] ?? Bell;
          const tone = NOTIF_TONE[n.type] ?? "bg-slate-100 text-slate-600";
          return (
            <li
              key={n.id}
              className="flex items-center justify-between gap-3 px-5 py-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.message}</p>
                  <p className="text-xs text-muted">{timeAgo(n.created_at)}</p>
                </div>
              </div>
              {n.order_id && (
                <Link
                  href={hrefFor(n.order_id)}
                  className="shrink-0 text-sm font-medium text-primary hover:text-primary-hover"
                >
                  Open
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- escalations (oversight only) ----------

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
  { icon: typeof AlertTriangle; chip: string }
> = {
  escalation: { icon: PauseCircle, chip: "bg-rose-50 text-rose-700 ring-rose-200" },
  serious: { icon: OctagonAlert, chip: "bg-rose-50 text-rose-700 ring-rose-200" },
  warning: { icon: AlertTriangle, chip: "bg-amber-50 text-amber-700 ring-amber-200" },
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

function Escalations({ alerts }: { alerts: AlertRow[] }) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-surface px-6 py-12 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">All clear</p>
        <p className="mt-1 text-sm text-muted">
          No overdue steps, LD risks or payment holds right now.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-surface shadow-sm">
      <ul className="divide-y divide-card-border">
        {alerts.map((alert, i) => {
          const style = SEVERITY_STYLES[severityOf(alert)];
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
  );
}

// ---------- page ----------

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const oversight = canSeeEscalations(user.role);
  const [notifications, alerts] = await Promise.all([
    listNotifications(recipientRolesForUser(user.role)),
    oversight ? listAlerts() : Promise.resolve<AlertRow[]>([]),
  ]);

  // Departments open straight into their own edit form for that order;
  // central/admin open the full order summary, as before.
  const deptHref = departmentHrefForRole(user.role);
  const hrefFor = (orderId: string) =>
    deptHref ? `${deptHref}?edit=${orderId}` : `/risansi/orders/${orderId}`;

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <MarkNotificationsSeen />

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bell className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            {oversight ? "Notifications & Escalations" : "Notifications"}
          </h1>
          <p className="text-sm text-muted">
            {oversight
              ? "Updates on your orders, plus overdue steps, LD risks and payment holds across all orders."
              : "Updates on the orders your department works on."}
          </p>
        </div>
      </div>

      <NotificationFeed items={notifications} hrefFor={hrefFor} />

      {oversight && (
        <>
          <h2 className="mb-3 mt-8 font-display text-base font-semibold text-foreground">
            Escalations — {alerts.length} active
          </h2>
          <Escalations alerts={alerts} />
        </>
      )}
    </div>
  );
}
