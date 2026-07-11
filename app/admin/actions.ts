"use server";

import { revalidatePath } from "next/cache";
import { setUserStatus } from "@/lib/users";

export async function approveRequest(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setUserStatus(id, "approved");
  revalidatePath("/admin");
}

export async function rejectRequest(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setUserStatus(id, "rejected");
  revalidatePath("/admin");
}
