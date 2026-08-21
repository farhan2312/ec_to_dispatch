import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import {
  canAccessDepartment,
  canEditQcDocuments,
  canEditQcRequirementDocs,
  canEditSection,
  isCentral,
  reminderDeptForTable,
} from "@/lib/roles";
import { listItemsForSection, listQcDocumentCounts } from "@/lib/orders";
import { listRemindersForDepartment } from "@/lib/reminders";
import { QC_CONTEXT_FIELDS, SECTION_BY_TABLE } from "@/lib/order-schema";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";
import { RemindersPanel } from "@/components/risansi/reminders-panel";

export const metadata: Metadata = {
  title: "Quality | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_qc" as const;

export default async function QcWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessDepartment(user.role, TABLE)) redirect("/risansi/dashboard");

  const { edit } = await searchParams;
  // QC fills its own submission fields; Required QC Documents / Target Date
  // stay centralOnly (Mitali fills those, read-only to QC — see order-schema.ts).
  const canEdit = canEditSection(user.role, TABLE);
  const canEditCentral = isCentral(user.role);
  const section = SECTION_BY_TABLE.get(TABLE)!;
  const [orders, docCounts, requirementDocCounts, reminders] = await Promise.all([
    listItemsForSection(
      TABLE,
      QC_CONTEXT_FIELDS.map((f) => ({
        column: f.column,
        type: f.type,
        from: "orders" as const,
      }))
    ),
    listQcDocumentCounts("order_qc_documents"),
    listQcDocumentCounts("order_qc_requirement_documents"),
    listRemindersForDepartment(reminderDeptForTable(TABLE)!),
  ]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Quality
          </h1>
          <p className="text-sm text-muted">
            Fill in the actual submission date and remarks; Required Quality
            Documents and the target date are set by Central Visibility.
            {" "}Requirement Docs are reference files Central Visibility uploads for Quality to work from.
          </p>
        </div>
      </div>

      <RemindersPanel reminders={reminders} />

      <DepartmentWorkspace
        table={TABLE}
        fields={section.fields}
        orders={orders}
        readonlyFields={QC_CONTEXT_FIELDS}
        canEdit={canEdit}
        canEditCentral={canEditCentral}
        documents={[
          {
            table: "order_qc_documents",
            label: "Docs attached by QC",
            canEdit: canEditQcDocuments(user.role),
            counts: docCounts,
          },
          {
            table: "order_qc_requirement_documents",
            label: "Required Docs",
            canEdit: canEditQcRequirementDocs(user.role),
            counts: requirementDocCounts,
          },
        ]}
        openOrderId={edit}
      />
    </div>
  );
}
