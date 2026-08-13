"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CHILD_FIELDS, ITEM_SECTIONS, LOT_FIELDS } from "@/lib/order-schema";
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

  const canSeeLots = canEditChild(role, "order_lots");

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
          {item.model_no ? ` — ${str(item.model_no)}` : ""}
        </h1>
        <span className="text-sm text-muted">SO {soLabel}</span>
      </div>

      <div className="max-w-6xl space-y-6">
        {visibleSections.map((section) => {
          // A section backed by a child list (Purchase → BOI items) renders the
          // list, gated by its childGate against the SO (e.g. boi = Yes).
          if (section.childTable) {
            const gateOk =
              !section.childGate ||
              str(order[section.childGate.column]) === section.childGate.value;
            if (!gateOk) {
              return (
                <section
                  key={section.key}
                  className="rounded-xl border border-card-border bg-surface p-6 shadow-sm"
                >
                  <h2 className="font-display text-base font-semibold text-foreground">
                    {section.title}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    No BOI for this order (BOI = No).
                  </p>
                </section>
              );
            }
            return (
              <OrderChildList
                key={section.key}
                orderId={itemId}
                table={section.childTable}
                title={`${section.title} — BOI Items`}
                fields={CHILD_FIELDS[section.childTable]}
                rows={detail[section.childTable] as Row[]}
                canEdit={canEditChild(role, section.childTable)}
              />
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

        {canSeeLots && (
          <OrderChildList
            orderId={itemId}
            table="order_lots"
            title="Dispatch Lots"
            fields={LOT_FIELDS}
            rows={detail.order_lots}
            canEdit={canEditChild(role, "order_lots")}
          />
        )}
      </div>
    </div>
  );
}
