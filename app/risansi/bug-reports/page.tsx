import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bug } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { isCentral } from "@/lib/roles";
import { listBugReports } from "@/lib/bug-reports";
import { BugReportsView } from "@/components/risansi/bug-reports-view";

export const metadata: Metadata = {
  title: "Bug Tracker | Risansi",
};

export const dynamic = "force-dynamic";

export default async function BugReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isCentral(user.role)) redirect("/risansi/dashboard");

  const rows = await listBugReports();

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Bug className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Bug Tracker
          </h1>
          <p className="text-sm text-muted">
            User-submitted bugs and feature requests — {rows.length}{" "}
            {rows.length === 1 ? "report" : "reports"}.
          </p>
        </div>
      </div>

      <BugReportsView rows={rows} />
    </div>
  );
}
