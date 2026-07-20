"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "./sidebar";

type ShellUser = { name: string; email: string; role: string };

export function AppShell({
  user,
  alertCount,
  children,
}: {
  user: ShellUser;
  alertCount: number;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        user={user}
        alertCount={alertCount}
        drawerOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-card-border bg-surface px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="-ml-1.5 rounded-lg p-1.5 text-foreground transition-colors hover:bg-background"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-sm font-semibold text-foreground">
            Risansi
          </span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
