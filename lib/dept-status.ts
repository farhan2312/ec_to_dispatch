// The department-status filter on the orders list. Plain module (no server
// imports) so the client filter controls and the SQL that backs them agree on
// one list of departments and states.
//
// The states are the department's real vocabulary — Drawing is "Approved" or
// "Issued to Client", Accounts carries the actual payment status — not a
// flattened done/pending. They mirror getOrderDeptStatus, the same rules the
// "Departments" popup shows, so filtering to "Drawing / Approved" lists exactly
// the SOs whose popup says Approved.

import {
  DISPATCH_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  PLANNING_STATUS_VALUES,
} from "@/lib/order-schema";

export const DEPT_FILTER_KEYS = [
  "drawing",
  "purchase",
  "quality",
  "planning",
  "assembly",
  "billing",
  "accounts",
  "dispatch",
] as const;

export type DeptFilterKey = (typeof DEPT_FILTER_KEYS)[number];

export const DEPT_FILTER_LABELS: Record<DeptFilterKey, string> = {
  drawing: "Drawing",
  purchase: "Purchase",
  quality: "Quality",
  planning: "Planning",
  assembly: "Assembly & Packing",
  billing: "Billing & Operations",
  accounts: "Accounts",
  dispatch: "Dispatch",
};

/** Nothing recorded yet. Every department offers it. */
export const PENDING = "Pending";
/** The department has nothing to do on this order at all. */
export const NOT_APPLICABLE = "N/A";

const values = (list: { value: string }[]) => list.map((o) => o.value);

const DEPT_STATUSES: Record<DeptFilterKey, string[]> = {
  // The furthest hand-off wins: a drawing that came back approved reads as
  // Approved even though it was issued to Operations and the client first.
  drawing: ["Approved", "Issued to Client", "Issued to Operations", PENDING],
  // Bought out and every line receipted.
  purchase: ["Received", PENDING, NOT_APPLICABLE],
  quality: ["Submitted", PENDING, NOT_APPLICABLE],
  // Whichever of pump/spare/free-text status the EC carries.
  planning: [...PLANNING_STATUS_VALUES, PENDING],
  assembly: ["Packed", PENDING],
  // Which one depends on the SO's Bill Type — a Challan order never gets a PI.
  billing: ["PI raised", "Challan filed", PENDING],
  accounts: [...values(PAYMENT_STATUS_OPTIONS), PENDING, NOT_APPLICABLE],
  // "Pending" is itself a stored dispatch status, so it covers both a blank
  // column and an explicit Pending rather than appearing twice.
  dispatch: values(DISPATCH_STATUS_OPTIONS).filter((v) => v !== PENDING).concat(PENDING),
};

export function statusesFor(dept: DeptFilterKey): string[] {
  return DEPT_STATUSES[dept];
}

/** Drawing…Assembly are tracked per EC; the rest sit on the SO. */
export function isPerEcDept(dept: DeptFilterKey): boolean {
  return dept !== "billing" && dept !== "accounts" && dept !== "dispatch";
}
