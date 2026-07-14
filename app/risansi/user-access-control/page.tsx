import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listAllUsers } from "@/lib/users";
import { UsersAccessView } from "@/components/risansi/users-access-view";

export const metadata: Metadata = {
  title: "Users & Access | Risansi",
};

export const dynamic = "force-dynamic";

export default async function UserAccessControlPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "admin") {
    redirect("/risansi/dashboard");
  }

  const users = await listAllUsers();

  return (
    <UsersAccessView
      users={users}
      currentEmail={currentUser.email}
      platformAdminEmail={process.env.ADMIN_EMAIL ?? ""}
    />
  );
}
