/**
 * An SO Central Visibility has put on hold: the badge says so, with the reason
 * (and the remarks on hover), wherever a department meets the SO. It is for
 * information — the departments' work on it carries on.
 */
export function HoldBadge({ order }: { order: Record<string, unknown> }) {
  if (String(order.clearance_status ?? "") !== "Hold") return null;
  const reason = String(order.clearance_hold_reason ?? "").trim();
  const remarks = String(order.clearance_remarks ?? "").trim();
  return (
    <span
      title={[reason, remarks].filter(Boolean).join(" — ") || "On hold"}
      className="mt-1 flex w-fit max-w-[14rem] flex-col rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] leading-tight text-rose-700"
    >
      <span className="font-semibold">On hold</span>
      {reason && <span className="whitespace-normal">{reason}</span>}
    </span>
  );
}

/** The same, as a banner across the top of the SO's own page. */
export function HoldBanner({ order }: { order: Record<string, unknown> }) {
  if (String(order.clearance_status ?? "") !== "Hold") return null;
  const reason = String(order.clearance_hold_reason ?? "").trim();
  const remarks = String(order.clearance_remarks ?? "").trim();
  return (
    <div role="status" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <p className="font-semibold">On hold{reason ? ` — ${reason}` : ""}</p>
      {remarks && <p className="mt-0.5">{remarks}</p>}
      <p className="mt-0.5 text-xs text-rose-700/80">Central Visibility has put this SO on hold.</p>
    </div>
  );
}
