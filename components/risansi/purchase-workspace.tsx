"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
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

export function PurchaseWorkspace({
  rows,
  canEdit,
  openItemId,
}: {
  rows: PurchaseQueueRow[];
  canEdit: boolean;
  openItemId?: string;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { query, setQuery, pageRows, page, setPage, totalPages, total, from, to } =
    useTableSearch(rows, rowSearchText);

  useEffect(() => {
    if (!openItemId) return;
    const row = rows.find((r) => r.id === openItemId);
    if (row && (row.boi ?? "") === "Yes") {
      const soKey = String(row.so_no ?? row.sl_no ?? "");
      if (soKey) setExpanded((prev) => new Set(prev).add(soKey));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openItemId]);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  // Group EC queue rows by SO so the workspace lists one row per SO with a
  // chevron to reveal the ECs and their per-EC "Manage" buttons.
  type SoGroup = { key: string; head: PurchaseQueueRow; ecs: PurchaseQueueRow[] };
  const soGroups: SoGroup[] = Array.from(
    pageRows.reduce((map, r) => {
      const key = String(r.so_no ?? r.sl_no ?? "");
      const g = map.get(key);
      if (g) g.ecs.push(r);
      else map.set(key, { key, head: r, ecs: [r] });
      return map;
    }, new Map<string, SoGroup>())
  ).map(([, g]) => g);

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
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3">Sl.</th>
                <th className="px-4 py-3">SO No.</th>
                <th className="px-4 py-3">BOI</th>
                <th className="px-4 py-3">LD</th>
                <th className="px-4 py-3">LD Date</th>
                <th className="px-4 py-3">Purchase Target</th>
                <th className="px-4 py-3 text-center normal-case">ECs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {soGroups.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                    No orders match your search.
                  </td>
                </tr>
              )}
              {soGroups.map((g) => {
                const isOpen = expanded.has(g.key);
                const boiYes = (g.head.boi ?? "") === "Yes";
                return (
                  <Fragment key={g.key}>
                    <tr className="text-foreground transition-colors hover:bg-background/60">
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(g.key)}
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
                      <td className="px-4 py-3 font-medium tabular-nums">{g.head.sl_no}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{g.head.so_no ?? "—"}</td>
                      <td className="px-4 py-3">{g.head.boi ?? "—"}</td>
                      <td className="px-4 py-3">{g.head.ld ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatDate(g.head.ld_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatDate(g.head.purchase_target_date)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {g.ecs.length}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-background/40">
                        <td colSpan={8} className="p-0">
                          <div className="space-y-4 px-4 py-3">
                            {g.ecs.map((row) => (
                              <div
                                key={row.id}
                                className="rounded-lg border border-card-border bg-surface p-3 shadow-sm"
                              >
                                <div className="mb-2 flex items-center gap-2 text-sm">
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                    EC · {row.ec_no ?? "—"}
                                  </span>
                                </div>
                                {boiYes ? (
                                  // Inline BOI items — add/edit/delete right here,
                                  // no separate modal to open.
                                  <OrderChildList
                                    orderId={row.id}
                                    table="order_boi_items"
                                    title="Bought-out items"
                                    fields={BOI_ITEM_FIELDS}
                                    rows={(row.boi_items ?? []) as Row[]}
                                    canEdit={canEdit}
                                  />
                                ) : (
                                  <p className="text-xs text-muted">
                                    No BOI — nothing to record for this EC.
                                  </p>
                                )}
                              </div>
                            ))}
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
    </div>
  );
}
