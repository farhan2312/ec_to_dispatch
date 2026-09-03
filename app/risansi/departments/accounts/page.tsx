import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditSection } from "@/lib/roles";
import { listOrdersForSectionPage } from "@/lib/orders";
import { parsePage, parseQuery } from "@/lib/pagination";
import {
  PAYMENT_TERMS_CONTEXT_FIELDS,
  SECTION_BY_TABLE,
} from "@/lib/order-schema";
import { unreadByOrder } from "@/lib/order-messages";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";

export const metadata: Metadata = {
  title: "Accounts | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_accounts" as const;

export default async function AccountsWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; thread?: string; page?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit, thread, page, q } = await searchParams;
  const section = SECTION_BY_TABLE.get(TABLE)!;
  const queue = await listOrdersForSectionPage(
    TABLE,
    PAYMENT_TERMS_CONTEXT_FIELDS.map((f) => ({ column: f.column, type: f.type }))
  ,
      { page: parsePage(page), search: parseQuery(q) }
    );

  // Unread discussion messages per SO, for the row badge. Rows are ECs in
  // the item-scope workspaces (order_id) and SOs in the SO-scope ones (id).
  const unreadThreads = await unreadByOrder(
    [...new Set(queue.rows.map((o) => String(o.order_id ?? o.id)))],
    user
  );

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Accounts
          </h1>
          <p className="text-sm text-muted">
            Update payment status and amount received. Payment Terms is set by
            Central Visibility. Use &ldquo;View PIs&rdquo; on any order to see
            the PIs Billing has created.
          </p>
        </div>
      </div>

      <DepartmentWorkspace
        openThreadId={thread}
        role={user.role}
        unreadThreads={unreadThreads}
        table={TABLE}
        fields={section.fields}
        queue={queue}
        readonlyFields={PAYMENT_TERMS_CONTEXT_FIELDS}
        openOrderId={edit}
      />
    </div>
  );
}
