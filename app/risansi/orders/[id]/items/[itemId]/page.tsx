import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getItemDetail } from "@/lib/orders";
import { getCurrentUser } from "@/lib/session";
import { ItemDetail } from "@/components/risansi/item-detail";

export const metadata: Metadata = {
  title: "EC | Risansi",
};

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const detail = await getItemDetail(itemId);
  if (!detail || String(detail.order.id) !== id) notFound();

  return <ItemDetail detail={detail} orderId={id} itemId={itemId} role={user.role} />;
}
