import { Check } from "lucide-react";
import type { OrderDetail as OrderDetailData } from "@/lib/orders";

type Row = Record<string, unknown> | null | undefined;
type Status = "complete" | "in_progress" | "blocked" | "pending";
type Stage = { label: string; status: Status };

function has(row: Row, key: string): boolean {
  const v = row?.[key];
  return v !== null && v !== undefined && String(v).trim() !== "";
}
function anyOf(row: Row, keys: string[]): boolean {
  return keys.some((k) => has(row, k));
}
function lower(row: Row, key: string): string {
  return String(row?.[key] ?? "").trim().toLowerCase();
}

/** Derive a status for each department from the order's data. */
export function computeStages(detail: OrderDetailData): Stage[] {
  const b = detail.order_billing;
  const a = detail.order_accounts;
  const dr = detail.order_drawing;
  const pl = detail.order_planning;
  const pu = detail.order_purchase;
  const qc = detail.order_qc;
  const ad = detail.order_assembly_dispatch;

  // Billing & Operations — complete once the PI is generated.
  const billing: Status = has(b, "pi_no")
    ? "complete"
    : anyOf(b, ["freight_terms", "packing_requirement", "pi_date", "pi_value"])
      ? "in_progress"
      : "pending";

  // Accounts — hold blocks; received/after-receipt completes.
  const ps = lower(a, "payment_status");
  const accounts: Status =
    ps === "outstanding hold"
      ? "blocked"
      : ps === "payment rcvd" || ps === "after receipt"
        ? "complete"
        : ps
          ? "in_progress"
          : "pending";

  // Drawing — complete once approved.
  const drawing: Status =
    lower(dr, "drg_status") === "drg approved" || has(dr, "drg_approval_date")
      ? "complete"
      : anyOf(dr, ["drg_status", "drg_sent_to_client_date"])
        ? "in_progress"
        : "pending";

  // Planning — complete once marked completed.
  const planning: Status =
    lower(pl, "planning_status") === "completed"
      ? "complete"
      : anyOf(pl, [
            "purchase_target_date",
            "pump_readiness_remarks",
            "planning_readiness_date",
            "planning_status",
            "actual_pump_status",
            "assembled_packed_qty",
            "assembly_date",
          ])
        ? "in_progress"
        : "pending";

  // Purchase — pending parts block; BOI receipt completes.
  const purchase: Status =
    lower(pu, "gb_status") === "pending" ||
    lower(pu, "motor_status") === "pending" ||
    has(pu, "pending_parts")
      ? "blocked"
      : has(pu, "boi_receipt_date")
        ? "complete"
        : anyOf(pu, ["boi", "gear_box", "gb_status", "motor", "motor_status"])
          ? "in_progress"
          : "pending";

  // QC — complete once docs submitted.
  const qcStatus: Status = has(qc, "qc_doc_actual_date")
    ? "complete"
    : anyOf(qc, ["required_qc_documents", "qc_doc_target_date"])
      ? "in_progress"
      : "pending";

  // Assembly & Dispatch — complete once fully dispatched / packed.
  const dispatch: Status =
    lower(ad, "dispatch_status") === "fully dispatch" ||
    has(ad, "actual_packing_date") ||
    has(ad, "final_packing_dispatch_date")
      ? "complete"
      : anyOf(ad, [
            "dispatch_documents_required",
            "dispatch_team_target_date",
            "final_packing_dispatch_date",
            "delay_remarks",
            "dispatch_status",
          ])
        ? "in_progress"
        : "pending";

  return [
    { label: "Billing & Operations", status: billing },
    { label: "Accounts", status: accounts },
    { label: "Drawing", status: drawing },
    { label: "Planning", status: planning },
    { label: "Purchase", status: purchase },
    { label: "QC", status: qcStatus },
    { label: "Assembly & Dispatch", status: dispatch },
  ];
}

export function pipelineSummary(detail: OrderDetailData): {
  complete: number;
  total: number;
  status: "Complete" | "Blocked" | "In production";
} {
  const stages = computeStages(detail);
  const complete = stages.filter((s) => s.status === "complete").length;
  const status = stages.some((s) => s.status === "blocked")
    ? "Blocked"
    : complete === stages.length
      ? "Complete"
      : "In production";
  return { complete, total: stages.length, status };
}

// Departments work in parallel, so there's no sequence to draw — each is just
// a circle: filled green when that department's work is complete, blank
// otherwise.
function Node({ complete }: { complete: boolean }) {
  if (complete) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
        <Check className="h-5 w-5" />
      </div>
    );
  }
  return (
    <div className="h-10 w-10 rounded-full border-2 border-gray-300 bg-surface" />
  );
}

export function OrderPipeline({ detail }: { detail: OrderDetailData }) {
  const stages = computeStages(detail);
  return (
    <div className="mb-8 rounded-xl border border-card-border bg-surface p-4 shadow-sm sm:p-6">
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Department progress
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-5">
        {stages.map((stage) => {
          const complete = stage.status === "complete";
          return (
            <div
              key={stage.label}
              className="flex w-24 flex-col items-center text-center"
            >
              <Node complete={complete} />
              <div className="mt-2 text-[13px] font-medium leading-tight text-foreground">
                {stage.label}
              </div>
              {complete && (
                <div className="text-xs text-emerald-600">Complete</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
