import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { Sidebar } from "@/components/risansi/sidebar";

export const dynamic = "force-dynamic";

export default async function RisansiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        user={{
          name: user.full_name,
          email: user.email,
          role: user.role,
        }}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
