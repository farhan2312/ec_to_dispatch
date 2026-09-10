// How to read one pipeline row from a department's point of view: the status
// it is in, whether that counts as finished, whether the department is
// involved at all, and the date it is working to.
//
// Every dashboard reads these rather than restating them — the central
// pipeline, the department dashboards, and anything counting "how many are
// pending" — so a rule changes in one place.
//
// Plain module (no server imports): the dashboards are client components.

import type { OrderOverviewRow } from "@/lib/orders";
import {
  DEPT_FILTER_LABELS,
  NOT_APPLICABLE,
  PENDING,
  isPerEcDept,
  type DeptFilterKey,
} from "@/lib/dept-status";

export type DeptKey = DeptFilterKey;

export type DeptView = {
  key: DeptKey;
  label: string;
  /** Whether the row is an EC's work or the whole SO's. */
  perEc: boolean;
  /** The department's own word for where this row stands. */
  status: (row: OrderOverviewRow) => string;
  /** Finished, in the sense the department would recognise. */
  done: (row: OrderOverviewRow) => boolean;
  /** The department has nothing to do on this order. */
  na: (row: OrderOverviewRow) => boolean;
  /** The date it is judged against, if it has one. */
  target: (row: OrderOverviewRow) => string | null;
  /**
   * Whether the department works to a deadline at all. Distinct from target()
   * returning null on a given row: Billing and Accounts have no target date in
   * the schema, so a dashboard should drop the whole notion rather than show a
   * column of dashes.
   */
  hasTarget: boolean;
};

const text = (v: string | null | undefined) => (v ?? "").trim();
const same = (a: string | null | undefined, b: string) =>
  text(a).toLowerCase() === b;

/** A revised dispatch date supersedes the original wherever it is quoted. */
export function dispatchTarget(row: OrderOverviewRow): string | null {
  return row.dispatch_target_revised_date ?? row.dispatch_target_date;
}

const never = () => false;

export const DEPT_VIEWS: Record<DeptKey, DeptView> = {
  drawing: {
    key: "drawing",
    label: DEPT_FILTER_LABELS.drawing,
    perEc: true,
    // The column carries the raw wording ("Drg approved"); the filter and
    // the popup say "Approved". One vocabulary, so say theirs.
    status: (r) =>
      same(r.drg_status, "drg approved")
        ? "Approved"
        : same(r.drg_status, "drg. issued to client")
          ? "Issued to Client"
          : PENDING,
    done: (r) => same(r.drg_status, "drg approved"),
    na: never,
    target: (r) => r.drg_target_date,
    hasTarget: true,
  },
  purchase: {
    key: "purchase",
    label: DEPT_FILTER_LABELS.purchase,
    perEc: true,
    // purchase_done is true when the SO has no BOI at all, so the applies
    // check has to come first or every non-BOI order reads as finished.
    status: (r) =>
      !same(r.boi, "yes")
        ? NOT_APPLICABLE
        : r.purchase_done
          ? "Received"
          : PENDING,
    done: (r) => same(r.boi, "yes") && r.purchase_done,
    na: (r) => !same(r.boi, "yes"),
    target: (r) => r.purchase_target_date,
    hasTarget: true,
  },
  quality: {
    key: "quality",
    label: DEPT_FILTER_LABELS.quality,
    perEc: true,
    status: (r) =>
      same(r.qc_required, "no")
        ? NOT_APPLICABLE
        : r.qc_submitted
          ? "Submitted"
          : PENDING,
    done: (r) => !same(r.qc_required, "no") && r.qc_submitted,
    na: (r) => same(r.qc_required, "no"),
    target: (r) => r.qc_doc_target_date,
    hasTarget: true,
  },
  planning: {
    key: "planning",
    label: DEPT_FILTER_LABELS.planning,
    perEc: true,
    status: (r) => text(r.planning_status) || PENDING,
    // Any status recorded counts as done — the rule getOrderDeptStatus uses,
    // and the one the Departments popup shows. ("Completed" was never one of
    // the values Planning can file, so the old check never matched.)
    done: (r) => !!text(r.planning_status),
    na: never,
    // Planning has no target of its own; it schedules to the dispatch date.
    target: dispatchTarget,
    hasTarget: true,
  },
  assembly: {
    key: "assembly",
    label: DEPT_FILTER_LABELS.assembly,
    perEc: true,
    status: (r) => (r.assembly_done ? "Packed" : PENDING),
    done: (r) => r.assembly_done,
    na: never,
    target: (r) => r.dispatch_team_target_date,
    hasTarget: true,
  },
  billing: {
    key: "billing",
    label: DEPT_FILTER_LABELS.billing,
    perEc: false,
    status: (r) =>
      !r.has_pi
        ? PENDING
        : same(r.bill_type, "challan")
          ? "Challan filed"
          : "PI raised",
    done: (r) => r.has_pi,
    na: never,
    target: () => null,
    hasTarget: false,
  },
  accounts: {
    key: "accounts",
    label: DEPT_FILTER_LABELS.accounts,
    perEc: false,
    // A Challan order carries no receivable, so Accounts never acts on it.
    status: (r) =>
      same(r.bill_type, "challan")
        ? NOT_APPLICABLE
        : text(r.payment_status) || PENDING,
    done: (r) =>
      !same(r.bill_type, "challan") &&
      (same(r.payment_status, "payment rcvd") ||
        same(r.payment_status, "after receipt")),
    na: (r) => same(r.bill_type, "challan"),
    target: () => null,
    hasTarget: false,
  },
  dispatch: {
    key: "dispatch",
    label: DEPT_FILTER_LABELS.dispatch,
    perEc: false,
    status: (r) => text(r.dispatch_status) || PENDING,
    done: (r) => same(r.dispatch_status, "fully dispatch"),
    na: never,
    target: dispatchTarget,
    hasTarget: true,
  },
};

/** The department a role works in, if it works in one. */
const VIEW_BY_ROLE: Record<string, DeptKey> = {
  drawing: "drawing",
  purchase: "purchase",
  qc: "quality",
  planning: "planning",
  dispatch: "assembly",
  operations: "billing",
  accounts: "accounts",
};

export function deptViewForRole(role: string): DeptView | null {
  const key = VIEW_BY_ROLE[role];
  return key ? DEPT_VIEWS[key] : null;
}

export { isPerEcDept };
