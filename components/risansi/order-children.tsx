"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import {
  addOrderChildAction,
  deleteOrderChildAction,
  updateOrderChildAction,
} from "@/app/risansi/orders/actions";
import type { ChildTable, OrderField } from "@/lib/order-schema";

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
}: {
  orderId: string;
  table: ChildTable;
  title: string;
  fields: OrderField[];
  rows: Row[];
  canEdit: boolean;
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
    return edits[id]?.[column] ?? toInput(row[column]);
  }

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
    const result = await addOrderChildAction(orderId, table);
    setAdding(false);
    if (result.ok) router.refresh();
  }

  return (
    <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">
          {title}
        </h2>
        {canEdit && (
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
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {fields.map((f) => (
                  <th key={f.column} className="px-3 py-2 whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {rows.map((row) => {
                const id = String(row.id);
                return (
                  <tr key={id} className="text-foreground">
                    {fields.map((f) => (
                      <td key={f.column} className="px-3 py-2">
                        {canEdit ? (
                          <input
                            type={f.type === "date" ? "date" : "text"}
                            value={valueFor(row, f.column)}
                            onChange={(e) => update(row, f.column, e.target.value)}
                            className="h-9 w-full min-w-[120px] rounded-lg border border-input-border bg-surface px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                          />
                        ) : (
                          <span>{valueFor(row, f.column) || "—"}</span>
                        )}
                      </td>
                    ))}
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
