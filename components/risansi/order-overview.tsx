"use client";

// One SO on one page: what it is, where every department stands, and every
// value recorded against each of its ECs. Read-only by design — it is the view
// you land on from the order list and the pipeline, and it links out to the
// forms that own each value rather than repeating them as inputs.

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Pencil,
} from "lucide-react";
import {
  CHILD_FIELDS,
  ITEM_SECTIONS,
  SO_SECTIONS,
  canonicalSelectValue,
  dependsOnSatisfied,
  type ChildTable,
  type OrderField,
  type OrderSection,
} from "@/lib/order-schema";
import { canAccessDepartment, isCentral } from "@/lib/roles";
import { DEPT_LABELS, type DeptCompletion } from "@/lib/dept-completion";
import type { ItemDetail, OrderDetail, SoDeptStatus } from "@/lib/orders";
import {
  AllDoneChip,
  Badge,
  DeptStatusBoard,
  EC_DEPTS,
  ecComplete,
  formatDate,
  orderComplete,
} from "./dept-status-board";

type Row = Record<string, unknown>;

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

const amountFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function money(value: unknown): string {
  const text = str(value).trim();
  if (text === "") return "—";
  const n = Number(text);
  return Number.isFinite(n) ? amountFmt.format(n) : text;
}

/** A field's value as the forms show it, so the page reads the same as they do. */
function fieldValue(field: OrderField, row: Row | null): string {
  const raw = str(row?.[field.column]).trim();
  if (raw === "") return "—";
  if (field.type === "date") return formatDate(raw) ?? raw;
  if (field.type === "select") return canonicalSelectValue(field, raw);
  if (field.type === "number") return money(raw);
  return raw;
}

/** Only the fields that apply to this row — a Challan order has no PI fields. */
function applicableFields(fields: OrderField[], row: Row | null, extra?: Row): OrderField[] {
  const read = (column: string) => str(row?.[column] ?? extra?.[column]);
  return fields.filter((f) => dependsOnSatisfied(f, read));
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-card-border bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function Chip({ value, tone = "slate" }: { value: string; tone?: "slate" | "primary" }) {
  const cls =
    tone === "primary"
      ? "bg-primary/10 text-primary ring-primary/20"
      : "bg-slate-100 text-slate-600 ring-transparent";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}
    >
      {value}
    </span>
  );
}

/** A section's values as a label/value grid — the read-only twin of the form. */
function FieldGrid({
  fields,
  row,
  extra,
}: {
  fields: OrderField[];
  row: Row | null;
  // Values the row itself doesn't carry but its fields gate on (an EC's
  // item_type for Planning's pump-only fields, the SO's bill_type for Billing).
  extra?: Row;
}) {
  const shown = applicableFields(fields, row, extra);
  if (shown.length === 0) {
    return <p className="text-sm text-muted">Nothing recorded.</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((f) => (
        <div key={f.column} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {f.label}
          </dt>
          <dd className="mt-0.5 break-words text-sm text-foreground">{fieldValue(f, row)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A 1:many list (PIs, invoices, revisions, BOI items, packing slips) as a table. */
function ChildTableView({
  table,
  rows,
  context,
}: {
  table: ChildTable;
  rows: Row[];
  context?: Row;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No rows.</p>;
  }
  // A column earns its place only if it applies to at least one row — an
  // all-blank gated column would just be noise.
  const fields = CHILD_FIELDS[table].filter((f) =>
    rows.some((r) => dependsOnSatisfied(f, (c) => str(r[c] ?? context?.[c])))
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-card-border">
      <table className="w-full text-sm">
        <thead className="bg-background">
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2">#</th>
            {fields.map((f) => (
              <th key={f.column} className="px-3 py-2 whitespace-nowrap">
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {rows.map((r, i) => (
            <tr key={str(r.id) || i} className="text-foreground">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
              {fields.map((f) => (
                <td key={f.column} className="px-3 py-2 whitespace-nowrap">
                  {dependsOnSatisfied(f, (c) => str(r[c] ?? context?.[c]))
                    ? fieldValue(f, r)
                    : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What a section's 1:many list is called where it appears under that section. */
function childCaption(table: ChildTable, kind?: string): string {
  switch (table) {
    case "order_drawing_revisions":
      return "Revisions";
    case "order_boi_items":
      return "Bought-out items";
    case "order_packing_slips":
      return kind === "tentative" ? "Tentative packing details" : "Actual packing details";
    case "order_billing_docs":
      return "PIs";
    case "order_invoices":
      return "Invoices";
    case "order_lots":
      return "Lots";
  }
}

function Panel({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export function OrderOverview({
  orderId,
  detail,
  items,
  status,
  completions,
  role,
}: {
  orderId: string;
  detail: OrderDetail;
  // Every EC of this SO with each department's row and child lists.
  items: ItemDetail[];
  status: SoDeptStatus | null;
  completions: DeptCompletion[];
  role: string;
}) {
  const order = detail.order;
  const soLabel = str(order.so_no) || `#${str(order.sl_no) || "—"}`;
  const central = isCentral(role);
  // One EC opens by itself; a longer list stays closed so the page still reads
  // as a summary until you ask for a particular EC.
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(items.length === 1 ? items.map((i) => str(i.item.id)) : [])
  );
  const allOpen = items.length > 0 && items.every((i) => open.has(str(i.item.id)));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Which sections this role may read. Same rule as the forms: a department
  // sees its own section plus whatever it owns; Central and Admin see all.
  const qcNeeded = str(order.qc_required).trim().toLowerCase() !== "no";
  const soSections = SO_SECTIONS.filter((s) => canAccessDepartment(role, s.table));
  const itemSections = ITEM_SECTIONS.filter(
    (s) => canAccessDepartment(role, s.table) && (s.table !== "order_qc" || qcNeeded)
  );

  const seesValue = canAccessDepartment(role, "orders");
  const seesMoney = canAccessDepartment(role, "order_accounts");
  // Paid only on receipt: the two departments that chase money have nothing
  // to record, so say so where their panels would otherwise look unfilled.
  const paidAfterReceipt = str(order.paid_after_receipt).trim().toLowerCase() === "yes";
  const notRequired: Partial<Record<string, string>> = paidAfterReceipt
    ? {
        order_billing: "No PI on this order — it is paid after receipt.",
        order_accounts:
          "Nothing to confirm until the payment arrives — this order is paid after receipt.",
      }
    : {};

  const received = Number(str(detail.order_accounts?.amount_received) || "0");
  const value = Number(str(order.order_value) || "0");
  const balance =
    Number.isFinite(received) && Number.isFinite(value) && str(order.order_value).trim() !== ""
      ? value - received
      : null;

  // A section's rows for one EC: the packing-slip table is shared by Planning
  // (tentative) and Packing (actual), so each section shows only its own kind.
  const childRows = (section: OrderSection, item: ItemDetail): Row[] => {
    const rows = ((item as unknown as Record<string, unknown>)[section.childTable!] ??
      []) as Row[];
    if (section.childTable === "order_packing_slips" && section.childKind) {
      return rows.filter((r) => str(r.kind) === section.childKind);
    }
    return rows;
  };

  const childGateOk = (section: OrderSection): boolean => {
    const gate = section.childGate;
    if (!gate) return true;
    return "present" in gate
      ? str(order[gate.column]).trim() !== ""
      : str(order[gate.column]) === gate.value;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <Link
        href="/risansi/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All orders
      </Link>

      {/* ---------- header ---------- */}
      <div className="rounded-xl border border-card-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Sl. No. {str(order.sl_no) || "—"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
                {soLabel}
              </h1>
              {/* Nothing outstanding anywhere on the order — see orderComplete. */}
              {status && orderComplete(status) && (
                <AllDoneChip label="All departments done" />
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {str(order.client_name) || "—"}
              {str(order.client_code) ? ` · ${str(order.client_code)}` : ""}
              {str(order.reps) ? ` · ${str(order.reps)}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                str(order.order_type),
                str(order.bill_type),
                str(order.market_type),
                str(order.zone),
                str(order.boi) === "Yes" ? "BOI" : "",
                qcNeeded ? "" : "QC not needed",
                str(order.ld) ? `LD ${str(order.ld)}` : "",
              ]
                .filter(Boolean)
                .map((v) => (
                  <Chip key={v} value={v} />
                ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status && seesMoney && (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment
                </span>
                <Badge cell={status.accounts} />
              </>
            )}
            {status && (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Dispatch
                </span>
                <Badge cell={status.dispatch} />
              </>
            )}
            <Link
              href={`/risansi/orders/${orderId}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-background"
            >
              <Pencil className="h-3.5 w-3.5" />
              {central ? "Edit order" : "Order form"}
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {seesValue && <Stat label="Order value" value={money(order.order_value)} />}
          {seesMoney && (
            <>
              <Stat label="Received" value={money(detail.order_accounts?.amount_received)} />
              <Stat label="Balance" value={balance === null ? "—" : money(balance)} />
            </>
          )}
          <Stat label="SO date" value={formatDate(str(order.so_date)) ?? "—"} />
          <Stat
            label="Delivery per SO"
            value={formatDate(str(order.delivery_date_as_per_so)) ?? "—"}
          />
          <Stat
            label="ECs"
            value={`${items.length}${
              str(order.total_quantity) ? ` · qty ${str(order.total_quantity)}` : ""
            }`}
          />
        </div>
      </div>

      {/* ---------- where everyone stands ---------- */}
      <div className="mt-6">
        <Panel title="Department status & completion">
          {status ? (
            <DeptStatusBoard status={status} completions={completions} />
          ) : (
            <p className="text-sm text-muted">Status is unavailable for this order.</p>
          )}
        </Panel>
      </div>

      {/* ---------- the ECs ---------- */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          ECs
          <span className="ml-2 text-sm font-normal text-muted">
            {items.length} on this order
          </span>
        </h2>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() =>
              setOpen(allOpen ? new Set() : new Set(items.map((i) => str(i.item.id))))
            }
            className="inline-flex h-8 items-center rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-card-border bg-surface px-5 py-10 text-center text-sm text-muted shadow-sm">
          No ECs on this order yet.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {items.map((entry) => {
            const item = entry.item;
            const id = str(item.id);
            const isOpen = open.has(id);
            const ecStatus = status?.ecs.find((e) => e.id === id) ?? null;
            const ecDone = ecStatus ? ecComplete(ecStatus) : false;
            return (
              <div
                key={id}
                className={`overflow-hidden rounded-xl border bg-surface shadow-sm ${
                  ecDone ? "border-emerald-500/40" : "border-card-border"
                }`}
              >
                <div
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                    ecDone ? "bg-emerald-500/10" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Collapse this EC" : "Expand this EC"}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input-border text-muted-foreground transition-colors hover:bg-background"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate text-sm font-semibold text-foreground">
                      {str(item.ec_no) || "EC"}
                      {ecDone && <AllDoneChip />}
                      <span className="ml-2 font-normal text-muted">
                        {[
                          str(item.item_type),
                          str(item.pump_type),
                          str(item.model_no),
                          str(item.quantity) ? `Qty ${str(item.quantity)}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                    {ecStatus && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {/* Named, because five bare "Pending" chips say nothing
                            about which department is pending. */}
                        {EC_DEPTS.map((d) => (
                          <Badge
                            key={d.key}
                            cell={{
                              state: ecStatus[d.key].state,
                              label: `${DEPT_LABELS[d.key]} · ${ecStatus[d.key].label}`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/risansi/orders/${orderId}/items/${id}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    EC summary
                  </Link>
                </div>

                {isOpen && (
                  <div className="space-y-5 border-t border-card-border bg-background/40 px-4 py-4">
                    {itemSections.map((section) => {
                      const row =
                        section.table === "order_items"
                          ? item
                          : (((entry as unknown as Record<string, unknown>)[
                              section.table
                            ] ?? null) as Row | null);
                      const rows = section.childTable ? childRows(section, entry) : [];
                      return (
                        <div key={section.key}>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {section.title}
                          </p>
                          {section.fields.length > 0 && (
                            <FieldGrid
                              fields={section.fields}
                              row={row}
                              // Department rows carry no item_type / bill_type
                              // of their own, but their fields gate on them.
                              extra={{
                                item_type: item.item_type,
                                bill_type: order.bill_type,
                                market_type: order.market_type,
                                packing_details_required: order.packing_details_required,
                              }}
                            />
                          )}
                          {section.childTable && (
                            <div className={section.fields.length > 0 ? "mt-3" : ""}>
                              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                                {childCaption(section.childTable, section.childKind)}
                              </p>
                              {childGateOk(section) ? (
                                <ChildTableView
                                  table={section.childTable}
                                  rows={rows}
                                  context={{
                                    bill_type: order.bill_type,
                                    market_type: order.market_type,
                                    packing_details_required:
                                      order.packing_details_required,
                                  }}
                                />
                              ) : (
                                <p className="text-sm text-muted">
                                  {section.childTable === "order_packing_slips"
                                    ? "Packing details are not required on this order."
                                    : "No BOI on this order."}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- order-level detail ---------- */}
      <div className="mt-6 space-y-4">
        {soSections.map((section) => {
          const row =
            section.table === "orders"
              ? order
              : ((detail as unknown as Record<string, unknown>)[section.table] ??
                  null) as Row | null;
          const note = notRequired[section.table];
          return (
            <Panel key={section.key} title={section.title}>
              {note && <p className="mb-3 text-sm text-muted">{note}</p>}
              {section.fields.length > 0 && (
                <FieldGrid fields={section.fields} row={row} extra={order} />
              )}
              {section.childTable && (
                <div className={section.fields.length > 0 ? "mt-4" : ""}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {childCaption(section.childTable, section.childKind)}
                  </p>
                  {childGateOk(section) ? (
                    <ChildTableView
                      table={section.childTable}
                      rows={
                        ((detail as unknown as Record<string, unknown>)[
                          section.childTable
                        ] ?? []) as Row[]
                      }
                      context={order}
                    />
                  ) : (
                    <p className="text-sm text-muted">
                      This order is not a Tax Invoice order, so it carries no PI list.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          );
        })}

        {/* Invoices hang off the SO but belong to no single section's gate. */}
        {canAccessDepartment(role, "order_billing") && (
          <Panel title="Billing & Dispatch invoices">
            <ChildTableView
              table="order_invoices"
              rows={detail.order_invoices}
              context={order}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
