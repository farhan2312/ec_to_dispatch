"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Truck } from "lucide-react";
import { createDispatchAction } from "@/app/risansi/orders/actions";

type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function formatDate(value: unknown): string {
  const s = str(value).slice(0, 10);
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * The SO's packing slips as Dispatch sees them: which have gone out on a
 * despatch and which are waiting. Tick one or more waiting slips and raise a
 * despatch — one invoice / challan card for all of them.
 */
export function DispatchSlipPicker({
  orderId,
  slips,
  invoices,
  canEdit,
}: {
  orderId: string;
  slips: Row[];
  /** The SO's despatch cards, in order — to say which one a slip went out on. */
  invoices: Row[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cardNo = new Map(invoices.map((inv, i) => [str(inv.id), i + 1]));
  const waiting = slips.filter((s) => !str(s.invoice_id));

  async function raise() {
    setSaving(true);
    setError(null);
    const res = await createDispatchAction(orderId, [...picked]);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPicked(new Set());
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-card-border bg-surface p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">Packing slips</h3>
          <p className="text-xs text-muted">
            {slips.length === 0
              ? "No packing slip yet."
              : `${slips.length - waiting.length} of ${slips.length} on a despatch · tick the slips going out together, then raise one despatch for them.`}
          </p>
        </div>
        {canEdit && waiting.length > 0 && (
          <button
            type="button"
            onClick={raise}
            disabled={picked.size === 0 || saving}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
            New dispatch{picked.size > 0 ? ` (${picked.size} slip${picked.size === 1 ? "" : "s"})` : ""}
          </button>
        )}
      </div>
      {error && <p className="mb-2 text-xs text-danger">{error}</p>}
      {slips.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {canEdit && <th className="w-8 px-2 py-1.5" />}
                <th className="px-2 py-1.5">Packing Slip No.</th>
                <th className="px-2 py-1.5">Date</th>
                <th className="px-2 py-1.5">Dispatch</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => {
                const id = str(s.id);
                const on = str(s.invoice_id);
                return (
                  <tr key={id} className="text-foreground">
                    {canEdit && (
                      <td className="px-2 py-1.5">
                        {!on && (
                          <input
                            type="checkbox"
                            aria-label={`Send packing slip ${str(s.packing_slip_no) || id}`}
                            checked={picked.has(id)}
                            onChange={(e) =>
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(id);
                                else next.delete(id);
                                return next;
                              })
                            }
                          />
                        )}
                      </td>
                    )}
                    <td className="px-2 py-1.5 whitespace-nowrap font-medium">{str(s.packing_slip_no) || "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-muted">{formatDate(s.packing_slip_date)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {on ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          On despatch #{cardNo.get(on) ?? "?"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Waiting
                        </span>
                      )}
                    </td>
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
