"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Pencil, Trash2, Truck } from "lucide-react";
import { deleteOrderChildAction } from "@/app/risansi/orders/actions";
import { nextStep, stepsDone, type DispatchStepKey } from "@/lib/dispatch-steps";
import { DispatchWizard } from "./dispatch-wizard";

type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function day(v: unknown): string {
  const s = str(v).slice(0, 10);
  if (!s) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

/** "a · b", skipping the blanks. */
const line = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/**
 * Dispatch's view of an SO, on the queue row itself: one line per dispatch —
 * the packing slips it carries, then its Invoice (or Challan), Dispatch and
 * Docket & LR, each filled in or "—" — and one line per packing slip still
 * waiting, with a tick. Tick the slips going out together and New dispatch
 * opens the step-by-step pop-up; Continue picks a dispatch up where it stopped.
 */
export function DispatchInline({
  orderId,
  slips,
  invoices,
  billType,
  canEdit,
}: {
  orderId: string;
  slips: Row[];
  invoices: Row[];
  billType: unknown;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [wizard, setWizard] = useState<
    { invoice: Row | null; slipIds?: string[]; label: string; step?: DispatchStepKey } | null
  >(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const challan = str(billType) === "Challan";

  const waiting = slips.filter((s) => !str(s.invoice_id));
  const slipName = (s: Row) => str(s.packing_slip_no) || "—";
  const slipsOf = (inv: Row) => {
    const own = Array.isArray(inv.slips) ? (inv.slips as Row[]) : [];
    return own.length ? own.map(slipName).join(", ") : "—";
  };

  async function remove(inv: Row, n: number) {
    if (!confirm(`Delete dispatch #${n}? Its packing slips go back to waiting.`)) return;
    setDeleting(str(inv.id));
    const res = await deleteOrderChildAction(str(inv.id), "order_invoices", orderId);
    setDeleting(null);
    if (!res.ok) alert(res.error);
    else router.refresh();
  }

  if (slips.length === 0 && invoices.length === 0) {
    return <span className="text-xs text-muted">No packing slip yet</span>;
  }

  const step = (done: boolean, text: string) =>
    text ? (
      <span className={done ? "text-foreground" : "text-amber-700"}>{text}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  return (
    <div className="w-[40rem]">
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[1.75rem]" />
          <col className="w-[8.5rem]" />
          <col className="w-[9rem]" />
          <col className="w-[8rem]" />
          <col className="w-[7.5rem]" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="pb-1" />
            <th className="pb-1 pr-1.5 whitespace-nowrap">Packing slip</th>
            <th className="pb-1 pr-1.5 whitespace-nowrap">{challan ? "Challan" : "Invoice"}</th>
            <th className="pb-1 pr-1.5 whitespace-nowrap">Dispatch</th>
            <th className="pb-1 pr-1.5 whitespace-nowrap">Docket &amp; LR</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody className="[&>tr:nth-child(odd)]:bg-slate-100/70 dark:[&>tr:nth-child(odd)]:bg-white/[0.04]">
          {invoices.map((inv, i) => {
            const n = i + 1;
            const done = stepsDone(inv, billType);
            const all = done.invoice && done.dispatch && done.docket;
            const invoiceText = challan
              ? line(str(inv.challan_no), day(inv.challan_date))
              : line(str(inv.invoice_no), day(inv.invoice_date));
            const dispatchText = line(str(inv.delivery_mode), day(inv.delivery_date));
            const lr = str(inv.lr_link);
            const lrHref = /^https?:\/\//i.test(lr) ? lr : "";
            return (
              <tr key={str(inv.id) || i} className="align-top">
                <td className="rounded-l-md py-1.5 pl-1.5 text-[10px] font-semibold text-muted-foreground">#{n}</td>
                <td className="py-1.5 pr-1.5 break-words font-medium text-foreground">{slipsOf(inv)}</td>
                <td className="py-1.5 pr-1.5 break-words">{step(done.invoice, invoiceText)}</td>
                <td className="py-1.5 pr-1.5 break-words">{step(done.dispatch, dispatchText)}</td>
                <td className="py-1.5 pr-1.5 break-words">
                  {step(done.docket, str(inv.docket_no))}
                  {lrHref && (
                    <a
                      href={lrHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                      LR
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
                <td className="py-1.5 pr-1 text-right whitespace-nowrap">
                  {canEdit && (
                    <span className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setWizard({
                            invoice: inv,
                            label: `Dispatch #${n} · Packing Slip ${slipsOf(inv)}`,
                            step: all ? "invoice" : nextStep(inv, billType),
                          })
                        }
                        title={all ? "Edit dispatch" : "Continue dispatch"}
                        className="inline-flex h-6 items-center gap-1 rounded-md border border-input-border px-1.5 text-[11px] font-medium text-foreground hover:bg-background"
                      >
                        <Pencil className="h-3 w-3" />
                        {all ? "Edit" : "Continue"}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(inv, n)}
                        disabled={deleting === str(inv.id)}
                        aria-label={`Delete dispatch #${n}`}
                        className="rounded p-0.5 text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {deleting === str(inv.id) ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {/* Packing slips not on a dispatch yet. */}
          {waiting.map((s) => {
            const id = str(s.id);
            return (
              <tr key={id} className="align-top">
                <td className="rounded-l-md py-1.5 pl-1.5">
                  {canEdit && (
                    <input
                      type="checkbox"
                      aria-label={`Send packing slip ${slipName(s)}`}
                      checked={picked.has(id)}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                      className="h-3.5 w-3.5 accent-primary"
                    />
                  )}
                </td>
                <td className="py-1.5 pr-1.5 break-words font-medium text-foreground">
                  {slipName(s)}
                  {day(s.packing_slip_date) && (
                    <span className="block text-[11px] font-normal text-muted">{day(s.packing_slip_date)}</span>
                  )}
                </td>
                <td colSpan={4} className="py-1.5 pr-1.5">
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Waiting to dispatch
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canEdit && waiting.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const ids = [...picked];
            setWizard({
              invoice: null,
              slipIds: ids,
              label: `Packing Slip${ids.length > 1 ? "s" : ""} ${waiting
                .filter((s) => picked.has(str(s.id)))
                .map(slipName)
                .join(", ")}`,
            });
          }}
          disabled={picked.size === 0}
          className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <Truck className="h-3.5 w-3.5" />
          {picked.size > 0 ? `New dispatch (${picked.size} slip${picked.size === 1 ? "" : "s"})` : "Tick slips for a new dispatch"}
        </button>
      )}

      {wizard && (
        <DispatchWizard
          orderId={orderId}
          billType={billType}
          invoice={wizard.invoice}
          slipIds={wizard.slipIds}
          slipsLabel={wizard.label}
          startStep={wizard.step}
          onClose={() => {
            setWizard(null);
            setPicked(new Set());
          }}
        />
      )}
    </div>
  );
}
