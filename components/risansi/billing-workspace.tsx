"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ClipboardList, MessageSquare, Plus } from "lucide-react";
import type { BillingQueueRow } from "@/lib/orders";
import { BILLING_DOC_FIELDS, INVOICE_FIELDS } from "@/lib/order-schema";
import { OrderChildList } from "./order-children";
import { PiExcelUpload } from "./pi-excel-upload";
import { OrderDetailsModal } from "./order-details-modal";
import { InvoiceLrCell } from "./invoice-lr-cell";
import { invoiceRowHeader } from "./order-detail";
import { UrlPagination, UrlSearchInput, useUrlTable } from "./url-table";
import type { PageResult } from "@/lib/pagination";
import { OrderThreadModal } from "./order-thread-modal";

type Row = Record<string, unknown>;

function rowSearchText(o: BillingQueueRow): string {
  return [o.sl_no, o.so_no, o.client_name].filter(Boolean).join(" ");
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const numberFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
function formatValue(v: string | null): string {
  if (!v || v.trim() === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? numberFmt.format(n) : v;
}

export function BillingWorkspace({
  queue,
  canEdit,
  openOrderId,
  openThreadId,
  role,
  unreadThreads = {},
}: {
  // One server-fetched page; search and paging ran in SQL.
  queue: PageResult<BillingQueueRow>;
  canEdit: boolean;
  openOrderId?: string;
  // Deep-link from the discussion icon: open this SO's thread on load.
  openThreadId?: string;
  // The viewer's role — decides which discussion lane they get.
  role: string;
  // Unread discussion messages keyed by order id, for the row badge.
  unreadThreads?: Record<string, number>;
}) {
  const rows = queue.rows;
  const { get: getParam } = useUrlTable();
  // An empty table means one of two very different things — say which, so a
  // search that matched nothing isn't read as an empty queue.
  const emptyMessage = getParam("q")
    ? "No orders match your search."
    : "No orders yet.";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [threadFor, setThreadFor] = useState<{
    orderId: string;
    soLabel: string;
  } | null>(null);

  // Deep link from the discussion icon: open that SO's thread on arrival.
  useEffect(() => {
    if (!openThreadId) return;
    const row = rows.find((r) => String(r.id) === openThreadId);
    if (!row) return;
    setThreadFor({
      orderId: openThreadId,
      soLabel: String(row.so_no ?? row.sl_no ?? ""),
    });
  }, [openThreadId, rows]);

  const [orderDetailsFor, setOrderDetailsFor] = useState<string | null>(null);
  const pageRows = rows;

  useEffect(() => {
    if (!openOrderId) return;
    if (rows.some((r) => r.id === openOrderId)) {
      setExpanded((prev) => new Set(prev).add(openOrderId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrderId]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }


  return (
    <div>
      <div className="mb-3">
        <UrlSearchInput placeholder="Search SO, client…" />
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">Chat</th>
                <th className="px-4 py-3">SO Date</th>
                <th className="px-4 py-3">Order Type</th>
                <th className="px-4 py-3">Client Name</th>
                <th className="px-4 py-3">Bill Type</th>
                <th className="px-4 py-3">Payment Terms</th>
                <th className="px-4 py-3 text-right">Order Value</th>
                <th className="px-4 py-3">Dispatch Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-sm text-muted">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {pageRows.map((row) => {
                const isChallan = row.bill_type === "Challan";
                const isOpen = expanded.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <tr className="text-foreground transition-colors hover:bg-background/60">
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(row.id)}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          aria-expanded={isOpen}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-input-border text-muted-foreground transition-transform hover:bg-background"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums">{row.sl_no}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.so_no ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            setThreadFor({ orderId: String(row.id), soLabel: row.so_no ?? String(row.sl_no) })
                          }
                          className="relative inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Chat
                          {(unreadThreads[String(row.id)] ?? 0) > 0 && (
                            <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                              {unreadThreads[String(row.id)]}
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(row.so_date)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{row.order_type ?? "—"}</td>
                      <td className="px-4 py-3">{row.client_name ?? "—"}</td>
                      <td className="px-4 py-3">{row.bill_type ?? "—"}</td>
                      <td className="px-4 py-3">{row.payment_terms ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatValue(row.order_value)}
                        {row.order_currency ? ` ${row.order_currency}` : ""}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.dispatch_status ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {row.dispatch_status}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setOrderDetailsFor(row.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Order details
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-background/40">
                        <td colSpan={12} className="p-0">
                          <div className="space-y-4 px-4 py-3">
                            {/* Challan orders skip the Operation card — their
                                challan fields live inside each Billing &
                                Dispatch card. Tax Invoice orders keep the
                                PI list. */}
                            {!isChallan && (
                              <OrderChildList
                                orderId={row.id}
                                table="order_billing_docs"
                                title="Operation"
                                fields={BILLING_DOC_FIELDS}
                                rows={(row.pi_docs ?? []) as Row[]}
                                canEdit={canEdit}
                                headerAction={
                                  canEdit ? (
                                    <PiExcelUpload orderId={row.id} />
                                  ) : null
                                }
                              />
                            )}

                            {/* Stage 5 — invoice, dispatch and docket details.
                                Dispatch Status derives from these. For Challan
                                orders the "Invoice" phase collects challan
                                fields instead (bill_type context gates it). */}
                            <OrderChildList
                              orderId={row.id}
                              table="order_invoices"
                              title="Billing & Dispatch"
                              fields={INVOICE_FIELDS}
                              rows={(row.invoices ?? []) as Row[]}
                              canEdit={canEdit}
                              canAdd={false}
                              context={{ bill_type: row.bill_type }}
                              rowHeader={invoiceRowHeader}
                              renderExtra={{
                                label: "LR Attachment",
                                render: (inv) => (
                                  <InvoiceLrCell
                                    row={inv}
                                    orderId={row.id}
                                    canEdit={canEdit}
                                  />
                                ),
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <UrlPagination
          page={queue.page}
          totalPages={queue.totalPages}
          from={queue.from}
          to={queue.to}
          total={queue.total}
        />
      </div>

      {orderDetailsFor && (
        <OrderDetailsModal
          orderId={orderDetailsFor}
          onClose={() => setOrderDetailsFor(null)}
        />
      )}

      {threadFor && (
        <OrderThreadModal
          orderId={threadFor.orderId}
          role={role}
          soLabel={threadFor.soLabel}
          onClose={() => setThreadFor(null)}
        />
      )}
    </div>
  );
}
