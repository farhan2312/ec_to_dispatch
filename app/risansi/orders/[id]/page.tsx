import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrderDetail, listTargetRevisions } from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";
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

  const detail = await getOrderDetail(id);
  if (!detail) notFound();

  // Target dates keep their full history; the panel shows the current value
  // with every earlier one behind it.
  const targetRevisions = await listTargetRevisions(id);

  return (
    <OrderDetail
      detail={detail}
      orderId={id}
      role={user.role}
      targetRevisions={targetRevisions}
    />
  );
}
