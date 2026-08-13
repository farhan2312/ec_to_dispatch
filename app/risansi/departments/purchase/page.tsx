import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditChild, canEditSection, reminderDeptForTable } from "@/lib/roles";
import { listItemsForPurchase } from "@/lib/orders";
import { listRemindersForDepartment } from "@/lib/reminders";
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
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit } = await searchParams;
  const [items, reminders] = await Promise.all([
    listItemsForPurchase(),
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
            Add bought-out (BOI) items per EC when the order&apos;s BOI = Yes.
            BOI and the purchase target date are set by Central Visibility /
            Planning.
          </p>
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      <PurchaseWorkspace
        rows={items}
        canEdit={canEditChild(user.role, "order_boi_items")}
        openItemId={edit}
      />
    </div>
  );
}
