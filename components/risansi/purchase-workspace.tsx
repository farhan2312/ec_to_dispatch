"use client";

import { useEffect, useState } from "react";
import { Package, X } from "lucide-react";
import type { PurchaseQueueRow } from "@/lib/orders";
import { BOI_ITEM_FIELDS } from "@/lib/order-schema";
import { OrderChildList } from "./order-children";
import { Pagination, SearchInput, useTableSearch } from "./table-tools";

type Row = Record<string, unknown>;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function rowSearchText(o: PurchaseQueueRow): string {
  return [o.sl_no, o.so_no, o.ec_no].filter(Boolean).join(" ");
}

function BoiItemsModal({
  row,
  canEdit,
  onClose,
}: {
  row: PurchaseQueueRow;
  canEdit: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-card-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="mb-1 font-display text-lg font-semibold text-foreground">
          BOI Items
        </h2>
        <p className="mb-4 text-sm text-muted">
          SO {row.so_no ?? "—"}
          {row.ec_no ? ` · ${row.ec_no}` : ""}
        </p>
        <OrderChildList
          orderId={row.id}
          table="order_boi_items"
          title="Bought-out items"
          fields={BOI_ITEM_FIELDS}
          rows={(row.boi_items ?? []) as Row[]}
          canEdit={canEdit}
        />
      </div>
    </div>
  );
}

export function PurchaseWorkspace({
  rows,
  canEdit,
  openItemId,
}: {
  rows: PurchaseQueueRow[];
  canEdit: boolean;
  openItemId?: string;
}) {
  // Track the managed EC by id (not a captured snapshot) so it always resolves
  // to the freshest row after add/delete + router.refresh().
  const [manageId, setManageId] = useState<string | null>(null);
  const manage = manageId ? rows.find((r) => r.id === manageId) ?? null : null;
  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(rows, rowSearchText);

  useEffect(() => {
    if (!openItemId) return;
    const row = rows.find((r) => r.id === openItemId);
    if (row && (row.boi ?? "") === "Yes") setManageId(row.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemId]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-surface px-6 py-16 text-center shadow-sm">
        <p className="text-sm font-medium text-foreground">No orders yet</p>
        <p className="mt-1 text-sm text-muted">
          ECs created by Central Visibility will appear here for BOI input.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search SO, EC…" />
      </div>

      <div className="rounded-xl border border-card-border bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-card-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">EC No.</th>
                <th className="px-4 py-3">BOI</th>
                <th className="px-4 py-3">LD</th>
                <th className="px-4 py-3">LD Date</th>
                <th className="px-4 py-3">Purchase Target</th>
                <th className="px-4 py-3">BOI Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                    No orders match your search.
                  </td>
                </tr>
              )}
              {pageRows.map((row) => {
                const boiYes = (row.boi ?? "") === "Yes";
                const count = (row.boi_items ?? []).length;
                return (
                  <tr key={row.id} className="text-foreground">
                    <td className="px-4 py-3 font-medium tabular-nums">{row.sl_no}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.so_no ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.ec_no ?? "—"}</td>
                    <td className="px-4 py-3">{row.boi ?? "—"}</td>
                    <td className="px-4 py-3">{row.ld ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(row.ld_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(row.purchase_target_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {boiYes ? (
                        <button
                          type="button"
                          onClick={() => setManageId(row.id)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
                        >
                          <Package className="h-3.5 w-3.5" />
                          {count} item{count === 1 ? "" : "s"}
                          {canEdit ? " · Manage" : ""}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
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

      {manage && (
        <BoiItemsModal row={manage} canEdit={canEdit} onClose={() => setManageId(null)} />
      )}
    </div>
  );
}
