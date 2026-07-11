"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { createOrder, type NewOrderInput } from "@/lib/orders";

export type CreateOrderResult =
  | { ok: true; slNo: number }
  | { ok: false; error: string };

export async function createOrderAction(
  input: NewOrderInput
): Promise<CreateOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  // Require at least one identifier so we don't create blank rows.
  if (!(input.so_no ?? "").trim() && !(input.ec_no ?? "").trim()) {
    return { ok: false, error: "Enter at least an SO No. or EC No." };
  }

  try {
    const { sl_no } = await createOrder(input);
    revalidatePath("/risansi/orders");
    return { ok: true, slNo: sl_no };
  } catch (error) {
    console.error("createOrder failed:", error);
    return { ok: false, error: "Could not create the order. Please try again." };
  }
}
