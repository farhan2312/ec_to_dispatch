import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditSection, reminderDeptForTable } from "@/lib/roles";
import { listOrdersForSection } from "@/lib/orders";
import { listRemindersForDepartment } from "@/lib/reminders";
import {
  PURCHASE_CONTEXT_FIELDS,
  SECTION_BY_TABLE,
} from "@/lib/order-schema";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";
import { RemindersPanel } from "@/components/risansi/reminders-panel";

export const metadata: Metadata = {
  title: "Purchase | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_purchase" as const;

export default async function PurchaseWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const section = SECTION_BY_TABLE.get(TABLE)!;
  const [orders, reminders] = await Promise.all([
    listOrdersForSection(
      TABLE,
      PURCHASE_CONTEXT_FIELDS.map((f) => ({
        column: f.column,
        type: f.type,
        from: "order_planning" as const,
      }))
    ),
    listRemindersForDepartment(reminderDeptForTable(TABLE)!),
  ]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Package className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Purchase
          </h1>
          <p className="text-sm text-muted">
            Track BOI, gear box &amp; motor status, and readiness. Target Date for
            Purchase is set by Planning.
          </p>
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      <DepartmentWorkspace
        table={TABLE}
        fields={section.fields}
        orders={orders}
        readonlyFields={PURCHASE_CONTEXT_FIELDS}
      />
    </div>
  );
}
