import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrderDetail, listTargetRevisions } from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";
import { roleSeesOrder } from "@/lib/dept-view";
import { OrderDetail } from "@/components/risansi/order-detail";

export const metadata: Metadata = {
  title: "Order | Risansi",
};

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Target dates keep their full history; the panel shows the current value
  // with every earlier one behind it. Read alongside the order itself — it is
  // only shown once the order has passed the checks below.
  const [detail, targetRevisions] = await Promise.all([
    getOrderDetail(id),
    listTargetRevisions(id),
  ]);
  if (!detail) notFound();
  if (
    !roleSeesOrder(user.role, {
      ...detail.order,
      ec_types: detail.items.map((i) => i.item_type),
    })
  ) {
    notFound();
  }

  return (
    <OrderDetail
      detail={detail}
      orderId={id}
      role={user.role}
      targetRevisions={targetRevisions}
    />
  );
}
