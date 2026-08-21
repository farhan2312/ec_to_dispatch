"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PlayCircle } from "lucide-react";
import { ReportBugTrigger } from "./report-bug";
import { Sidebar } from "./sidebar";

// SharePoint-hosted demo walkthrough. Opens in a new tab; noopener/noreferrer
// so we don't hand the target a window.opener reference or leaking Referer.
const DEMO_VIDEO_URL =
  "https://risansi-my.sharepoint.com/:v:/p/asad/IQCoh6QLJt2eR4hAbeI--LEfARNSzknVsWP6-38DnXdpW_s?nav=eyJyZWZlcnJhbEluZm8iOnsicmVmZXJyYWxBcHAiOiJPbmVEcml2ZUZvckJ1c2luZXNzIiwicmVmZXJyYWxBcHBQbGF0Zm9ybSI6IldlYiIsInJlZmVycmFsTW9kZSI6InZpZXciLCJyZWZlcnJhbFZpZXciOiJNeUZpbGVzTGlua0NvcHkifX0&e=PMUkZP";

type ShellUser = { name: string; email: string; role: string };

export function AppShell({
  user,
  alertCount,
  reminderCount,
  notifUnread,
  messageUnread,
  children,
}: {
  user: ShellUser;
  alertCount: number;
  reminderCount: number;
  notifUnread: number;
  messageUnread: number;
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
        reminderCount={reminderCount}
        notifUnread={notifUnread}
        messageUnread={messageUnread}
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
        {/* Top bar — mobile shows drawer toggle + brand; desktop is a slim
            strip that hosts the Report a Bug button on the right. */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-card-border bg-surface px-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="-ml-1.5 rounded-lg p-1.5 text-foreground transition-colors hover:bg-background lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-sm font-semibold text-foreground lg:hidden">
            Risansi
          </span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={DEMO_VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-card-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-background"
            >
              <PlayCircle className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">Demo</span>
            </a>
            <ReportBugTrigger />
          </div>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
