// Which dashboard a department gets. One file per department, so a change
// Purchase asks for cannot land on Quality's page — the shared behaviour lives
// in ./parts and ./use-dept-dashboard, and each file below decides only what
// its own department needs on screen.

import type { ComponentType } from "react";
import type { DeptKey } from "@/lib/dept-view";
import type { DeptDashboardProps } from "./use-dept-dashboard";
import { AccountsDashboard } from "./accounts";
import { AssemblyDashboard } from "./assembly";
import { BillingDashboard } from "./billing";
import { DrawingDashboard } from "./drawing";
import { PlanningDashboard } from "./planning";
import { PurchaseDashboard } from "./purchase";
import { QualityDashboard } from "./quality";

export type { DeptDashboardProps };

/**
 * Partial: the `dispatch` key is the SO-level dispatch lane the central
 * pipeline reads. No role owns it — the `dispatch` role is Assembly & Packing,
 * which gets AssemblyDashboard — so there is no page to map it to.
 */
export const DEPT_DASHBOARDS: Partial<
  Record<DeptKey, ComponentType<DeptDashboardProps>>
> = {
  drawing: DrawingDashboard,
  purchase: PurchaseDashboard,
  quality: QualityDashboard,
  planning: PlanningDashboard,
  assembly: AssemblyDashboard,
  billing: BillingDashboard,
  accounts: AccountsDashboard,
};
