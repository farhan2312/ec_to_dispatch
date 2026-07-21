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
  qc: "QC",
  dispatch: "Assembly & Dispatch",
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
  "dispatch",
  "central_visibility",
  "admin",
];

// The single department role that owns (can edit) each order section table.
// The core `orders` identity and the QC section are owned by Central Visibility
// (Mitali fills QC; the QC role only views it).
const TABLE_OWNER: Record<OrderTable, Role> = {
  orders: "central_visibility",
  order_billing: "operations",
  order_accounts: "accounts",
  order_drawing: "drawing",
  order_purchase: "purchase",
  order_qc: "central_visibility",
  order_planning: "planning",
  order_assembly_dispatch: "dispatch",
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

/**
 * Who can open a department workspace (view). Same as edit access, except the
 * `qc` role can view the QC workspace even though Mitali owns editing.
 */
export function canAccessDepartment(role: string, table: OrderTable): boolean {
  if (canEditSection(role, table)) return true;
  if (table === "order_qc" && role === "qc") return true;
  return false;
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

/** The dispatch-completed / LR register is oversight for Central Visibility + Admin. */
export function canSeeDispatched(role: string): boolean {
  return role === "admin" || role === "central_visibility";
}

/** Who may edit an order's dispatch lots — Assembly & Dispatch (+ oversight). */
export function canEditChild(role: string, _table: "order_lots"): boolean {
  return canEditSection(role, "order_assembly_dispatch");
}

/**
 * QC document attachments — unlike the rest of the QC section (filled by
 * Central Visibility), the QC role itself uploads/deletes these.
 */
export function canEditQcDocuments(role: string): boolean {
  return role === "qc" || isCentral(role);
}

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
