"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { setUserStatus } from "@/lib/users";

const PATH = "/risansi/user-access-control";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("Not authorized.");
  }
}

export async function approveRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setUserStatus(id, "approved");
  revalidatePath(PATH);
}

export async function rejectRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await setUserStatus(id, "rejected");
  revalidatePath(PATH);
}
