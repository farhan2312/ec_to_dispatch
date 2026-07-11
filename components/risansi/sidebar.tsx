"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/risansi/actions";
import { ThemeToggle } from "./theme-toggle";
import { ChangePasswordModal } from "./change-password-modal";

type NavItem = { label: string; href: string; icon: LucideIcon };

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/risansi/dashboard", icon: LayoutDashboard },
];

const ADMIN_NAV: NavItem[] = [
  {
    label: "User Access Control",
    href: "/risansi/user-access-control",
    icon: ShieldCheck,
  },
];

type SidebarUser = { name: string; email: string; role: string };

export function Sidebar({ user }: { user: SidebarUser }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function NavLink({ item }: { item: NavItem }) {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? "bg-sidebar-active text-white"
            : "text-sidebar-foreground hover:bg-sidebar-hover"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-sidebar">
      {/* brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
          <Gauge className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-white">
            Risansi
          </p>
          <p className="text-[11px] text-sidebar-muted">EC to Dispatch</p>
        </div>
      </div>

      {/* nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <div className="mb-6">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
            EC to Dispatch
          </p>
          <div className="space-y-1">
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>

        {user.role === "admin" && (
          <div className="mb-6">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              Admin
            </p>
            <div className="space-y-1">
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* profile */}
      <div className="relative border-t border-sidebar-border p-3">
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
            <div className="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-xl border border-sidebar-border bg-sidebar p-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setShowChangePassword(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-hover"
              >
                <KeyRound className="h-4 w-4" />
                Change password
              </button>

              <div className="my-1 border-t border-sidebar-border" />
              <ThemeToggle />
              <div className="my-1 border-t border-sidebar-border" />

              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-rose-300 transition-colors hover:bg-sidebar-hover"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-sidebar-hover"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initials || "U"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-white">
              {user.name}
            </span>
            <span className="block truncate text-[11px] text-sidebar-muted">
              {user.email}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted" />
        </button>
      </div>

      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}
    </aside>
  );
}
