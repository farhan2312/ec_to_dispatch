import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditChild, canEditSection } from "@/lib/roles";
import { listOrdersForBilling } from "@/lib/orders";
import { unreadByOrder } from "@/lib/order-messages";
import { BillingWorkspace } from "@/components/risansi/billing-workspace";

export const metadata: Metadata = {
  title: "Billing & Operations | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_billing" as const;

export default async function BillingWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit } = await searchParams;
  const orders = await listOrdersForBilling();

  // Unread discussion messages per SO, for the row badge.
  const unreadThreads = await unreadByOrder(
    [...new Set(orders.map((r) => String(r.id)))],
    user
  );

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Receipt className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Billing &amp; Operations
          </h1>
          <p className="text-sm text-muted">
            Add one or more PIs per SO and fill their document fields
            (PI No./Date/Value for Tax Invoice, or Challan No./Date/Value + FR
            Reason for Challan). Payment fields are filled by Accounts.
          </p>
        </div>
      </div>

      <BillingWorkspace
        role={user.role}
        unreadThreads={unreadThreads}
        rows={orders}
        canEdit={canEditChild(user.role, "order_billing_docs")}
        openOrderId={edit}
      />
    </div>
  );
}
