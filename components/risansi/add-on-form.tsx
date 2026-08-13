"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { createItemAction } from "@/app/risansi/orders/actions";
import { SECTION_BY_TABLE, selectOptionsFor } from "@/lib/order-schema";
import type { NewItemInput } from "@/lib/orders";

// The EC/pump attributes come straight from the order_items section schema, so
// the form and the stored columns never drift.
const ITEM_SECTION = SECTION_BY_TABLE.get("order_items")!;

const inputClass =
  "h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20";

export function AddOnForm({
  orderId,
  soLabel,
  orderType,
  onClose,
}: {
  orderId: string;
  soLabel: string;
  // The SO's Order Type (Pump/Spare); the EC inherits it, so the manual
  // "Pump Type" field is hidden and this is shown instead.
  orderType?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // item_type is inherited from the SO, so don't offer it as an input.
  const fields = ITEM_SECTION.fields.filter((f) => f.column !== "item_type");

  function set(column: string, value: string) {
    setValues((prev) => ({ ...prev, [column]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await createItemAction(orderId, values as NewItemInput);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
    onClose();
  }

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

        <h2 className="font-display text-lg font-semibold text-foreground">
          Add {orderType ? orderType.toLowerCase() : "pump / spare"} order
        </h2>
        <p className="mb-5 text-sm text-muted">
          EC under {soLabel}
          {orderType ? ` · Type: ${orderType}` : ""}
        </p>

        <form onSubmit={submit}>
          {error && (
            <div className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.column}>
                <label className="mb-1.5 block text-[13px] font-medium text-brand-label">
                  {field.label}
                </label>
                {field.type === "select" ? (
                  <select
                    value={values[field.column] ?? ""}
                    onChange={(e) => set(field.column, e.target.value)}
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
                    onChange={(e) => set(field.column, e.target.value)}
                    className={inputClass}
                  />
                )}
              </div>
            ))}
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
              {saving ? "Adding…" : "Add EC"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
