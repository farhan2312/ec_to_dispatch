"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { deleteItemAction } from "@/app/risansi/orders/actions";
import { BILLING_DOC_FIELDS, INVOICE_FIELDS, SO_SECTIONS } from "@/lib/order-schema";
import {
  canAccessDepartment,
  canCreateOrders,
  canEditChild,
  isCentral,
} from "@/lib/roles";
import type { OrderDetail as OrderDetailData } from "@/lib/orders";
import { EditableSection } from "./editable-section";
import { AddOnForm } from "./add-on-form";
import { OrderChildList } from "./order-children";
import { InvoiceLrCell } from "./invoice-lr-cell";
import { OrderThread } from "./order-thread";

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

// Header shown at the top of each Billing & Dispatch add-on: the packing-slip
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

function formatDate(value: unknown): string {
  const s = str(value);
  if (s === "") return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function OrderDetail({
  detail,
  orderId,
  role,
}: {
  detail: OrderDetailData;
  orderId: string;
  role: string;
}) {
  const router = useRouter();
  const order = detail.order;
  const central = isCentral(role);
  const canManageItems = canCreateOrders(role);
  const [addOpen, setAddOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const soLabel = str(order.so_no) || `#${str(order.sl_no) || "—"}`;

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

  const items = (detail.items ?? []) as Row[];

  async function removeItem(item: Row) {
    const ec = str(item.ec_no) || "this EC";
    if (!confirm(`Delete ${ec}? This removes the EC and all its department data.`)) {
      return;
    }
    setDeletingId(str(item.id));
    const res = await deleteItemAction(str(item.id));
    setDeletingId(null);
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <Link
        href="/risansi/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to orders
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            SO · {soLabel}
          </span>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            {str(order.client_name) || "Order"}
          </h1>
        </div>
      </div>

      <div className="max-w-6xl space-y-6">
        {/* Per-SO discussion. One lane per department, no cross-department
            visibility — Central picks who they are replying to. */}
        <OrderThread
          orderId={orderId}
          role={role}
          soLabel={soLabel}
          collapsible
          defaultOpen={false}
        />

        {(() => {
          // Render a single SO-scope section — Billing is a compound view
          // (Challan fields or PI list + the Stage-5 invoices list).
          const renderSection = (section: typeof SO_SECTIONS[number]) => {
            if (section.table === "order_billing") {
              const isChallan = String(order.bill_type ?? "") === "Challan";
              const billingCanEditChild = canEditChild(role, "order_billing_docs");
              const invoicesCanEditChild = canEditChild(role, "order_invoices");
              return (
                <div key={section.key} className="space-y-6">
                  {/* Challan orders skip the Operation card entirely — their
                      challan fields sit inside each Billing & Dispatch card.
                      Tax Invoice orders keep the PI list here. */}
                  {!isChallan && (
                    <OrderChildList
                      orderId={orderId}
                      table="order_billing_docs"
                      title={section.title}
                      fields={BILLING_DOC_FIELDS}
                      rows={detail.order_billing_docs as Row[]}
                      canEdit={billingCanEditChild}
                    />
                  )}
                  <OrderChildList
                    orderId={orderId}
                    table="order_invoices"
                    title="Billing & Dispatch"
                    fields={INVOICE_FIELDS}
                    rows={(detail.order_invoices ?? []) as Row[]}
                    canEdit={invoicesCanEditChild}
                    canAdd={false}
                    // The parent SO's bill_type decides whether each invoice
                    // card shows invoice_* or challan_* fields — pass it as
                    // context so per-field dependsOn can gate the correct set.
                    context={{ bill_type: order.bill_type }}
                    rowHeader={invoiceRowHeader}
                    renderExtra={{
                      label: "LR Attachment",
                      render: (inv) => (
                        <InvoiceLrCell
                          row={inv}
                          orderId={orderId}
                          canEdit={invoicesCanEditChild}
                        />
                      ),
                    }}
                  />
                </div>
              );
            }

            const data: Row | null =
              section.table === "orders"
                ? detail.order
                : (detail[section.table as "order_billing" | "order_accounts"] as Row | null);
            return (
              <EditableSection
                key={section.key}
                targetId={orderId}
                section={section}
                data={data ?? null}
                canEdit={canAccessDepartment(role, section.table)}
                canEditCentral={central}
                // Order details carries the client columns — offer the
                // directory search there so a wrong client can be corrected.
                clientLookup={section.table === "orders" && canManageItems}
              />
            );
          };

          return (
            <>
              {coreSections.map(renderSection)}
              {/* EC orders sits between Order details and Billing/Accounts. */}
              <EcOrdersPanel />
              {otherSections.map(renderSection)}
            </>
          );

          function EcOrdersPanel() {
            return (
        <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-display text-base font-semibold text-foreground">
                  EC orders
                </h2>
                {/* Dispatch status is an SO-level value (derived from this SO's
                    invoices), so it's shown once here — not per EC. */}
                {str(order.dispatch_status) && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    Dispatch: {str(order.dispatch_status)}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted">
                {items.length} {items.length === 1 ? "item" : "items"} under this SO.
              </p>
            </div>
            {canManageItems && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                {`${str(order.order_type) || "Pump"} Add-On`}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted">
              No EC items yet.
              {canManageItems
                ? ` Use ${str(order.order_type) || "Pump"} Add-On to add one.`
                : ""}
            </p>
          ) : (
            (() => {
              // Columns follow the SO's order type: a Spare has no Pump Type /
              // Series Version (matching the Spare Add-On form), while a Pump
              // shows both, plus Model.
              const isSpareSo = str(order.order_type).trim().toLowerCase() === "spare";
              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                        <th className="px-3 py-2">EC No.</th>
                        <th className="px-3 py-2">EC Date</th>
                        {!isSpareSo && <th className="px-3 py-2">Pump Type</th>}
                        <th className="px-3 py-2">Model No.</th>
                        <th className="px-3 py-2">Internal Model</th>
                        <th className="px-3 py-2">Version</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {items.map((item) => {
                        const id = str(item.id);
                        return (
                          <tr key={id} className="text-foreground">
                            <td className="px-3 py-2 whitespace-nowrap font-medium">
                              {str(item.ec_no) || "—"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap text-muted">
                              {formatDate(item.ec_date)}
                            </td>
                            {!isSpareSo && (
                              <td className="px-3 py-2">{str(item.pump_type) || "—"}</td>
                            )}
                            <td className="px-3 py-2">{str(item.model_no) || "—"}</td>
                            <td className="px-3 py-2">{str(item.internal_model) || "—"}</td>
                            <td className="px-3 py-2">{str(item.version) || "—"}</td>
                            <td className="px-3 py-2 tabular-nums">{str(item.quantity) || "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/risansi/orders/${orderId}/items/${id}`}
                                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-input-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                                >
                                  Open
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Link>
                                {canManageItems && (
                                  <button
                                    type="button"
                                    onClick={() => removeItem(item)}
                                    disabled={deletingId === id}
                                    aria-label="Delete EC"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                                  >
                                    {deletingId === id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </section>
            );
          }
        })()}

      </div>

      {addOpen && (
        <AddOnForm
          orderId={orderId}
          soLabel={soLabel}
          orderType={str(order.order_type) || null}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
