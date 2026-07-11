import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  // No valid session — send them to sign in.
  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
          Welcome, {user.full_name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          The dashboard will be built in a later task.
        </p>

        {user.role === "admin" && (
          <Link
            href="/admin"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <ShieldCheck className="h-4 w-4" />
            Manage access requests
          </Link>
        )}
      </div>
    </main>
  );
}
