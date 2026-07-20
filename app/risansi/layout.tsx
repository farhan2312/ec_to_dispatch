import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { canSeeEscalations } from "@/lib/roles";
import { countAlerts } from "@/lib/alerts";
import { AppShell } from "@/components/risansi/app-shell";

export const dynamic = "force-dynamic";

export default async function RisansiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Only oversight roles see the notifications badge.
  const alertCount = canSeeEscalations(user.role) ? await countAlerts() : 0;

  return (
    <AppShell
      user={{ name: user.full_name, email: user.email, role: user.role }}
      alertCount={alertCount}
    >
      {children}
    </AppShell>
  );
}
