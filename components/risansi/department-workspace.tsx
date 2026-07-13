"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { updateOrderSectionAction } from "@/app/risansi/orders/actions";
import type { OrderField, OrderTable } from "@/lib/order-schema";

type Row = Record<string, unknown>;

function toInput(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function DepartmentWorkspace({
  table,
  fields,
  orders,
}: {
  table: OrderTable;
  fields: OrderField[];
  orders: Row[];
}) {
  const router = useRouter();

  // Per-row editable values, keyed by order id.
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () =>
      Object.fromEntries(
        orders.map((o) => [
          String(o.id),
          Object.fromEntries(fields.map((f) => [f.column, toInput(o[f.column])])),
        ])
      )
  );
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  function update(id: string, column: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: { ...prev[id], [column]: value } }));
    setDirty((prev) => ({ ...prev, [id]: true }));
    setSavedId(null);
    setErrorId(null);
  }

  async function save(id: string) {
    setSavingId(id);
    setErrorId(null);
    const result = await updateOrderSectionAction(id, table, values[id]);
    setSavingId(null);
    if (!result.ok) {
      setErrorId(id);
      return;
    }
    setDirty((prev) => ({ ...prev, [id]: false }));
    setSavedId(id);
    router.refresh();
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

  return (
    <div className="overflow-x-auto rounded-xl border border-card-border bg-surface shadow-sm">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-4 py-3">Sl.</th>
            <th className="px-4 py-3">SO No.</th>
            <th className="px-4 py-3">EC No.</th>
            <th className="px-4 py-3">Party</th>
            {fields.map((f) => (
              <th key={f.column} className="px-3 py-3 whitespace-nowrap">
                {f.label}
              </th>
            ))}
            <th className="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {orders.map((order) => {
            const id = String(order.id);
            return (
              <tr key={id} className="align-top text-foreground">
                <td className="px-4 py-3 font-medium tabular-nums">
                  {String(order.sl_no ?? "—")}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {toInput(order.so_no) || "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {toInput(order.ec_no) || "—"}
                </td>
                <td className="px-4 py-3">{toInput(order.party) || "—"}</td>
                {fields.map((f) => {
                  const disabled = f.dependsOn
                    ? (values[id]?.[f.dependsOn.column] ?? "") !==
                      f.dependsOn.value
                    : false;
                  return (
                  <td key={f.column} className="px-3 py-2">
                    {f.type === "select" ? (
                      <select
                        value={values[id]?.[f.column] ?? ""}
                        onChange={(e) => update(id, f.column, e.target.value)}
                        disabled={disabled}
                        className="h-9 w-full min-w-[140px] rounded-lg border border-input-border bg-surface px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {f.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={
                          f.type === "date"
                            ? "date"
                            : f.type === "text"
                              ? "text"
                              : "number"
                        }
                        step={f.type === "number" ? "any" : undefined}
                        value={values[id]?.[f.column] ?? ""}
                        onChange={(e) => update(id, f.column, e.target.value)}
                        className="h-9 w-full min-w-[120px] rounded-lg border border-input-border bg-surface px-2.5 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                      />
                    )}
                  </td>
                  );
                })}
                <td className="px-4 py-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => save(id)}
                    disabled={!dirty[id] || savingId === id}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingId === id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : savedId === id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : null}
                    {savingId === id ? "Saving" : savedId === id ? "Saved" : "Save"}
                  </button>
                  {errorId === id && (
                    <p className="mt-1 text-[11px] text-danger">
                      Couldn&apos;t save
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
