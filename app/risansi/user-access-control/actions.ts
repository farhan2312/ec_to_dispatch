"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { getUserById, setUserStatus } from "@/lib/users";
import { logAudit } from "@/lib/audit";

const PATH = "/risansi/user-access-control";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    throw new Error("Not authorized.");
  }
  return user;
}

async function processRequest(
  formData: FormData,
  status: "approved" | "rejected"
): Promise<void> {
  const admin = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const target = await getUserById(id);
  await setUserStatus(id, status);
  await logAudit({
    actor: { id: admin.id, email: admin.email, role: admin.role },
    action: status === "approved" ? "access.approve" : "access.reject",
    category: "ownership",
    target: target?.email ?? id,
    details: `${status === "approved" ? "Approved" : "Rejected"} access for ${
      target?.email ?? "user"
    }`,
  });
  revalidatePath(PATH);
}

export async function approveRequest(formData: FormData): Promise<void> {
  await processRequest(formData, "approved");
}

export async function rejectRequest(formData: FormData): Promise<void> {
  await processRequest(formData, "rejected");
}
