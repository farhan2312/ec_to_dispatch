"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Pencil } from "lucide-react";
import { updateOrderSectionAction } from "@/app/risansi/orders/actions";
import {
  canonicalSelectValue,
  dependsOnSatisfied,
  selectOptionsFor,
  type OrderField,
  type OrderSection,
} from "@/lib/order-schema";
import type { QcDocTable } from "@/lib/orders";
import { QcDocumentsModal } from "./qc-documents-modal";

export type DocumentsConfig = {
  table: QcDocTable;
  label: string;
  canEdit: boolean;
};

type Row = Record<string, unknown>;

function toInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function formatDisplay(field: OrderField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "date") {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }
  }
  if (field.type === "number" || field.type === "int") {
    const n = Number(value);
    if (Number.isFinite(n)) return new Intl.NumberFormat("en-IN").format(n);
  }
  if (field.type === "select") return canonicalSelectValue(field, String(value));
  return String(value);
}

// Seed the form value for a field, normalizing select casing.
function seedValue(field: OrderField, data: Row | null): string {
  return canonicalSelectValue(field, toInput(data?.[field.column]));
}

// A field's dependsOn may reference a column outside this section (e.g. the
// order's bill_type gating a billing field). Resolve from the edit values
// first, then fall back to the row data.
function dependsSatisfied(
  field: OrderField,
  values: Record<string, string>,
  data: Row | null
): boolean {
  return dependsOnSatisfied(
    field,
    (col) => values[col] ?? toInput(data?.[col])
  );
}

/**
 * An editable order/EC section. `targetId` is the SO's order_id for SO-scope
 * sections and the EC's item_id for item-scope sections — the section's own
 * scope decides how the server routes the save.
 */
export function EditableSection({
  targetId,
  section,
  data,
  canEdit,
  canEditCentral,
  documents = [],
}: {
  targetId: string;
  section: OrderSection;
  data: Row | null;
  canEdit: boolean;
  canEditCentral: boolean;
  documents?: DocumentsConfig[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDocs, setOpenDocs] = useState<DocumentsConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(section.fields.map((f) => [f.column, seedValue(f, data)]))
  );

  function startEdit() {
    setValues(
      Object.fromEntries(section.fields.map((f) => [f.column, seedValue(f, data)]))
    );
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await updateOrderSectionAction(targetId, section.table, values);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">
          {section.title}
        </h2>
        <div className="flex items-center gap-2">
          {documents.map((doc) => (
            <button
              key={doc.table}
              type="button"
              onClick={() => setOpenDocs(doc)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {doc.label}
            </button>
          ))}
          {!editing && canEdit && (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
        </div>
      </div>

      {openDocs && (
        <QcDocumentsModal
          table={openDocs.table}
          title={openDocs.label}
          orderId={targetId}
          label={section.title}
          canEdit={openDocs.canEdit}
          onClose={() => setOpenDocs(null)}
        />
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {(() => {
        // Bucket visible fields by their `group` label (consecutive fields
        // sharing a label are one bucket). Buckets with no label render as
        // a plain grid — matches the old behavior when no groups are defined.
        type Bucket = { label: string | null; fields: OrderField[] };
        const buckets: Bucket[] = [];
        for (const f of section.fields) {
          if (!dependsSatisfied(f, values, data)) continue;
          const label = f.group ?? null;
          const last = buckets[buckets.length - 1];
          if (last && last.label === label) last.fields.push(f);
          else buckets.push({ label, fields: [f] });
        }
        const gridClass =
          "grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
        return (
          <div className="space-y-6">
            {buckets.map((bucket, bi) => (
              <div key={bi}>
                {bucket.label && (
                  <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-primary">
                    {bucket.label}
                  </h3>
                )}
                <div className={gridClass}>
                  {bucket.fields.map((field) => {
                    const fieldEditable =
                      editing &&
                      !field.computed &&
                      (!field.centralOnly || canEditCentral);
                    return (
                      <div key={field.column}>
                        <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                          {field.label}
                          {field.centralOnly && !canEditCentral && (
                            <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                              read-only
                            </span>
                          )}
                          {field.computed && (
                            <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                              auto
                            </span>
                          )}
                        </div>
                        {fieldEditable ? (
                          field.type === "select" ? (
                            <select
                              value={values[field.column] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [field.column]: e.target.value,
                                }))
                              }
                              className="h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
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
                                setValues((prev) => ({
                                  ...prev,
                                  [field.column]: e.target.value,
                                }))
                              }
                              className="h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          )
                        ) : (
                          <div className="text-[14px] text-foreground">
                            {formatDisplay(field, data?.[field.column])}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {editing && (
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-10 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-10 rounded-[10px] border border-input-border bg-surface px-5 text-sm font-medium text-foreground transition-colors hover:bg-background"
          >
            Cancel
          </button>
        </div>
      )}
    </section>
  );
}
