import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  getOrderDeptStatus,
  getOrderDetail,
  listDeptCompletions,
  listItemDetails,
} from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";
import { OrderOverview } from "@/components/risansi/order-overview";

export const metadata: Metadata = {
  title: "Order overview | Risansi",
};

export const dynamic = "force-dynamic";

export default async function OrderOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Four independent reads, so they go together: the SO itself, every EC with
  // each department's row and child lists, the derived status, and the
  // sign-offs. The database is remote, so the round trips are what cost.
  const [detail, items, status, completions] = await Promise.all([
    getOrderDetail(id),
    listItemDetails([id]),
    getOrderDeptStatus(id),
    listDeptCompletions([id]),
  ]);
  if (!detail) notFound();

  return (
    <OrderOverview
      orderId={id}
      detail={detail}
      items={items}
      status={status}
      completions={completions}
      role={user.role}
    />
  );
}
