import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditSection, isCentral, reminderDeptForTable } from "@/lib/roles";
import { listItemsForSection } from "@/lib/orders";
import { listRemindersForDepartment } from "@/lib/reminders";
import { DISPATCH_CONTEXT_FIELDS, SECTION_BY_TABLE } from "@/lib/order-schema";
import { unreadByOrder } from "@/lib/order-messages";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";
import { RemindersPanel } from "@/components/risansi/reminders-panel";

export const metadata: Metadata = {
  title: "Assembly & Packing | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_assembly_dispatch" as const;

export default async function AssemblyDispatchWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit } = await searchParams;
  const section = SECTION_BY_TABLE.get(TABLE)!;
  const [orders, reminders] = await Promise.all([
    listItemsForSection(
      TABLE,
      DISPATCH_CONTEXT_FIELDS.map((f) => ({
        column: f.column,
        type: f.type,
        from: "orders" as const,
      }))
    ),
    listRemindersForDepartment(reminderDeptForTable(TABLE)!),
  ]);

  // Unread discussion messages per SO, for the row badge. Rows are ECs in
  // the item-scope workspaces (order_id) and SOs in the SO-scope ones (id).
  const unreadThreads = await unreadByOrder(
    [...new Set(orders.map((o) => String(o.order_id ?? o.id)))],
    user
  );

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Truck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Assembly &amp; Packing
          </h1>
          <p className="text-sm text-muted">
            Update assembly, packing and dispatch status for each order.
          </p>
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      <DepartmentWorkspace
        role={user.role}
        unreadThreads={unreadThreads}
        table={TABLE}
        fields={section.fields}
        orders={orders}
        readonlyFields={DISPATCH_CONTEXT_FIELDS}
        canEditCentral={isCentral(user.role)}
        openOrderId={edit}
      />
    </div>
  );
}
