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

// Roles a new user can request at signup. `admin` is seeded only, never
// requested. `central_visibility` grants cross-department access.
export const REQUESTABLE_ROLES: Role[] = [
  "operations",
  "accounts",
  "drawing",
  "planning",
  "purchase",
  "qc",
  "dispatch",
  "central_visibility",
];

// The single department role that owns (can edit) each order section table.
// The core `orders` identity is owned by Central Visibility.
const TABLE_OWNER: Record<OrderTable, Role> = {
  orders: "central_visibility",
  order_billing: "operations",
  order_accounts: "accounts",
  order_drawing: "drawing",
  order_purchase: "purchase",
  order_qc: "qc",
  order_planning: "planning",
  order_assembly_dispatch: "dispatch",
};

/** Admin and Central Visibility can edit any section; others only their own. */
export function canEditSection(role: string, table: OrderTable): boolean {
  if (role === "admin" || role === "central_visibility") return true;
  return TABLE_OWNER[table] === role;
}

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}
