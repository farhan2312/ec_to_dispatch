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
} from "@/lib/roles";
import { listOrdersForSection, listQcDocumentCounts } from "@/lib/orders";
import { SECTION_BY_TABLE } from "@/lib/order-schema";
import { DepartmentWorkspace } from "@/components/risansi/department-workspace";

export const metadata: Metadata = {
  title: "QC | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_qc" as const;

export default async function QcWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessDepartment(user.role, TABLE)) redirect("/risansi/dashboard");

  // QC fills its own submission fields; Required QC Documents / Target Date
  // stay centralOnly (Mitali fills those, read-only to QC — see order-schema.ts).
  const canEdit = canEditSection(user.role, TABLE);
  const canEditCentral = isCentral(user.role);
  const section = SECTION_BY_TABLE.get(TABLE)!;
  const [orders, docCounts, requirementDocCounts] = await Promise.all([
    listOrdersForSection(TABLE),
    listQcDocumentCounts("order_qc_documents"),
    listQcDocumentCounts("order_qc_requirement_documents"),
  ]);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ClipboardCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            QC
          </h1>
          <p className="text-sm text-muted">
            Fill in the actual submission date and remarks; Required QC
            Documents and the target date are set by Central Visibility.
            {" "}Requirement Docs are reference files Central Visibility uploads for QC to work from.
          </p>
        </div>
      </div>

      <DepartmentWorkspace
        table={TABLE}
        fields={section.fields}
        orders={orders}
        canEdit={canEdit}
        canEditCentral={canEditCentral}
        documents={[
          {
            table: "order_qc_documents",
            label: "Attach Docs",
            canEdit: canEditQcDocuments(user.role),
            counts: docCounts,
          },
          {
            table: "order_qc_requirement_documents",
            label: "Requirement Docs",
            canEdit: canEditQcRequirementDocs(user.role),
            counts: requirementDocCounts,
          },
        ]}
      />
    </div>
  );
}
