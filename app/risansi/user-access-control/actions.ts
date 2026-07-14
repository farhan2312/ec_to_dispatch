"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import {
  createUser,
  deleteUser,
  EmailInUseError,
  getUserById,
  setUserStatus,
  updateUserRole,
  type UserStatus,
} from "@/lib/users";
import { ALL_ROLES, roleLabel, type Role } from "@/lib/roles";
import { logAudit } from "@/lib/audit";

const PATH = "/risansi/user-access-control";

export type UserActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

function isPlatformAdmin(email: string | null | undefined): boolean {
  const admin = process.env.ADMIN_EMAIL;
  return !!admin && !!email && email.toLowerCase() === admin.toLowerCase();
}

const VALID_STATUSES: UserStatus[] = [
  "pending",
  "approved",
  "rejected",
  "disabled",
];

export async function setStatusAction(
  id: string,
  status: string
): Promise<UserActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  if (!VALID_STATUSES.includes(status as UserStatus)) {
    return { ok: false, error: "Invalid status." };
  }
  const target = await getUserById(id);
  if (!target) return { ok: false, error: "User not found." };
  if (isPlatformAdmin(target.email) && status !== "approved") {
    return { ok: false, error: "The platform admin cannot be deactivated." };
  }

  await setUserStatus(id, status as UserStatus);
  await logAudit({
    actor: { id: admin.id, email: admin.email, role: admin.role },
    action: `user.${status}`,
    category: "ownership",
    target: target.email,
    details: `Set ${target.email} to ${status}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateRoleAction(
  id: string,
  role: string
): Promise<UserActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  if (!ALL_ROLES.includes(role as Role)) {
    return { ok: false, error: "Invalid role." };
  }
  const target = await getUserById(id);
  if (!target) return { ok: false, error: "User not found." };
  if (isPlatformAdmin(target.email)) {
    return { ok: false, error: "The platform admin's role cannot be changed." };
  }

  await updateUserRole(id, role as Role);
  await logAudit({
    actor: { id: admin.id, email: admin.email, role: admin.role },
    action: "user.role_change",
    category: "ownership",
    target: target.email,
    details: `Changed ${target.email} role to ${roleLabel(role)}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteUserAction(id: string): Promise<UserActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };
  const target = await getUserById(id);
  if (!target) return { ok: false, error: "User not found." };
  if (isPlatformAdmin(target.email)) {
    return { ok: false, error: "The platform admin cannot be deleted." };
  }
  if (target.id === admin.id) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  await deleteUser(id);
  await logAudit({
    actor: { id: admin.id, email: admin.email, role: admin.role },
    action: "user.delete",
    category: "ownership",
    target: target.email,
    details: `Deleted user ${target.email}`,
  });
  revalidatePath(PATH);
  return { ok: true };
}

export type AddUserInput = {
  fullName: string;
  email: string;
  password: string;
  role: string;
};

export async function addUserAction(
  input: AddUserInput
): Promise<UserActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, error: "Not authorized." };

  const fullName = input.fullName?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  if (!fullName) return { ok: false, error: "Full name is required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "Enter a valid email address." };
  if (!input.password || input.password.length < 6)
    return { ok: false, error: "Password must be at least 6 characters." };
  if (!ALL_ROLES.includes(input.role as Role))
    return { ok: false, error: "Select a valid role." };

  try {
    await createUser(
      { fullName, email, password: input.password, role: input.role as Role },
      "approved"
    );
    await logAudit({
      actor: { id: admin.id, email: admin.email, role: admin.role },
      action: "user.create",
      category: "ownership",
      target: email,
      details: `Added user ${email} (${roleLabel(input.role)})`,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    if (error instanceof EmailInUseError) {
      return { ok: false, error: error.message };
    }
    console.error("addUser failed:", error);
    return { ok: false, error: "Could not add the user. Please try again." };
  }
}
