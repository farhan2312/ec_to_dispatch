import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeCentralDashboard, roleLabel } from "@/lib/roles";
import { listOrdersOverview } from "@/lib/orders";
import { CentralDashboard } from "@/components/risansi/central-dashboard";

export const metadata: Metadata = {
  title: "Dashboard | Risansi",
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (canSeeCentralDashboard(user.role)) {
    const rows = await listOrdersOverview();
    return <CentralDashboard rows={rows} />;
  }

  // Department roles get a light landing view.
  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Welcome, {user.full_name}
      </h1>
      <p className="mt-1 text-sm text-muted">
        You&apos;re signed in as {roleLabel(user.role)}. Use the sidebar to open
        your department workspace.
      </p>
    </div>
  );
}
