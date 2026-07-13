"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import logo from "@/assets/logo.png";
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  ChevronsUpDown,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  PenTool,
  Receipt,
  ShieldCheck,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/risansi/actions";
import {
  canAccessDepartment,
  canSeeDispatched,
  canSeeEscalations,
} from "@/lib/roles";
import type { OrderTable } from "@/lib/order-schema";
import { ThemeToggle } from "./theme-toggle";
import { ChangePasswordModal } from "./change-password-modal";

type NavItem = { label: string; href: string; icon: LucideIcon };
type DeptNavItem = NavItem & { table: OrderTable };

const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/risansi/dashboard", icon: LayoutDashboard },
  { label: "Orders", href: "/risansi/orders", icon: ClipboardList },
];

const DEPARTMENT_NAV: DeptNavItem[] = [
  {
    label: "Billing & Operations",
    href: "/risansi/departments/billing",
    icon: Receipt,
    table: "order_billing",
  },
  {
    label: "Accounts",
    href: "/risansi/departments/accounts",
    icon: Wallet,
    table: "order_accounts",
  },
  {
    label: "Drawing",
    href: "/risansi/departments/drawing",
    icon: PenTool,
    table: "order_drawing",
  },
  {
    label: "Planning",
    href: "/risansi/departments/planning",
    icon: CalendarClock,
    table: "order_planning",
  },
  {
    label: "Purchase",
    href: "/risansi/departments/purchase",
    icon: Package,
    table: "order_purchase",
  },
  {
    label: "QC",
    href: "/risansi/departments/qc",
    icon: ClipboardCheck,
    table: "order_qc",
  },
  {
    label: "Assembly & Dispatch",
    href: "/risansi/departments/assembly-dispatch",
    icon: Truck,
    table: "order_assembly_dispatch",
  },
];

const ADMIN_NAV: NavItem[] = [
  {
    label: "User Access Control",
    href: "/risansi/user-access-control",
    icon: ShieldCheck,
  },
];

type SidebarUser = { name: string; email: string; role: string };

export function Sidebar({
  user,
  alertCount = 0,
}: {
  user: SidebarUser;
  alertCount?: number;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const initials = user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const visibleDepartments = DEPARTMENT_NAV.filter((item) =>
    canAccessDepartment(user.role, item.table)
  );

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
        
          <Image src={logo} alt="Risansi" width={140} height={100} className="bg-white p-1" />
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

        {visibleDepartments.length > 0 && (
          <div className="mb-6">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              Departments
            </p>
            <div className="space-y-1">
              {visibleDepartments.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          </div>
        )}

        {canSeeEscalations(user.role) && (
          <div className="mb-6">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
              Oversight
            </p>
            <div className="space-y-1">
              <Link
                href="/risansi/notifications"
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === "/risansi/notifications"
                    ? "bg-sidebar-active text-white"
                    : "text-sidebar-foreground hover:bg-sidebar-hover"
                }`}
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span className="flex-1">Notifications</span>
                {alertCount > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}
              </Link>
              <NavLink
                item={{
                  label: "Payment Holds",
                  href: "/risansi/escalations",
                  icon: AlertTriangle,
                }}
              />
              {canSeeDispatched(user.role) && (
                <NavLink
                  item={{
                    label: "Dispatched",
                    href: "/risansi/dispatched",
                    icon: Truck,
                  }}
                />
              )}
            </div>
          </div>
        )}

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
