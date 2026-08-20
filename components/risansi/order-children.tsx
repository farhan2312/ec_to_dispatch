"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  addOrderChildAction,
  deleteOrderChildAction,
  updateOrderChildAction,
} from "@/app/risansi/orders/actions";
import {
  dependsOnSatisfied,
  selectOptionsFor,
  type ChildTable,
  type OrderField,
} from "@/lib/order-schema";

type Row = Record<string, unknown>;

function toInput(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function OrderChildList({
  orderId,
  table,
  title,
  fields,
  rows,
  canEdit,
  canAdd,
  kind,
  context,
  renderExtra,
}: {
  orderId: string;
  table: ChildTable;
  title: string;
  fields: OrderField[];
  rows: Row[];
  canEdit: boolean;
  // Whether new rows may be added — defaults to canEdit. Set false to keep
  // existing rows editable/deletable while retiring new additions (e.g.
  // Dispatch Lots, now superseded by Billing's per-SO invoices).
  canAdd?: boolean;
  // Packing slips only: new rows are created with this kind ('tentative' for
  // Planning, 'actual' for Packing).
  kind?: string;
  // Parent values a field's dependsOn may gate on (e.g. the SO's market type
  // deciding whether the export-only packing columns apply). Resolved ahead of
  // the row itself, so a column's visibility doesn't depend on rows existing.
  context?: Row;
  // Optional trailing cell per row (e.g. an invoice's LR attachment control).
  renderExtra?: { label: string; render: (row: Row) => React.ReactNode };
}) {
  const router = useRouter();
  // Edits overlay keyed by row id; the row list itself always comes from props.
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function seed(row: Row): Record<string, string> {
    return Object.fromEntries(fields.map((f) => [f.column, toInput(row[f.column])]));
  }

  function valueFor(row: Row, column: string): string {
    const id = String(row.id);
    // Edits win, then the row, then the parent context (market type & co).
    return (
      edits[id]?.[column] ?? toInput(row[column] ?? context?.[column])
    );
  }

  // A dependsOn'd field (e.g. the Others free-text) applies to a row only when
  // its condition is satisfied by that row's current value.
  function applies(field: OrderField, row: Row): boolean {
    return dependsOnSatisfied(field, (col) => valueFor(row, col));
  }

  // Fields declaring a `group` render as a stacked-cards layout below rather
  // than a flat table row; buckets keep the fields contiguous per group.
  const hasGroups = fields.some((f) => f.group);
  const groupBuckets = hasGroups ? bucketByGroup(fields) : [];

  const visibleFields = fields.filter((f) => {
    if (!f.dependsOn) return true;
    // When the parent context carries every gating column (e.g. the SO's
    // market type), it decides the column outright — so an Export order shows
    // its extra columns even before the first slip is added.
    if (context && f.dependsOn.every((d) => d.column in context)) {
      return dependsOnSatisfied(f, (col) => toInput(context[col]));
    }
    // Otherwise the column appears once some row qualifies (e.g. Item = Others).
    return rows.some((r) => applies(f, r));
  });

  function update(row: Row, column: string, value: string) {
    const id = String(row.id);
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? seed(row)), [column]: value },
    }));
    setSavedId(null);
  }

  async function saveRow(row: Row) {
    const id = String(row.id);
    setBusyId(id);
    const values = edits[id] ?? seed(row);
    const result = await updateOrderChildAction(id, table, values, orderId);
    setBusyId(null);
    if (!result.ok) return;
    setEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setSavedId(id);
    router.refresh();
  }

  async function deleteRow(row: Row) {
    const id = String(row.id);
    setBusyId(id);
    const result = await deleteOrderChildAction(id, table, orderId);
    setBusyId(null);
    if (result.ok) router.refresh();
  }

  async function addRow() {
    setAdding(true);
    const result = await addOrderChildAction(orderId, table, kind);
    setAdding(false);
    if (result.ok) router.refresh();
  }

  return (
    <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">
          {title}
        </h2>
        {(canAdd ?? canEdit) && (
          <button
            type="button"
            onClick={addRow}
            disabled={adding}
            className="inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background disabled:opacity-60"
          >
            {adding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Add
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">None recorded.</p>
      ) : hasGroups ? (
        // Grouped fields (e.g. invoices → Invoice / Dispatch / Docket) render
        // each row as a vertical card with one grid per group. Reads better
        // than a wide many-column table.
        <div className="space-y-4">
          {rows.map((row) => (
            <RowCard
              key={String(row.id)}
              row={row}
              groups={groupBuckets}
              renderExtra={renderExtra}
              canEdit={canEdit}
              busy={busyId === String(row.id)}
              saved={savedId === String(row.id)}
              dirty={!!edits[String(row.id)]}
              valueFor={valueFor}
              applies={applies}
              update={update}
              onSave={() => saveRow(row)}
              onDelete={() => deleteRow(row)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {visibleFields.map((f) => (
                  <th key={f.column} className="px-3 py-2 whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                {renderExtra && (
                  <th className="px-3 py-2 whitespace-nowrap">{renderExtra.label}</th>
                )}
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {rows.map((row) => {
                const id = String(row.id);
                const inputClass =
                  "h-9 w-full min-w-[120px] rounded-lg border border-input-border bg-surface px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20";
                return (
                  <tr key={id} className="text-foreground">
                    {visibleFields.map((f) => (
                      <td key={f.column} className="px-3 py-2">
                        {!applies(f, row) ? (
                          <span className="text-muted-foreground">—</span>
                        ) : !canEdit ? (
                          <span>{valueFor(row, f.column) || "—"}</span>
                        ) : f.type === "select" ? (
                          <select
                            value={valueFor(row, f.column)}
                            onChange={(e) => update(row, f.column, e.target.value)}
                            className={`${inputClass} cursor-pointer`}
                          >
                            <option value="">—</option>
                            {selectOptionsFor(f, valueFor(row, f.column)).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={f.type === "date" ? "date" : "text"}
                            value={valueFor(row, f.column)}
                            onChange={(e) => update(row, f.column, e.target.value)}
                            className={inputClass}
                          />
                        )}
                      </td>
                    ))}
                    {renderExtra && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        {renderExtra.render(row)}
                      </td>
                    )}
                    {canEdit && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => saveRow(row)}
                            disabled={!edits[id] || busyId === id}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyId === id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : savedId === id ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : null}
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row)}
                            disabled={busyId === id}
                            aria-label="Delete row"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Bucket visible fields by their `group` label so grouped rendering can render
// one subsection per group.
type Bucket = { label: string | null; fields: OrderField[] };
function bucketByGroup(fields: OrderField[]): Bucket[] {
  const buckets: Bucket[] = [];
  for (const f of fields) {
    const label = f.group ?? null;
    const last = buckets[buckets.length - 1];
    if (last && last.label === label) last.fields.push(f);
    else buckets.push({ label, fields: [f] });
  }
  return buckets;
}

/** One row of a grouped list, rendered as a vertical card with a grid per group. */
function RowCard({
  row,
  groups,
  renderExtra,
  canEdit,
  busy,
  saved,
  dirty,
  valueFor,
  applies,
  update,
  onSave,
  onDelete,
}: {
  row: Row;
  groups: Bucket[];
  renderExtra?: { label: string; render: (row: Row) => React.ReactNode };
  canEdit: boolean;
  busy: boolean;
  saved: boolean;
  dirty: boolean;
  valueFor: (row: Row, column: string) => string;
  applies: (f: OrderField, row: Row) => boolean;
  update: (row: Row, column: string, value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const inputClass =
    "h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20";
  // Collapse the card to a one-line summary when there's a lot to look at.
  // Default open on a brand-new (empty) row so it's obvious what to fill in.
  const isNew = groups.every((g) =>
    g.fields.every((f) => !valueFor(row, f.column))
  );
  const [collapsed, setCollapsed] = useState(!isNew);

  // Pick a couple of leading fields for the summary line (first non-empty
  // values, skipping conditional fields that don't apply to this row).
  const summaryParts: string[] = [];
  for (const g of groups) {
    for (const f of g.fields) {
      if (!applies(f, row)) continue;
      const v = valueFor(row, f.column);
      if (!v) continue;
      summaryParts.push(`${f.label}: ${v}`);
      if (summaryParts.length >= 3) break;
    }
    if (summaryParts.length >= 3) break;
  }
  const summary = summaryParts.length ? summaryParts.join(" · ") : "New — click to fill in";

  return (
    <div className="rounded-xl border border-card-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-3 rounded-t-xl px-4 py-3 text-left transition-colors hover:bg-background/60"
      >
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-input-border text-muted-foreground">
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {summary}
        </span>
        {dirty && !collapsed && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            Unsaved
          </span>
        )}
      </button>

      {!collapsed && (
        <>
          <div className="space-y-5 border-t border-card-border px-4 py-4">
        {groups
          .map((g) => ({ label: g.label, fields: g.fields.filter((f) => applies(f, row)) }))
          .filter((g) => g.fields.length > 0)
          .map((g, i) => (
          <div key={i}>
            {g.label && (
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-primary">
                {g.label}
              </h3>
            )}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {g.fields.map((f) => (
                <div key={f.column}>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </label>
                  {!canEdit ? (
                    <div className="flex h-10 items-center px-1 text-[14px] text-foreground">
                      {valueFor(row, f.column) || "—"}
                    </div>
                  ) : f.type === "select" ? (
                    <select
                      value={valueFor(row, f.column)}
                      onChange={(e) => update(row, f.column, e.target.value)}
                      className={`${inputClass} cursor-pointer`}
                    >
                      <option value="">—</option>
                      {selectOptionsFor(f, valueFor(row, f.column)).map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === "date" ? "date" : "text"}
                      value={valueFor(row, f.column)}
                      onChange={(e) => update(row, f.column, e.target.value)}
                      className={inputClass}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {renderExtra && (
          <div>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-primary">
              {renderExtra.label}
            </h3>
            {renderExtra.render(row)}
          </div>
        )}
      </div>

          {canEdit && (
            <div className="flex items-center gap-2 border-t border-card-border px-4 py-3">
              <button
                type="button"
                onClick={onSave}
                disabled={!dirty || busy}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saved ? (
                  <Check className="h-3.5 w-3.5" />
                ) : null}
                Save
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                aria-label="Delete row"
                className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
