import type { Metadata } from "next";
import { Check, ShieldCheck, X } from "lucide-react";
import { listUsersByStatus, type User, type UserStatus } from "@/lib/users";
import { approveRequest, rejectRequest } from "./actions";

export const metadata: Metadata = {
  title: "Access requests | Admin",
};

// Always render fresh — approvals must reflect the latest DB state.
export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  accounts: "Accounts",
  assembly: "Assembly",
};

const STATUS_STYLES: Record<UserStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  disabled: "bg-gray-100 text-gray-600 ring-gray-200",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export default async function AdminPage() {
  const [pending, approved, rejected] = await Promise.all([
    listUsersByStatus("pending"),
    listUsersByStatus("approved"),
    listUsersByStatus("rejected"),
  ]);

  const processed = [...approved, ...rejected]
    .filter((user) => user.role !== "admin")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    .slice(0, 10);

  return (
    <main className="min-h-screen bg-background px-6 py-10 sm:px-10">
      <div className="mx-auto max-w-5xl">
        {/* header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Access requests
            </h1>
            <p className="text-sm text-muted">
              Approve or reject people requesting access to the platform.
            </p>
          </div>
        </div>

        {/* pending */}
        <section className="mb-10 rounded-xl border border-card-border bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-card-border px-5 py-4">
            <h2 className="font-display text-base font-semibold text-foreground">
              Pending
            </h2>
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {pending.length}
            </span>
          </header>

          {pending.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No pending requests. You&apos;re all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-card-border">
              {pending.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {user.full_name}
                      </p>
                      <RoleBadge role={user.role} />
                    </div>
                    <p className="truncate text-sm text-muted">{user.email}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Requested {formatDate(user.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <form action={approveRequest}>
                      <input type="hidden" name="id" value={user.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                      >
                        <Check className="h-4 w-4" /> Approve
                      </button>
                    </form>
                    <form action={rejectRequest}>
                      <input type="hidden" name="id" value={user.id} />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
                      >
                        <X className="h-4 w-4" /> Reject
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* recently processed */}
        <section className="rounded-xl border border-card-border bg-white shadow-sm">
          <header className="border-b border-card-border px-5 py-4">
            <h2 className="font-display text-base font-semibold text-foreground">
              Recently processed
            </h2>
          </header>

          {processed.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">
              Nothing processed yet.
            </p>
          ) : (
            <ul className="divide-y divide-card-border">
              {processed.map((user: User) => (
                <li
                  key={user.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user.full_name}
                    </p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RoleBadge role={user.role} />
                    <StatusBadge status={user.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
