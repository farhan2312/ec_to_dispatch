import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  canSeeCentralDashboard,
  departmentHrefForRole,
  roleLabel,
} from "@/lib/roles";
import { listDeptCompletions, listOrdersOverview } from "@/lib/orders";
import { deptViewForRole } from "@/lib/dept-view";
import { listRemindersForRole } from "@/lib/reminders";
import { CentralDashboard } from "@/components/risansi/central-dashboard";
import { DEPT_DASHBOARDS } from "@/components/risansi/dept-dashboards";
import { RemindersPanel } from "@/components/risansi/reminders-panel";

export const metadata: Metadata = {
  title: "Dashboard | Risansi",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (canSeeCentralDashboard(user.role)) {
    const rows = await listOrdersOverview();
    // Every department's sign-offs, so the pipeline can show what is finished
    // and when, not just what has been recorded.
    const completions = await listDeptCompletions([
      ...new Set(rows.map((r) => r.order_id)),
    ]);
    return <CentralDashboard rows={rows} completions={completions} />;
  }

  // A department sees the same pipeline rows through its own dashboard: its
  // status vocabulary, its target date, its sign-offs.
  const view = deptViewForRole(user.role);
  const Dashboard = view ? DEPT_DASHBOARDS[view.key] : undefined;
  const reminders = await listRemindersForRole(user.role);

  if (!view || !Dashboard) {
    return (
      <div className="px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Welcome, {user.full_name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            You&apos;re signed in as {roleLabel(user.role)}. Use the sidebar to
            open your department workspace.
          </p>
        </div>
        <RemindersPanel reminders={reminders} />
      </div>
    );
  }

  const rows = await listOrdersOverview();
  const completions = await listDeptCompletions([
    ...new Set(rows.map((r) => r.order_id)),
  ]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          {view.label} dashboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Welcome, {user.full_name} — every {view.perEc ? "EC" : "order"} on your
          plate, where it stands, and what is due next.
        </p>
      </div>

      <div className="mb-6">
        <RemindersPanel reminders={reminders} />
      </div>

      <Dashboard
        rows={rows}
        completions={completions}
        workspaceHref={departmentHrefForRole(user.role)}
      />
    </div>
  );
}
