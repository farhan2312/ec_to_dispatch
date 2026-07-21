"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Pencil, X } from "lucide-react";
import { updateOrderSectionAction } from "@/app/risansi/orders/actions";
import {
  SECTION_BY_TABLE,
  type OrderField,
  type OrderTable,
} from "@/lib/order-schema";
import { Pagination, SearchInput, useTableSearch } from "./table-tools";
import { QcDocumentsModal } from "./qc-documents-modal";

// Only the QC workspace passes this today; kept generic in case another
// department needs file attachments later.
type DocumentsConfig = {
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
  return s;
}

function rowSearchText(o: Row): string {
  return [o.sl_no, o.so_no, o.ec_no, o.party, o.item]
    .map((v) => (v == null ? "" : String(v)))
    .join(" ");
}

export function DepartmentWorkspace({
  table,
  fields,
  orders,
  readonlyFields = [],
  canEdit = true,
  canEditCentral = true,
  documents,
}: {
  table: OrderTable;
  fields: OrderField[];
  orders: Row[];
  readonlyFields?: OrderField[];
  canEdit?: boolean;
  // Whether the current user may edit `centralOnly` fields (Central Visibility).
  canEditCentral?: boolean;
  // QC document attachments — omitted everywhere except the QC workspace.
  documents?: DocumentsConfig;
}) {
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [docsRow, setDocsRow] = useState<Row | null>(null);

  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(orders, rowSearchText);

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

  const colCount =
    4 +
    readonlyFields.length +
    fields.length +
    (canEdit ? 1 : 0) +
    (documents ? 1 : 0);
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
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">EC No.</th>
                <th className="px-4 py-3">Party</th>
                {readonlyFields.map((f) => (
                  <th
                    key={f.column}
                    className="px-3 py-3 whitespace-nowrap text-muted-foreground"
                  >
                    {f.label}
                  </th>
                ))}
                {fields.map((f) => (
                  <th key={f.column} className="px-3 py-3 whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                {documents && <th className="px-3 py-3 whitespace-nowrap">Attach Docs</th>}
                {canEdit && <th className="px-4 py-3 text-right">Edit</th>}
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
              {pageRows.map((order) => (
                <tr key={String(order.id)} className="text-foreground">
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
                  {readonlyFields.map((f) => (
                    <td
                      key={f.column}
                      className="px-3 py-3 whitespace-nowrap text-muted"
                    >
                      {formatValue(f, order[f.column])}
                    </td>
                  ))}
                  {fields.map((f) => (
                    <td key={f.column} className="px-3 py-3 whitespace-nowrap">
                      {formatValue(f, order[f.column])}
                    </td>
                  ))}
                  {documents && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDocsRow(order)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {documents.counts[String(order.id)] ?? 0} file
                        {(documents.counts[String(order.id)] ?? 0) === 1 ? "" : "s"}
                      </button>
                    </td>
                  )}
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

      {docsRow && documents && (
        <QcDocumentsModal
          orderId={String(docsRow.id)}
          label={[docsRow.so_no, docsRow.ec_no, docsRow.party]
            .filter(Boolean)
            .map(String)
            .join(" · ")}
          canEdit={documents.canEdit}
          onClose={() => setDocsRow(null)}
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
    Object.fromEntries(fields.map((f) => [f.column, toInput(data[f.column])]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        <h2 className="font-display text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mb-5 text-sm text-muted">
          Order #{String(data.sl_no ?? "—")}
          {identity ? ` · ${identity}` : ""}
          {data.party ? ` · ${String(data.party)}` : ""}
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
              // centralOnly fields are read-only unless the user is Central.
              if (field.centralOnly && !canEditCentral) {
                return (
                  <div key={field.column}>
                    <label className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-brand-label">
                      {field.label}
                      <span className="rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500">
                        read-only
                      </span>
                    </label>
                    <div className="flex h-10 items-center px-1 text-[14px] text-muted">
                      {formatValue(field, data[field.column])}
                    </div>
                  </div>
                );
              }
              const disabled = field.dependsOn
                ? !field.dependsOn.every(
                    (d) => (values[d.column] ?? "") === d.value
                  )
                : false;
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
                      disabled={disabled}
                      className={`${inputClass} cursor-pointer`}
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
                      disabled={disabled}
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
    </div>
  );
}
