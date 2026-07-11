import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrderDetail } from "@/lib/orders";
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

  return <OrderDetail detail={detail} orderId={id} role={user.role} />;
}
