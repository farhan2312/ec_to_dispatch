import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditChild, canEditSection, reminderDeptForTable } from "@/lib/roles";
import {
  listItemsForPurchasePage,
  resolveFocusOrderId,
  listDeptCompletions,
} from "@/lib/orders";
import { parsePage, parseQuery } from "@/lib/pagination";
import { listRemindersForDepartment } from "@/lib/reminders";
import { unreadByOrder } from "@/lib/order-messages";
import { PurchaseWorkspace } from "@/components/risansi/purchase-workspace";
import { RemindersPanel } from "@/components/risansi/reminders-panel";

export const metadata: Metadata = {
  title: "Purchase | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_purchase" as const;

export default async function PurchaseWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; thread?: string; page?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit, thread, page, q } = await searchParams;
  // A notification links to an EC (item id) or an SO; open the page that holds it.
  const focusOrderId = await resolveFocusOrderId(thread ?? edit);
  const [queue, reminders] = await Promise.all([
    listItemsForPurchasePage({
      page: parsePage(page),
      search: parseQuery(q),
      focusOrderId,
    }),
    listRemindersForDepartment(reminderDeptForTable(TABLE)!),
  ]);

  // Unread discussion messages per SO, for the row badge.
  // Purchase's sign-offs for the SOs on this page, for the EC cards.
  const completions = await listDeptCompletions([
    ...new Set(queue.rows.map((o) => String(o.order_id ?? o.id))),
  ]);

  const unreadThreads = await unreadByOrder(
    [...new Set(queue.rows.map((r) => String(r.order_id)))],
    user
  );

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
            Add bought-out (BOI) items per EC. Orders with BOI = No are
            excluded — Purchase has nothing to do for those. BOI and the
            purchase target date are set by Central Visibility.
          </p>
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      <PurchaseWorkspace
        completions={completions}
        openThreadId={thread}
        focusOrderId={focusOrderId ?? undefined}
        role={user.role}
        unreadThreads={unreadThreads}
        queue={queue}
        canEdit={canEditChild(user.role, "order_boi_items")}
        openItemId={edit}
      />
    </div>
  );
}
