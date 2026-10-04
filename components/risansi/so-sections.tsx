"use client";

// The SO-level sections — Order details, Billing & Operations, Accounts and
// Dispatch — as the forms that own them. Shared by the SO page and the order
// overview, so a value is edited the same way wherever it is shown.

import { BILLING_DOC_FIELDS, INVOICE_FIELDS, SO_SECTIONS } from "@/lib/order-schema";
import { paymentTermsExtra } from "./payment-terms-control";
import { lockReason } from "@/lib/order-lock";
import {
  canAccessDepartment,
  canCreateOrders,
  canEditChild,
  isCentral,
} from "@/lib/roles";
import type { OrderDetail as OrderDetailData } from "@/lib/orders";
import { EditableSection } from "./editable-section";
import { OrderChildList } from "./order-children";
import { InvoiceLrCell } from "./invoice-lr-cell";
import { targetDateExtra } from "./target-date-control";
import type { TargetRevision } from "@/lib/target-dates";

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

// Header shown at the top of each Dispatch card: the packing-slip
// context copied from Assembly's actual packing slip. Falls back to a
// placeholder when the invoice has no linked slip (should be rare).
export function invoiceRowHeader(inv: Row): React.ReactNode {
  const ec = str(inv.ec_no);
  const psn = str(inv.packing_slip_no);
  const qty = str(inv.packing_quantity);
  const parts: string[] = [];
  if (ec) parts.push(`EC ${ec}`);
  if (psn) parts.push(`Packing Slip ${psn}`);
  if (qty) parts.push(`Qty ${qty}`);
  return parts.length ? parts.join(" · ") : "Awaiting packing slip";
}

export function SoSections({
  detail,
  orderId,
  role,
  targetRevisions,
  middle,
}: {
  detail: OrderDetailData;
  orderId: string;
  role: string;
  targetRevisions: TargetRevision[];
  /** Rendered between Order details and the other SO sections. */
  middle?: React.ReactNode;
}) {
  const order = detail.order;
  const central = isCentral(role);
  const canManageItems = canCreateOrders(role);

  // SO-scope sections the current role can see (Central sees all; Billing sees
  // Billing & Operations; Accounts sees Accounts). Accounts is skipped
  // entirely for Challan orders — no A/R for those.
  const isChallanOrder = String(order.bill_type ?? "") === "Challan";
  const visibleSections = SO_SECTIONS.filter(
    (s) =>
      canAccessDepartment(role, s.table) &&
      !(s.table === "order_accounts" && isChallanOrder)
  );
  // Split so the EC panel can sit between Order details (core) and the other
  // SO sections (Billing & Operations, Accounts).
  const coreSections = visibleSections.filter((s) => s.table === "orders");
  const otherSections = visibleSections.filter((s) => s.table !== "orders");

  // Render a single SO-scope section — Billing is a compound view (Challan
  // fields or the PI list; the invoice cards are Dispatch's).
  const renderSection = (section: (typeof SO_SECTIONS)[number]) => {
    if (section.table === "order_dispatch") {
      // Dispatch: one invoice-and-despatch card per despatch. The cards are
      // created by Packing saving an actual packing slip, so there is no Add.
      return (
        <OrderChildList
          key={section.key}
          orderId={orderId}
          table="order_invoices"
          title="Invoice and dispatch"
          fields={INVOICE_FIELDS}
          rows={(detail.order_invoices ?? []) as Row[]}
          canEdit={canEditChild(role, "order_invoices")}
          canAdd={false}
          // The parent SO's bill_type decides whether each card shows
          // invoice_* or challan_* fields — pass it as context so per-field
          // dependsOn can gate the correct set.
          context={{ bill_type: order.bill_type }}
          rowHeader={invoiceRowHeader}
          renderExtra={{
            label: "LR Attachment",
            render: (inv) => (
              <InvoiceLrCell
                row={inv}
                orderId={orderId}
                canEdit={canEditChild(role, "order_invoices")}
              />
            ),
          }}
        />
      );
    }
    if (section.table === "order_billing") {
      const isChallan = String(order.bill_type ?? "") === "Challan";
      const piLock = lockReason("order_billing_docs", order, role);
      const billingCanEditChild = canEditChild(role, "order_billing_docs");
      return (
        <div key={section.key} className="space-y-6">
          {/* Challan orders skip the Operation card entirely — their challan
              fields sit inside each Dispatch card. Tax Invoice orders keep the
              PI list here. */}
          {!isChallan &&
            (piLock ? (
              // Nothing to raise, so the list is closed rather than sitting
              // there inviting a PI nobody should file.
              <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
                <h2 className="font-display text-base font-semibold text-foreground">
                  {section.title}
                </h2>
                <p className="mt-1 text-sm text-muted">{piLock}</p>
              </section>
            ) : (
              <OrderChildList
                orderId={orderId}
                table="order_billing_docs"
                title={section.title}
                fields={BILLING_DOC_FIELDS}
                rows={detail.order_billing_docs as Row[]}
                canEdit={billingCanEditChild}
              />
            ))}
        </div>
      );
    }

    const data: Row | null =
      section.table === "orders"
        ? detail.order
        : (detail[section.table as "order_billing" | "order_accounts"] as Row | null);
    // A section this order carries no work for takes no entries: say so
    // instead of offering a form the action would refuse.
    const sectionLock = lockReason(section.table, order, role);
    if (sectionLock) {
      return (
        <section
          key={section.key}
          className="rounded-xl border border-card-border bg-surface p-6 shadow-sm"
        >
          <h2 className="font-display text-base font-semibold text-foreground">
            {section.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{sectionLock}</p>
        </section>
      );
    }
    return (
      <div key={section.key} className="space-y-6">
        <EditableSection
          targetId={orderId}
          section={section}
          data={data ?? null}
          canEdit={canAccessDepartment(role, section.table)}
          canEditCentral={central}
          // Order details carries the client columns — offer the directory
          // search there so a wrong client can be corrected.
          clientLookup={section.table === "orders" && canManageItems}
          // Target dates are never edited by the section form; each one carries
          // its own revise button and change history instead.
          fieldExtra={
            section.table === "orders"
              ? (field) =>
                  // Target dates carry their own control; Payment Terms carries
                  // the list of terms. Everything else, nothing.
                  paymentTermsExtra(
                    orderId,
                    detail.order_payment_terms as Row[],
                    canEditChild(role, "order_payment_terms")
                  )(field) ??
                  targetDateExtra(orderId, targetRevisions, canManageItems)(field)
              : undefined
          }
        />
      </div>
    );
  };

  return (
    <>
      {coreSections.map(renderSection)}
      {middle}
      {otherSections.map(renderSection)}
    </>
  );
}
