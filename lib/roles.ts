// Roles and per-department edit permissions. Plain module (no server imports)
// so both client components and server actions can use it.

import type { OrderTable } from "@/lib/order-schema";

export const ROLE_LABELS = {
  admin: "Admin",
  central_visibility: "Central Visibility",
  operations: "Billing & Operations",
  accounts: "Accounts",
  drawing: "Drawing",
  planning: "Planning",
  purchase: "Purchase",
  qc: "Quality",
  assembly: "Assembly & Packing",
  // Dispatch is its own department, after Assembly & Packing: it invoices what
  // has been packed and records the despatch. The role named `dispatch` used to
  // be the packing team — see the guarded rename in db/schema.sql.
  dispatch: "Dispatch",
} as const;

export type Role = keyof typeof ROLE_LABELS;

export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

// Roles selectable when requesting access. `central_visibility` grants
// cross-department access; `admin` also manages users.
export const REQUESTABLE_ROLES: Role[] = [
  "operations",
  "accounts",
  "drawing",
  "planning",
  "purchase",
  "qc",
  "assembly",
  "dispatch",
  "central_visibility",
  "admin",
];

// The single department role that owns (can edit) each order section table.
// The core `orders` identity is owned by Central Visibility. QC is owned by
// the `qc` role, but its Required QC Documents / Target Date fields are
// marked `centralOnly` in order-schema.ts (Mitali fills those; QC only fills
// Actual Date of Doc. Submission and Remarks).
const TABLE_OWNER: Record<OrderTable, Role> = {
  orders: "central_visibility",
  order_items: "central_visibility",
  order_billing: "operations",
  order_accounts: "accounts",
  order_drawing: "drawing",
  order_purchase: "purchase",
  order_qc: "qc",
  order_planning: "planning",
  order_assembly_dispatch: "assembly",
  // Dispatch owns its own SO-level row; the invoice cards hang off it.
  order_dispatch: "dispatch",
};

/** Admin and Central Visibility (Mitali). Own `centralOnly` fields. */
export function isCentral(role: string): boolean {
  return role === "admin" || role === "central_visibility";
}

/** Admin and Central Visibility can edit any section; others only their own. */
export function canEditSection(role: string, table: OrderTable): boolean {
  if (isCentral(role)) return true;
  return TABLE_OWNER[table] === role;
}

/** Who can open a department workspace (view). Same as edit access. */
export function canAccessDepartment(role: string, table: OrderTable): boolean {
  return canEditSection(role, table);
}

/** Only Admin and Central Visibility may create orders (form or Excel import). */
export function canCreateOrders(role: string): boolean {
  return role === "admin" || role === "central_visibility";
}

/** Payment holds escalate to Central Visibility (and Admin). */
export function canSeeEscalations(role: string): boolean {
  return role === "admin" || role === "central_visibility";
}

/** The central full-visibility dashboard is for Central Visibility and Admin. */
export function canSeeCentralDashboard(role: string): boolean {
  return role === "admin" || role === "central_visibility";
}

/**
 * The dispatch-completed / LR register: oversight for Central Visibility and
 * Admin, and Dispatch's own record of what it has sent out.
 */
export function canSeeDispatched(role: string): boolean {
  return role === "admin" || role === "central_visibility" || role === "dispatch";
}

/**
 * Who may edit each 1:many list. PIs (`order_billing_docs`) are Billing-only
 * now — Accounts views them read-only.
 */
export function canEditChild(
  role: string,
  table:
    | "order_payment_terms"
    | "order_lots"
    | "order_boi_items"
    | "order_billing_docs"
    | "order_packing_slips"
    | "order_invoices"
    | "order_drawing_revisions"
): boolean {
  // Drawing owns the revision rows; Central Visibility also edits them so it
  // can record approval (the two approval fields are `centralOnly`).
  if (table === "order_drawing_revisions") {
    return canEditSection(role, "order_drawing") || isCentral(role);
  }
  if (table === "order_boi_items") return canEditSection(role, "order_purchase");
  // The order's payment terms are part of its identity: Central Visibility's.
  if (table === "order_payment_terms") return canEditSection(role, "orders");
  // PIs are Billing's; the invoice-and-despatch cards are Dispatch's.
  if (table === "order_billing_docs") return canEditSection(role, "order_billing");
  if (table === "order_invoices") return canEditSection(role, "order_dispatch");
  // Packing slips are shared: Planning files the tentative set, Packing the
  // actual one. Either owner may edit; which rows they see is scoped by kind.
  if (table === "order_packing_slips") {
    return (
      canEditSection(role, "order_planning") ||
      canEditSection(role, "order_assembly_dispatch")
    );
  }
  return canEditSection(role, "order_assembly_dispatch");
}

/**
 * QC document attachments — unlike the rest of the QC section (filled by
 * Central Visibility), the QC role itself uploads/deletes these.
 */
export function canEditQcDocuments(role: string): boolean {
  return role === "qc" || isCentral(role);
}

/**
 * QC requirement documents — the reverse direction: Central Visibility
 * uploads reference/requirement files for QC to work from. Only Central may
 * upload/delete; QC (+ Central) may view/download via canAccessDepartment.
 */
export function canEditQcRequirementDocs(role: string): boolean {
  return isCentral(role);
}

// Departments that work to a target date and therefore get deadline reminders
// (7 days / 72h / 24h out). Billing and Accounts have no such date. Planning
// has no target date of its own, so it borrows the order's Dispatch Target
// Date — pump/order readiness (planning_readiness_date) must be in before
// dispatch — which is also the date Dispatch itself works to, while
// Assembly & Packing works to the packing team's own target.
export type ReminderDept =
  | "drawing"
  | "purchase"
  | "qc"
  | "planning"
  | "assembly"
  | "dispatch";

const REMINDER_DEPT_BY_ROLE: Partial<Record<Role, ReminderDept>> = {
  drawing: "drawing",
  purchase: "purchase",
  qc: "qc",
  planning: "planning",
  assembly: "assembly",
  dispatch: "dispatch",
};

const REMINDER_DEPT_BY_TABLE: Partial<Record<OrderTable, ReminderDept>> = {
  order_drawing: "drawing",
  order_purchase: "purchase",
  order_qc: "qc",
  order_planning: "planning",
  order_assembly_dispatch: "assembly",
  order_dispatch: "dispatch",
};

/** The reminder department a role is responsible for, if any. */
export function reminderDeptForRole(role: string): ReminderDept | null {
  return REMINDER_DEPT_BY_ROLE[role as Role] ?? null;
}

/** The reminder department a section table belongs to, if any. */
export function reminderDeptForTable(table: OrderTable): ReminderDept | null {
  return REMINDER_DEPT_BY_TABLE[table] ?? null;
}

// Each department role's workspace page (mirrors the sidebar's DEPARTMENT_NAV).
const DEPARTMENT_HREF: Partial<Record<Role, string>> = {
  operations: "/risansi/departments/billing",
  accounts: "/risansi/departments/accounts",
  drawing: "/risansi/departments/drawing",
  planning: "/risansi/departments/planning",
  purchase: "/risansi/departments/purchase",
  qc: "/risansi/departments/qc",
  assembly: "/risansi/departments/assembly-dispatch",
  dispatch: "/risansi/departments/dispatch",
};

/** The department workspace page a role owns, if any (null for central/admin). */
export function departmentHrefForRole(role: string): string | null {
  return DEPARTMENT_HREF[role as Role] ?? null;
}

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
