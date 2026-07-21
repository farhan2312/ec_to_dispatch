import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeEscalations } from "@/lib/roles";
import { countAlerts } from "@/lib/alerts";
import { countRemindersForRole } from "@/lib/reminders";
import { AppShell } from "@/components/risansi/app-shell";

export const dynamic = "force-dynamic";

export default async function RisansiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Only oversight roles see the notifications badge; department roles see a
  // reminder count on their own department nav item.
  const [alertCount, reminderCount] = await Promise.all([
    canSeeEscalations(user.role) ? countAlerts() : Promise.resolve(0),
    countRemindersForRole(user.role),
  ]);

  return (
    <AppShell
      user={{ name: user.full_name, email: user.email, role: user.role }}
      alertCount={alertCount}
      reminderCount={reminderCount}
    >
      {children}
    </AppShell>
  );
}
