// Value rules on order fields, shared by the forms (for their input bounds)
// and the server actions (which enforce them — a form is only a convenience,
// the action is a public endpoint). Plain module: safe to import anywhere.

import type { OrderField } from "@/lib/order-schema";

const amountFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** A submitted value as a number: null when blank, NaN when not a number. */
export function numericValue(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).replace(/,/g, "").trim();
  if (text === "") return null;
  return Number(text);
}

/**
 * Each field's own lower bound (\`min\`), over the fields a save actually
 * carries. Returns the first problem, worded for the person who made it.
 */
export function checkFieldBounds(
  fields: OrderField[],
  values: Record<string, unknown>
): string | null {
  for (const f of fields) {
    if (f.min === undefined || !(f.column in values)) continue;
    const n = numericValue(values[f.column]);
    if (n === null) continue;
    if (Number.isNaN(n)) return `${f.label} must be a number.`;
    if (n < f.min) {
      return f.min === 0
        ? `${f.label} cannot be negative.`
        : `${f.label} must be at least ${f.min}.`;
    }
  }
  return null;
}

/**
 * The amount received on an SO against its order value. Nothing to compare
 * while either is blank — Accounts may record a receipt before the value is in.
 */
export function checkReceivedWithinValue(
  received: number | null,
  orderValue: number | null,
  side: "received" | "order value"
): string | null {
  if (received === null || orderValue === null) return null;
  if (Number.isNaN(received) || Number.isNaN(orderValue)) return null;
  if (received <= orderValue) return null;
  return side === "received"
    ? `Amount received (${amountFmt.format(received)}) cannot be more than the order value (${amountFmt.format(orderValue)}).`
    : `Order value (${amountFmt.format(orderValue)}) cannot be less than the amount already received (${amountFmt.format(received)}).`;
}
