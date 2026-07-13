import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditSection } from "@/lib/roles";
import { listOrdersForSection } from "@/lib/orders";
import {
  PAYMENT_TERMS_CONTEXT_FIELDS,
  SECTION_BY_TABLE,
} from "@/lib/order-schema";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";

export const metadata: Metadata = {
  title: "Accounts | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_accounts" as const;

export default async function AccountsWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const section = SECTION_BY_TABLE.get(TABLE)!;
  const orders = await listOrdersForSection(
    TABLE,
    PAYMENT_TERMS_CONTEXT_FIELDS.map((f) => ({ column: f.column, type: f.type }))
  );

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Accounts
          </h1>
          <p className="text-sm text-muted">
            Update payment status. Payment Terms is set by Central Visibility.
          </p>
        </div>
      </div>

      <DepartmentWorkspace
        table={TABLE}
        fields={section.fields}
        orders={orders}
        readonlyFields={PAYMENT_TERMS_CONTEXT_FIELDS}
      />
    </div>
  );
}
