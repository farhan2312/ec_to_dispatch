import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getAuditStats, listRecentAuditEvents } from "@/lib/audit";
import { AuditLogView } from "@/components/risansi/audit-log-view";

export const metadata: Metadata = {
  title: "Audit Log | Risansi",
};

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/risansi/dashboard");

  const [stats, events] = await Promise.all([
    getAuditStats(),
    listRecentAuditEvents(),
  ]);

  return <AuditLogView stats={stats} events={events} />;
}
