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

const STATUS_LABEL: Record<Status, string> = {
  complete: "Complete",
  in_progress: "In progress",
  blocked: "Blocked",
  pending: "Pending",
};
const STATUS_TEXT: Record<Status, string> = {
  complete: "text-emerald-600",
  in_progress: "text-amber-600",
  blocked: "text-rose-600",
  pending: "text-muted-foreground",
};

function Node({ status, index }: { status: Status; index: number }) {
  if (status === "complete") {
    return (
      <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
        <Check className="h-5 w-5" />
      </div>
    );
  }
  const ring =
    status === "blocked"
      ? "border-rose-500 text-rose-600"
      : status === "in_progress"
        ? "border-amber-500 text-amber-600"
        : "border-gray-300 text-gray-400";
  return (
    <div
      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-surface text-sm font-semibold shadow-sm ${ring}`}
    >
      {status === "blocked" ? "!" : index}
    </div>
  );
}

export function OrderPipeline({ detail }: { detail: OrderDetailData }) {
  const stages = computeStages(detail);
  return (
    <div className="mb-8 rounded-xl border border-card-border bg-surface p-4 shadow-sm sm:p-6">
      <p className="mb-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Department pipeline
      </p>
      <div className="overflow-x-auto">
      <div className="flex min-w-[640px] items-start sm:min-w-0">
        {stages.map((stage, i) => (
          <div
            key={stage.label}
            className="relative flex flex-1 flex-col items-center"
          >
            {i > 0 && (
              <div
                className={`absolute right-1/2 top-5 h-0.5 w-full -translate-y-1/2 ${
                  stages[i - 1].status === "complete"
                    ? "bg-emerald-500"
                    : "bg-gray-200"
                }`}
              />
            )}
            <Node status={stage.status} index={i + 1} />
            <div className="mt-2 px-1 text-center">
              <div className="text-[13px] font-medium leading-tight text-foreground">
                {stage.label}
              </div>
              <div className={`text-xs ${STATUS_TEXT[stage.status]}`}>
                {STATUS_LABEL[stage.status]}
              </div>
            </div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
