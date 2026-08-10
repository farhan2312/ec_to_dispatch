"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { deleteItemAction } from "@/app/risansi/orders/actions";
import { SO_SECTIONS } from "@/lib/order-schema";
import { canAccessDepartment, canCreateOrders, isCentral } from "@/lib/roles";
import type { OrderDetail as OrderDetailData } from "@/lib/orders";
import { EditableSection } from "./editable-section";
import { AddOnForm } from "./add-on-form";

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
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
  // Billing & Operations; Accounts sees Accounts).
  const visibleSections = SO_SECTIONS.filter((s) =>
    canAccessDepartment(role, s.table)
  );

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
            {str(order.party) || "Order"}
          </h1>
        </div>
      </div>

      <div className="max-w-6xl space-y-6">
        {visibleSections.map((section) => {
          const data =
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
            />
          );
        })}

        {/* EC / pump orders */}
        <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-foreground">
                EC / Pump orders
              </h2>
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
                Add-On
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-sm text-muted">
              No EC items yet.{canManageItems ? " Use Add-On to add a pump or spare." : ""}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">EC No.</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Dispatch Target</th>
                    <th className="px-3 py-2">Dispatch Status</th>
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
                        <td className="px-3 py-2">{str(item.item_type) || "—"}</td>
                        <td className="px-3 py-2">{str(item.model_no) || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{str(item.quantity) || "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted">
                          {formatDate(item.dispatch_target_date)}
                        </td>
                        <td className="px-3 py-2">
                          {str(item.dispatch_status) || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
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
          )}
        </section>
      </div>

      {addOpen && (
        <AddOnForm orderId={orderId} soLabel={soLabel} onClose={() => setAddOpen(false)} />
      )}
    </div>
  );
}
