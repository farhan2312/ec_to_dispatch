"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { updateOrderSectionAction } from "@/app/risansi/orders/actions";
import {
  ORDER_SECTIONS,
  LOT_FIELDS,
  type OrderField,
  type OrderSection,
} from "@/lib/order-schema";
import { canEditChild, canEditSection, isCentral } from "@/lib/roles";
import type { OrderDetail as OrderDetailData } from "@/lib/orders";
import { OrderChildList } from "./order-children";
import { OrderPipeline, pipelineSummary } from "./order-pipeline";

type Row = Record<string, unknown>;

function toInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatDisplay(field: OrderField, value: unknown): string {
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
  if (field.type === "number") {
    const n = Number(value);
    if (Number.isFinite(n)) return new Intl.NumberFormat("en-IN").format(n);
  }
  return String(value);
}

function EditableSection({
  orderId,
  section,
  data,
  canEdit,
  canEditCentral,
}: {
  orderId: string;
  section: OrderSection;
  data: Row | null;
  canEdit: boolean;
  canEditCentral: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      section.fields.map((f) => [f.column, toInput(data?.[f.column])])
    )
  );

  function startEdit() {
    setValues(
      Object.fromEntries(
        section.fields.map((f) => [f.column, toInput(data?.[f.column])])
      )
    );
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await updateOrderSectionAction(orderId, section.table, values);
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

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {section.fields.map((field) => {
          // centralOnly fields stay read-only for non-central editors.
          const fieldEditable = editing && (!field.centralOnly || canEditCentral);
          return (
          <div key={field.column}>
            <div className="mb-1 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              {field.label}
              {field.centralOnly && !canEditCentral && (
                <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                  read-only
                </span>
              )}
            </div>
            {fieldEditable ? (
              field.type === "select" ? (
                <select
                  value={values[field.column] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.column]: e.target.value }))
                  }
                  disabled={
                    field.dependsOn
                      ? (values[field.dependsOn.column] ?? "") !==
                        field.dependsOn.value
                      : false
                  }
                  className="h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">—</option>
                  {field.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "date" ? "date" : field.type === "text" ? "text" : "number"}
                  step={field.type === "number" ? "any" : undefined}
                  value={values[field.column] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [field.column]: e.target.value }))
                  }
                  className="h-10 w-full rounded-[10px] border border-input-border bg-surface px-3 text-[14px] text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
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

export function OrderDetail({
  detail,
  orderId,
  role,
}: {
  detail: OrderDetailData;
  orderId: string;
  role: string;
}) {
  const order = detail.order;

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
            Order · {String(order.so_no ?? order.ec_no ?? `#${order.sl_no ?? "—"}`)}
          </span>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            {order.item ? String(order.item) : "Order"}
            {order.model_no ? ` — ${String(order.model_no)}` : ""}
          </h1>
        </div>
        {(() => {
          const s = pipelineSummary(detail);
          const tone =
            s.status === "Blocked"
              ? "bg-rose-50 text-rose-700 ring-rose-200"
              : s.status === "Complete"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-amber-50 text-amber-700 ring-amber-200";
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${tone}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {s.status} · {s.complete} of {s.total} complete
            </span>
          );
        })()}
      </div>

      <OrderPipeline detail={detail} />

      <div className="max-w-4xl space-y-6">
        {ORDER_SECTIONS.map((section) => {
          // Core section's data lives under `order`; detail tables under their
          // own table name.
          const data =
            section.table === "orders"
              ? detail.order
              : (detail[section.table] as Row | null);

          return (
            <EditableSection
              key={section.key}
              orderId={orderId}
              section={section}
              data={data ?? null}
              canEdit={canEditSection(role, section.table)}
              canEditCentral={isCentral(role)}
            />
          );
        })}

        <OrderChildList
          orderId={orderId}
          table="order_lots"
          title="Dispatch Lots"
          fields={LOT_FIELDS}
          rows={detail.order_lots}
          canEdit={canEditChild(role, "order_lots")}
        />
      </div>
    </div>
  );
}
