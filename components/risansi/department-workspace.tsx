"use client";

import { Fragment, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ClipboardList,
  Loader2,
  Paperclip,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { updateOrderSectionAction } from "@/app/risansi/orders/actions";
import {
  CHILD_FIELDS,
  SECTION_BY_TABLE,
  canonicalSelectValue,
  dependsOnSatisfied,
  selectOptionsFor,
  type OrderField,
  type OrderTable,
} from "@/lib/order-schema";
import { OrderChildList } from "./order-children";
import { Pagination, SearchInput, useTableSearch } from "./table-tools";
import { QcDocumentsModal } from "./qc-documents-modal";
import { OrderDetailsModal } from "./order-details-modal";
import { ViewPisModal } from "./view-pis-modal";
import type { QcDocTable } from "@/lib/orders";

// Only the QC workspace passes this today; kept generic (a list, so more than
// one document set can be attached) in case another department needs file
// attachments later.
type DocumentsConfig = {
  table: QcDocTable;
  label: string;
  canEdit: boolean;
  counts: Record<string, number>;
};

type Row = Record<string, unknown>;

function toInput(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function formatValue(field: OrderField, value: unknown): string {
  const s = toInput(value);
  if (s === "") return "—";
  if (field.type === "date") {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  if (field.type === "select") return canonicalSelectValue(field, s);
  return s;
}

function rowSearchText(o: Row): string {
  return [o.sl_no, o.so_no, o.ec_no, o.party, o.item_type]
    .map((v) => (v == null ? "" : String(v)))
    .join(" ");
}

// A dependsOn'd field (e.g. a billing document field gated on the order's
// bill_type) only applies to a row whose data satisfies the condition.
function fieldApplies(field: OrderField, row: Row): boolean {
  return dependsOnSatisfied(field, (col) => toInput(row[col]));
}

export function DepartmentWorkspace({
  table,
  fields,
  orders,
  readonlyFields = [],
  canEdit = true,
  canEditCentral = true,
  documents = [],
  openOrderId,
}: {
  table: OrderTable;
  fields: OrderField[];
  orders: Row[];
  readonlyFields?: OrderField[];
  canEdit?: boolean;
  // Whether the current user may edit `centralOnly` fields (Central Visibility).
  canEditCentral?: boolean;
  // QC document attachments — omitted everywhere except the QC workspace.
  documents?: DocumentsConfig[];
  // Deep-link from a notification: open this order's edit modal on load.
  openOrderId?: string;
}) {
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [docsPanel, setDocsPanel] = useState<{ row: Row; config: DocumentsConfig } | null>(
    null
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(orders, rowSearchText);

  useEffect(() => {
    if (!openOrderId || !canEdit) return;
    const row = orders.find((o) => String(o.id) === openOrderId);
    if (row) {
      setEditRow(row);
      // Also expand that row's SO so the queue reveals it when the user closes
      // the edit modal.
      const soKey = String(row.so_no ?? row.sl_no ?? "");
      if (soKey) setExpanded((prev) => new Set(prev).add(soKey));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openOrderId]);

  function toggleSo(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">No orders yet</p>
        <p className="mt-1 text-sm text-muted">
          Orders created by Central Visibility will appear here for your input.
        </p>
      </div>
    );
  }

  // Party is customer-identifying info; only Billing & Operations and
  // Accounts need it for their day-to-day work.
  const showParty = table === "order_billing" || table === "order_accounts";

  // SO-scope sections (Billing/Accounts) have no per-EC breakdown, so EC No.
  // would always be blank — hide the column entirely.
  const scope = SECTION_BY_TABLE.get(table)?.scope;
  const showEcNo = scope !== "so";
  // Item-scope departments (Drawing/Purchase/QC/Planning/Dispatch) group by SO
  // with a chevron toggle to reveal each SO's ECs. SO-scope pages stay flat.
  const groupBySo = scope === "item";

  // Cascade: only show a conditional field's column when at least one order in
  // the queue actually matches its condition (e.g. Tax columns appear only if
  // some SO's bill_type is Tax).
  const visibleFields = fields.filter(
    (f) => !f.dependsOn || orders.some((o) => fieldApplies(f, o))
  );

  // Item-scope layout: one row per SO (with the SO's readonly context) + a
  // nested EC subtable for that SO's department fields.
  type SoGroup = { key: string; head: Row; ecs: Row[] };
  const soGroups: SoGroup[] = groupBySo
    ? Array.from(
        pageRows.reduce((map, r) => {
          const key = String(r.so_no ?? r.sl_no ?? "");
          const g = map.get(key);
          if (g) g.ecs.push(r);
          else map.set(key, { key, head: r, ecs: [r] });
          return map;
        }, new Map<string, SoGroup>())
      ).map(([, g]) => g)
    : [];

  // Per-EC child list carried by this section (packing slips), plus its gate
  // against the SO and the label/kind it files rows under.
  const section = SECTION_BY_TABLE.get(table);
  const childTable = section?.childTable;
  const childKind = section?.childKind;
  const childTitle =
    childKind === "tentative" ? "Tentative packing Details" : "Actual packing Details";
  // The gate is a property of each SO (e.g. its Market Type), so it's
  // evaluated against that SO's own row, not the queue as a whole.
  function childGateOkFor(head: Row): boolean {
    const gate = section?.childGate;
    if (!gate) return true;
    return "present" in gate
      ? toInput(head[gate.column]).trim() !== ""
      : toInput(head[gate.column]) === gate.value;
  }
  // The queue query ships each EC's slips inline as `child_rows`.
  function childRowsFor(ec: Row): Row[] {
    return (ec.child_rows ?? []) as Row[];
  }

  const colCount = groupBySo
    ? 3 + (showParty ? 1 : 0) + readonlyFields.length + 1 // toggle + Sl. + SO + party? + context + ECs count/edit
    : 2 +
      (showEcNo ? 1 : 0) +
      (showParty ? 1 : 0) +
      readonlyFields.length +
      visibleFields.length +
      (canEdit ? 1 : 0) +
      documents.length;
  const title = SECTION_BY_TABLE.get(table)?.title ?? "Details";

  return (
    <div>
      <div className="mb-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search SO, EC, party, item…"
        />
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {groupBySo && <th className="w-8 px-2 py-3" />}
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                {!groupBySo && showEcNo && <th className="px-4 py-3">EC No.</th>}
                {showParty && <th className="px-4 py-3">Client Name</th>}
                {readonlyFields.map((f) => (
                  <th
                    key={f.column}
                    className="px-3 py-3 whitespace-nowrap text-muted-foreground"
                  >
                    {f.label}
                  </th>
                ))}
                {groupBySo ? (
                  <th className="px-4 py-3 text-center normal-case">ECs</th>
                ) : (
                  <>
                    {visibleFields.map((f) => (
                      <th key={f.column} className="px-3 py-3 whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                    {documents.map((doc) => (
                      <th key={doc.table} className="px-3 py-3 whitespace-nowrap">
                        {doc.label}
                      </th>
                    ))}
                    {canEdit && <th className="px-4 py-3 text-right">Edit</th>}
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pageRows.length === 0 && (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-10 text-center text-sm text-muted"
                  >
                    No orders match your search.
                  </td>
                </tr>
              )}
              {!groupBySo &&
                pageRows.map((order) => (
                  <tr key={String(order.id)} className="text-foreground">
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {String(order.sl_no ?? "—")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {toInput(order.so_no) || "—"}
                    </td>
                    {showEcNo && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        {toInput(order.ec_no) || "—"}
                      </td>
                    )}
                    {showParty && (
                      <td className="px-4 py-3">{toInput(order.party) || "—"}</td>
                    )}
                    {readonlyFields.map((f) => (
                      <td
                        key={f.column}
                        className="px-3 py-3 whitespace-nowrap text-muted"
                      >
                        {formatValue(f, order[f.column])}
                      </td>
                    ))}
                    {visibleFields.map((f) => (
                      <td key={f.column} className="px-3 py-3 whitespace-nowrap">
                        {fieldApplies(f, order) ? formatValue(f, order[f.column]) : "—"}
                      </td>
                    ))}
                    {documents.map((doc) => (
                      <td key={doc.table} className="px-3 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setDocsPanel({ row: order, config: doc })}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          {doc.counts[String(order.id)] ?? 0} file
                          {(doc.counts[String(order.id)] ?? 0) === 1 ? "" : "s"}
                        </button>
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setEditRow(order)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

              {groupBySo &&
                soGroups.map((g) => {
                  const isOpen = expanded.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr className="text-foreground transition-colors hover:bg-background/60">
                        <td className="px-2 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSo(g.key)}
                            aria-label={isOpen ? "Collapse" : "Expand"}
                            aria-expanded={isOpen}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-input-border text-muted-foreground transition-colors hover:bg-background"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium tabular-nums">
                          {String(g.head.sl_no ?? "—")}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {toInput(g.head.so_no) || "—"}
                        </td>
                        {showParty && (
                          <td className="px-4 py-3">
                            {toInput(g.head.party) || "—"}
                          </td>
                        )}
                        {readonlyFields.map((f) => (
                          <td
                            key={f.column}
                            className="px-3 py-3 whitespace-nowrap text-muted"
                          >
                            {formatValue(f, g.head[f.column])}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center tabular-nums">
                          {g.ecs.length}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-background/40">
                          <td colSpan={colCount} className="p-0">
                            <div className="overflow-x-auto px-4 py-3">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    <th className="px-3 py-2">EC No.</th>
                                    {visibleFields.map((f) => (
                                      <th
                                        key={f.column}
                                        className="px-3 py-2 whitespace-nowrap"
                                      >
                                        {f.label}
                                      </th>
                                    ))}
                                    {documents.map((doc) => (
                                      <th
                                        key={doc.table}
                                        className="px-3 py-2 whitespace-nowrap"
                                      >
                                        {doc.label}
                                      </th>
                                    ))}
                                    {canEdit && (
                                      <th className="px-3 py-2 text-right">Edit</th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody>
                                  {g.ecs.map((ec) => (
                                    <tr key={String(ec.id)} className="text-foreground">
                                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                                        {toInput(ec.ec_no) || "—"}
                                      </td>
                                      {visibleFields.map((f) => (
                                        <td
                                          key={f.column}
                                          className="px-3 py-2 whitespace-nowrap"
                                        >
                                          {fieldApplies(f, ec)
                                            ? formatValue(f, ec[f.column])
                                            : "—"}
                                        </td>
                                      ))}
                                      {documents.map((doc) => (
                                        <td
                                          key={doc.table}
                                          className="px-3 py-2 whitespace-nowrap"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setDocsPanel({ row: ec, config: doc })
                                            }
                                            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-input-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                                          >
                                            <Paperclip className="h-3.5 w-3.5" />
                                            {doc.counts[String(ec.id)] ?? 0} file
                                            {(doc.counts[String(ec.id)] ?? 0) === 1
                                              ? ""
                                              : "s"}
                                          </button>
                                        </td>
                                      ))}
                                      {canEdit && (
                                        <td className="px-3 py-2 text-right">
                                          <button
                                            type="button"
                                            onClick={() => setEditRow(ec)}
                                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-input-border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                                          >
                                            <Pencil className="h-3.5 w-3.5" />
                                            Edit
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>

                              {/* Sections with a per-EC child list (Planning /
                                  Packing → packing slips) render it per EC. */}
                              {childTable && (
                                <div className="mt-4 space-y-4">
                                  {!childGateOkFor(g.head) ? (
                                    <p className="text-xs text-muted">
                                      Packing Details Required is not set to Yes
                                      on this order.
                                    </p>
                                  ) : (
                                    g.ecs.map((ec) => (
                                      <div
                                        key={`slips-${String(ec.id)}`}
                                        className="rounded-lg border border-card-border bg-surface p-3 shadow-sm"
                                      >
                                        <div className="mb-2 flex items-center gap-2">
                                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                            EC · {toInput(ec.ec_no) || "—"}
                                          </span>
                                        </div>
                                        <OrderChildList
                                          orderId={String(ec.id)}
                                          table={childTable}
                                          title={childTitle}
                                          fields={CHILD_FIELDS[childTable]}
                                          rows={childRowsFor(ec)}
                                          canEdit={canEdit}
                                          kind={childKind}
                                          context={{
                                            nature_of_supply: ec.nature_of_supply,
                                            packing_details_required:
                                              ec.packing_details_required,
                                          }}
                                        />
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
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
        <Pagination
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          from={from}
          to={to}
          total={total}
        />
      </div>

      {editRow && canEdit && (
        <EditSectionModal
          orderId={String(editRow.id)}
          table={table}
          title={title}
          fields={fields}
          readonlyFields={readonlyFields}
          canEditCentral={canEditCentral}
          data={editRow}
          onClose={() => setEditRow(null)}
        />
      )}

      {docsPanel && (
        <QcDocumentsModal
          table={docsPanel.config.table}
          title={docsPanel.config.label}
          orderId={String(docsPanel.row.id)}
          label={[
            docsPanel.row.so_no,
            docsPanel.row.ec_no,
            showParty ? docsPanel.row.party : null,
          ]
            .filter(Boolean)
            .map(String)
            .join(" · ")}
          canEdit={docsPanel.config.canEdit}
          onClose={() => setDocsPanel(null)}
        />
      )}
    </div>
  );
}

function EditSectionModal({
  orderId,
  table,
  title,
  fields,
  readonlyFields,
  canEditCentral,
  data,
  onClose,
}: {
  orderId: string;
  table: OrderTable;
  title: string;
  fields: OrderField[];
  readonlyFields: OrderField[];
  canEditCentral: boolean;
  data: Row;
  onClose: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map((f) => [f.column, canonicalSelectValue(f, toInput(data[f.column]))])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOrder, setShowOrder] = useState(false);
  const [showPis, setShowPis] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await updateOrderSectionAction(orderId, table, values);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

  const showParty = table === "order_billing" || table === "order_accounts";
  const identity = [data.so_no, data.ec_no].filter(Boolean).join(" · ");
  const inputClass =
    "h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-card-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center justify-between gap-3 pr-8">
          <h2 className="font-display text-lg font-semibold text-foreground">
            {title}
          </h2>
          {/* orderId is the SO's order_id only for SO-scope sections
              (Billing & Operations, Accounts) — the rest are keyed by item_id. */}
          {(table === "order_billing" || table === "order_accounts") && (
            <div className="flex shrink-0 items-center gap-2">
              {table === "order_accounts" && (
                <button
                  type="button"
                  onClick={() => setShowPis(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  View PIs
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowOrder(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                View order details
              </button>
            </div>
          )}
        </div>
        <p className="mb-5 text-sm text-muted">
          Order #{String(data.sl_no ?? "—")}
          {identity ? ` · ${identity}` : ""}
          {showParty && data.party ? ` · ${String(data.party)}` : ""}
        </p>

        {readonlyFields.length > 0 && (
          <div className="mb-5 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl bg-background/60 p-4 sm:grid-cols-2">
            {readonlyFields.map((f) => (
              <div key={f.column}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {f.label}
                </div>
                <div className="text-sm text-muted">
                  {formatValue(f, data[f.column])}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={save}>
          {error && (
            <div className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.map((field) => {
              // Cascade: a dependsOn'd field (e.g. billing docs gated on the
              // order's bill_type) is hidden entirely when its condition, read
              // from the edit values then the row data, isn't met.
              if (
                !dependsOnSatisfied(
                  field,
                  (col) => values[col] ?? toInput(data[col])
                )
              ) {
                return null;
              }
              // Computed and (for non-central users) centralOnly fields are
              // shown read-only rather than as inputs.
              if (field.computed || (field.centralOnly && !canEditCentral)) {
                return (
                  <div key={field.column}>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-brand-label">
                      {field.label}
                      <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                        {field.computed ? "auto" : "read-only"}
                      </span>
                    </label>
                    <div className="flex h-10 items-center px-1 text-[14px] text-muted">
                      {formatValue(field, data[field.column])}
                    </div>
                  </div>
                );
              }
              return (
                <div key={field.column}>
                  <label className="mb-1.5 block text-[13px] font-medium text-brand-label">
                    {field.label}
                  </label>
                  {field.type === "select" ? (
                    <select
                      value={values[field.column] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.column]: e.target.value }))
                      }
                      className={`${inputClass} cursor-pointer`}
                    >
                      <option value="">—</option>
                      {selectOptionsFor(field, values[field.column] ?? "").map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={
                        field.type === "date"
                          ? "date"
                          : field.type === "text"
                            ? "text"
                            : "number"
                      }
                      step={field.type === "number" ? "any" : undefined}
                      value={values[field.column] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.column]: e.target.value }))
                      }
                      className={inputClass}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-11 flex-1 rounded-[10px] border border-input-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-background"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>

      {showOrder && (
        <OrderDetailsModal orderId={orderId} onClose={() => setShowOrder(false)} />
      )}
      {showPis && (
        <ViewPisModal orderId={orderId} onClose={() => setShowPis(false)} />
      )}
    </div>
  );
}
