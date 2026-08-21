"use client";

import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { CHILD_FIELDS, ITEM_SECTIONS } from "@/lib/order-schema";
import {
  canAccessDepartment,
  canEditChild,
  canEditQcDocuments,
  canEditQcRequirementDocs,
  canEditSection,
  isCentral,
} from "@/lib/roles";
import type { ItemDetail as ItemDetailData } from "@/lib/orders";
import { EditableSection, type DocumentsConfig } from "./editable-section";
import { OrderChildList } from "./order-children";

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function ItemDetail({
  detail,
  orderId,
  itemId,
  role,
}: {
  detail: ItemDetailData;
  orderId: string;
  itemId: string;
  role: string;
}) {
  const order = detail.order;
  const item = detail.item;
  const central = isCentral(role);
  const soLabel = str(order.so_no) || `#${str(order.sl_no) || "—"}`;
  const ecLabel = str(item.ec_no) || "EC";

  // Item + department sections the role can see (QC section hidden when the SO
  // is flagged QC Needed = No).
  const qcNeeded = str(order.qc_required).trim().toLowerCase() !== "no";
  const visibleSections = ITEM_SECTIONS.filter(
    (s) =>
      canAccessDepartment(role, s.table) && (s.table !== "order_qc" || qcNeeded)
  );

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <Link
        href={`/risansi/orders/${orderId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to SO {soLabel}
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
          EC · {ecLabel}
        </span>
        <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
          {str(item.item_type) || "Item"}
          {str(item.pump_type) ? ` · ${str(item.pump_type)}` : ""}
          {str(item.model_no) ? ` — ${str(item.model_no)}` : ""}
        </h1>
        <span className="text-sm text-muted">SO {soLabel}</span>
        {str(item.order_copy_file_name) && (
          <a
            href={`/api/orders/items/${itemId}/order-copy`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            download
          >
            <FileText className="h-3.5 w-3.5" />
            Order Copy: {str(item.order_copy_file_name)}
          </a>
        )}
      </div>

      <div className="max-w-6xl space-y-6">
        {visibleSections.map((section) => {
          // A section may carry a 1:many child list (Purchase → BOI items,
          // Planning/Packing → packing slips), gated by childGate against the
          // SO (e.g. boi = Yes, packing_details_required = Yes).
          if (section.childTable) {
            const child = section.childTable;
            const gate = section.childGate;
            const gateOk = !gate
              ? true
              : "present" in gate
                ? str(order[gate.column]).trim() !== ""
                : str(order[gate.column]) === gate.value;

            // Packing slips are shared by Planning (tentative) and Packing
            // (actual) — show only this section's rows.
            // order_invoices is per-SO, so it never appears on an EC detail —
            // the cast narrows to the per-EC child lists this page carries.
            let rows = ((detail as Record<string, unknown>)[child] ?? []) as Row[];
            if (child === "order_packing_slips") {
              rows = rows.filter(
                (r) => !section.childKind || str(r.kind) === section.childKind
              );
            }
            // The detail packing columns gate on Packing Details Required;
            // the section-level gate above uses Market Type.
            const childContext =
              child === "order_packing_slips"
                ? {
                    nature_of_supply: order.nature_of_supply,
                    packing_details_required: order.packing_details_required,
                  }
                : undefined;

            const childTitle =
              child === "order_packing_slips"
                ? `${section.title} — ${
                    section.childKind === "tentative"
                      ? "Tentative packing Details"
                      : "Actual packing Details"
                  }`
                : `${section.title} — BOI Items`;

            return (
              <div key={section.key} className="space-y-6">
                {section.fields.length > 0 && (
                  <EditableSection
                    targetId={itemId}
                    section={section}
                    data={(detail[
                      section.table as
                        | "order_purchase"
                        | "order_planning"
                        | "order_assembly_dispatch"
                    ] as Row | null) ?? null}
                    canEdit={canEditSection(role, section.table)}
                    canEditCentral={central}
                  />
                )}
                {gateOk ? (
                  <OrderChildList
                    orderId={itemId}
                    table={child}
                    title={childTitle}
                    fields={CHILD_FIELDS[child]}
                    rows={rows}
                    canEdit={canEditChild(role, child)}
                    kind={section.childKind}
                    context={childContext}
                  />
                ) : (
                  <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
                    <h2 className="font-display text-base font-semibold text-foreground">
                      {childTitle}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      {child === "order_packing_slips"
                        ? "Set Market Type on this order to record packing slips."
                        : "No BOI for this order (BOI = No)."}
                    </p>
                  </section>
                )}
              </div>
            );
          }

          const data =
            section.table === "order_items"
              ? detail.item
              : (detail[
                  section.table as
                    | "order_drawing"
                    | "order_qc"
                    | "order_planning"
                    | "order_assembly_dispatch"
                ] as Row | null);

          const documents: DocumentsConfig[] | undefined =
            section.table === "order_qc"
              ? [
                  {
                    table: "order_qc_documents",
                    label: "Attach Docs",
                    canEdit: canEditQcDocuments(role),
                  },
                  {
                    table: "order_qc_requirement_documents",
                    label: "Requirement Docs",
                    canEdit: canEditQcRequirementDocs(role),
                  },
                ]
              : undefined;

          return (
            <EditableSection
              key={section.key}
              targetId={itemId}
              section={section}
              data={data ?? null}
              canEdit={canEditSection(role, section.table)}
              canEditCentral={central}
              documents={documents}
            />
          );
        })}
      </div>
    </div>
  );
}
