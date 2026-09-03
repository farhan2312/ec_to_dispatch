import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  getAuditStats,
  listAuditEventsPage,
  listAuditUsersPage,
} from "@/lib/audit";
import { parsePage, parseQuery } from "@/lib/pagination";
import { auditSince, AUDIT_CATEGORY_BY_TAB } from "@/lib/audit-range";
import { AuditLogView } from "@/components/risansi/audit-log-view";

export const metadata: Metadata = {
  title: "Audit Log | Risansi",
};

export const dynamic = "force-dynamic";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    tab?: string;
    range?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/risansi/dashboard");

  const { page, q, tab, range } = await searchParams;
  const activeTab = tab ?? "by_user";
  const activeRange = range ?? "7d";
  const since = auditSince(activeRange);
  const search = parseQuery(q);
  const current = parsePage(page);

  // The by-user tab is an aggregate; the others are event lists. Only the
  // one on screen is queried.
  const [stats, users, events] = await Promise.all([
    getAuditStats(),
    activeTab === "by_user"
      ? listAuditUsersPage({ page: current, since, search })
      : null,
    activeTab === "by_user"
      ? null
      : listAuditEventsPage({
          page: current,
          category: AUDIT_CATEGORY_BY_TAB[activeTab] ?? null,
          since,
          search,
        }),
  ]);

  return (
    <AuditLogView
      stats={stats}
      tab={activeTab}
      range={activeRange}
      users={users}
      events={events}
    />
  );
}
