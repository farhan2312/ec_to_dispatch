import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PenTool } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditSection, isCentral, reminderDeptForTable } from "@/lib/roles";
import { listItemsForSectionPage } from "@/lib/orders";
import { parsePage, parseQuery } from "@/lib/pagination";
import { listRemindersForDepartment } from "@/lib/reminders";
import {
  DRAWING_CONTEXT_FIELDS,
  SECTION_BY_TABLE,
} from "@/lib/order-schema";
import { unreadByOrder } from "@/lib/order-messages";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";
import { RemindersPanel } from "@/components/risansi/reminders-panel";

export const metadata: Metadata = {
  title: "Drawing | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_drawing" as const;

export default async function DrawingWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; thread?: string; page?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit, thread, page, q } = await searchParams;
  const section = SECTION_BY_TABLE.get(TABLE)!;
  const [queue, reminders] = await Promise.all([
    listItemsForSectionPage(
      TABLE,
      DRAWING_CONTEXT_FIELDS.map((f) => ({
        column: f.column,
        type: f.type,
        from: "orders" as const,
      }))
    ,
      { page: parsePage(page), search: parseQuery(q) }
    ),
    listRemindersForDepartment(reminderDeptForTable(TABLE)!),
  ]);

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
          <PenTool className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Drawing
          </h1>
          <p className="text-sm text-muted">
            Record a revision per drawing issue. You fill the issued-to-Client
            and issued-to-Production hand-offs; approval is recorded by Central
            Visibility and shown here read-only.
          </p>
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      <DepartmentWorkspace
        openThreadId={thread}
        role={user.role}
        unreadThreads={unreadThreads}
        table={TABLE}
        fields={section.fields}
        queue={queue}
        readonlyFields={DRAWING_CONTEXT_FIELDS}
        // Approval on a revision is Central Visibility's to set — Drawing sees
        // it read-only. Without this the prop defaults to true and Drawing
        // could edit it.
        canEditCentral={isCentral(user.role)}
        openOrderId={edit}
      />
    </div>
  );
}
