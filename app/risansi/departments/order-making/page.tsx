import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canAccessOrderMaking, canCreateOrders } from "@/lib/roles";
import { listOrderListOptions, listOrdersForOrderMaking } from "@/lib/orders";
import { parsePage, parseQuery } from "@/lib/pagination";
import { parseOrderMakingFilter } from "@/lib/order-making-filter";
import { unreadByOrder } from "@/lib/order-messages";
import { OrderMakingWorkspace } from "@/components/risansi/order-making-workspace";

export const metadata: Metadata = {
  title: "Order Making | Risansi",
};

export const dynamic = "force-dynamic";

/**
 * Order Making: where an SO starts. The department creates SOs (form or
 * Excel) with their client and purchase order details and keeps those up to
 * date; Central Visibility is told of each new SO and fills in the rest.
 */
export default async function OrderMakingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessOrderMaking(user.role)) redirect("/risansi/dashboard");

  const params = await searchParams;
  const filter = parseOrderMakingFilter((key) => params[key]);
  const [queue, options] = await Promise.all([
    listOrdersForOrderMaking({
      page: parsePage(params.page),
      search: parseQuery(params.q),
      filter,
    }),
    listOrderListOptions(),
  ]);
  const canCreate = canCreateOrders(user.role);
  // Unread discussion messages per SO, for the chat badge.
  const unreadThreads = await unreadByOrder(queue.rows.map((r) => r.id), user);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <FilePlus2 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Order Making</h1>
          <p className="text-sm text-muted">
            Create SOs with their client and purchase order details — from the client directory or by
            hand. Central Visibility is told of each new SO and fills in the terms, target dates and ECs.
          </p>
        </div>
      </div>

      <OrderMakingWorkspace
        queue={queue}
        filter={filter}
        options={options}
        canEdit={canCreate}
        role={user.role}
        unreadThreads={unreadThreads}
      />
    </div>
  );
}
