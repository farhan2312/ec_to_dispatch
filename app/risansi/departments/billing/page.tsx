import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditSection } from "@/lib/roles";
import { listOrdersForSection } from "@/lib/orders";
import {
  PAYMENT_TERMS_CONTEXT_FIELDS,
  SECTION_BY_TABLE,
} from "@/lib/order-schema";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";

export const metadata: Metadata = {
  title: "Billing & Operations | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_billing" as const;

export default async function BillingWorkspacePage() {
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
          <Receipt className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Billing &amp; Operations
          </h1>
          <p className="text-sm text-muted">
            Update PI, freight and packing. Payment Terms is set by Central
            Visibility.
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
