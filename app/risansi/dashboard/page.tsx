import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Risansi",
};

export default function DashboardPage() {
  return (
    <div className="px-8 py-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-muted">
        {/* Content will be added in a later task. */}
      </p>
    </div>
  );
}
