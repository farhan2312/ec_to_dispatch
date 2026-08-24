import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeEscalations, isCentral } from "@/lib/roles";
import { countAlerts } from "@/lib/alerts";
import { countRemindersForRole } from "@/lib/reminders";
import { countUnread, recipientRolesForUser } from "@/lib/notifications";
import { countUnreadMessages } from "@/lib/chat";
import { countOpenBugReports } from "@/lib/bug-reports";
import { AppShell } from "@/components/risansi/app-shell";

export const dynamic = "force-dynamic";

export default async function RisansiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Department roles see a reminder count on their own department nav item;
  // everyone gets an unread-notifications badge on the Notifications nav item.
  // Central/admin's Notifications page also shows live escalations (alertCount).
  const [alertCount, reminderCount, notifUnread, messageUnread, openBugCount] =
    await Promise.all([
      canSeeEscalations(user.role) ? countAlerts() : Promise.resolve(0),
      countRemindersForRole(user.role),
      countUnread(recipientRolesForUser(user.role), user.notifications_seen_at),
      countUnreadMessages(user.id),
      isCentral(user.role) ? countOpenBugReports() : Promise.resolve(0),
    ]);

  return (
    <AppShell
      user={{ name: user.full_name, email: user.email, role: user.role }}
      alertCount={alertCount}
      reminderCount={reminderCount}
      notifUnread={notifUnread}
      messageUnread={messageUnread}
      openBugCount={openBugCount}
    >
      {children}
    </AppShell>
  );
}
