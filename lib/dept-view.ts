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
  /**
   * The department has nothing to record on this order, so its status reads
   * N/A and it is not counted as outstanding.
   */
  na: (row: OrderOverviewRow) => boolean;
  /**
   * The order is none of this department's business at all: off its queue,
   * its dashboard, and its URLs. Stronger than `na` — an order can be N/A
   * and still belong to the department, the way a paid-after-receipt order
   * still gets its despatch recorded by Dispatch.
   */
  hidden: (row: OrderOverviewRow) => boolean;
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

/**
 * Paid only once the client has the material: no PI to raise and no receipt
 * to chase. Read from the order's payment terms — every line counted from
 * receipt — rather than from prose or a second answer to the same question.
 */
const paidAfterReceipt = (r: OrderOverviewRow) =>
  (r as { after_receipt_only?: boolean }).after_receipt_only === true;

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
          : same(r.drg_status, "drg. issued to operations")
            ? "Issued to Operations"
            : PENDING,
    done: (r) => same(r.drg_status, "drg approved"),
    na: never,
    hidden: never,
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
    // Nothing bought out on this order, so Purchase never acts on it.
    na: (r) => !same(r.boi, "yes"),
    hidden: (r) => !same(r.boi, "yes"),
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
    hidden: (r) => same(r.qc_required, "no"),
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
    hidden: never,
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
    hidden: never,
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
    // No PI on a paid-after-receipt order. Billing keeps the order on their
    // screens all the same — the bill type and its terms are theirs.
    na: paidAfterReceipt,
    hidden: never,
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
    // A Challan order carries no receivable; a paid-after-receipt one has
    // nothing to confirm until the money simply arrives.
    na: (r) => same(r.bill_type, "challan") || paidAfterReceipt(r),
    hidden: (r) => same(r.bill_type, "challan"),
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
    hidden: never,
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
  assembly: "assembly",
  dispatch: "dispatch",
  operations: "billing",
  accounts: "accounts",
};

export function deptViewForRole(role: string): DeptView | null {
  const key = VIEW_BY_ROLE[role];
  return key ? DEPT_VIEWS[key] : null;
}

export { isPerEcDept };

/**
 * The same rule as each view's `hidden`, written as SQL over an `orders`
 * alias — so the queues and dashboards drop in the database exactly the orders
 * the department has no business seeing.
 *
 * A department that has nothing to do with an order does not see the order:
 * Purchase only works orders with BOI, Quality only those needing QC docs,
 * Accounts only those carrying a receivable. The rest work every order.
 */
export function deptInvolvementSql(dept: DeptKey, alias = "o"): string {
  switch (dept) {
    case "purchase":
      return `lower(coalesce(${alias}.boi, '')) = 'yes'`;
    case "quality":
      return `lower(coalesce(${alias}.qc_required, '')) <> 'no'`;
    case "accounts":
      return `lower(coalesce(${alias}.bill_type, '')) <> 'challan'`;
    default:
      return "TRUE";
  }
}

/**
 * Whether this role's department has anything to do with this order at all.
 * Roles without a department of their own (Central Visibility, Admin) see
 * every order. Used to keep an order that is none of a department's business
 * off its screens entirely, URL included.
 */
export function roleSeesOrder(
  role: string,
  order: { boi?: unknown; qc_required?: unknown; bill_type?: unknown }
): boolean {
  const view = deptViewForRole(role);
  if (!view) return true;
  return !view.hidden({
    boi: order.boi == null ? null : String(order.boi),
    qc_required: order.qc_required == null ? null : String(order.qc_required),
    bill_type: order.bill_type == null ? null : String(order.bill_type),
  } as OrderOverviewRow);
}
