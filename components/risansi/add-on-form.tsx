"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import {
  createItemAction,
  createSpareItemAction,
} from "@/app/risansi/orders/actions";
import {
  ADD_ON_SPARE_FIELDS,
  addOnFieldsFor,
  firstMissingAddOnField,
  selectOptionsFor,
} from "@/lib/order-schema";
import type { NewItemInput } from "@/lib/orders";

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
  // The SO's Order Type (Pump/Spare) drives which form is rendered. Falls back
  // to Pump when the SO hasn't set an Order Type yet.
  orderType?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const isSpare = orderType === "Spare";
  const fields = addOnFieldsFor(orderType);
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();

    // Every field on the Add-On is mandatory — only the Spare's Order Copy
    // file is optional. Checked again server-side.
    const missing = firstMissingAddOnField(orderType, values);
    if (missing) {
      setError(`${missing.label} is required.`);
      document.getElementById(`addon-${missing.column}`)?.focus();
      return;
    }

    setSaving(true);
    setError(null);

    let ok: boolean;
    let err: string | undefined;
    if (isSpare) {
      const fd = new FormData();
      for (const f of ADD_ON_SPARE_FIELDS) fd.append(f.column, values[f.column] ?? "");
      if (file) fd.append("order_copy", file);
      const res = await createSpareItemAction(orderId, fd);
      ok = res.ok;
      err = res.ok ? undefined : res.error;
    } else {
      const res = await createItemAction(orderId, values as NewItemInput);
      ok = res.ok;
      err = res.ok ? undefined : res.error;
    }

    setSaving(false);
    if (!ok) {
      setError(err ?? "Something went wrong.");
      return;
    }
    router.refresh();
    onClose();
  }

  const title = isSpare ? "Add spare order" : "Add pump order";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-card-border bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-6 sm:pb-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
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
                <label
                  htmlFor={`addon-${field.column}`}
                  className="mb-1.5 block text-[13px] font-medium text-brand-label"
                >
                  {field.label}
                  <span className="text-danger"> *</span>
                </label>
                {field.type === "select" ? (
                  <select
                    id={`addon-${field.column}`}
                    required
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
                    id={`addon-${field.column}`}
                    required
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
            ))}
          </div>

          {isSpare && (
            // Spare form's Order Copy file upload — the one field on either
            // Add-On that is not mandatory.
            <div className="mt-5">
              <label className="mb-1.5 block text-[13px] font-medium text-brand-label">
                Order Copy (file)
                <span className="ml-1 font-normal text-muted-foreground">
                  (optional)
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-dashed border-input-border bg-surface px-4 py-3 text-sm transition-colors hover:bg-background">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate">
                  {file ? file.name : "Choose a file (PDF/image/doc, up to 8MB)"}
                </span>
                {file && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}

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
