// The orders-list filter: the same set the central dashboard offers, carried
// in the URL so it narrows the whole table in SQL rather than the page on
// screen, and so the Export button can send exactly the SOs being looked at.
//
// Plain module (no server imports): the filter bar, the page, the export
// route and the SQL builder all read one definition.

import {
  DEPT_FILTER_KEYS,
  DEPT_FILTER_LABELS,
  statusesFor,
  type DeptFilterKey,
} from "@/lib/dept-status";

export const ORDER_DATE_FIELDS = [
  { value: "dispatch_target", label: "Dispatch target" },
  { value: "so_date", label: "SO date" },
  { value: "ec_date", label: "EC date" },
  { value: "completed_on", label: "Completed on" },
] as const;

export type OrderDateField = (typeof ORDER_DATE_FIELDS)[number]["value"];

export const SIGN_OFF_OPTIONS = [
  { value: "completed", label: "Completed" },
  { value: "not_completed", label: "Not completed" },
] as const;

export type SignOff = (typeof SIGN_OFF_OPTIONS)[number]["value"];

export const DATE_PRESETS = [
  "Today",
  "Yesterday",
  "Last 7 days",
  "Last 30 days",
  "This month",
  "This year",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

/** Today as an IST calendar date — the dates on an order are IST dates. */
export function todayIst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** A preset's [from, to] as IST calendar dates. */
export function presetRange(preset: DatePreset): [string, string] {
  const today = todayIst();
  const shift = (days: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  switch (preset) {
    case "Today":
      return [today, today];
    case "Yesterday":
      return [shift(-1), shift(-1)];
    case "Last 7 days":
      return [shift(-6), today];
    case "Last 30 days":
      return [shift(-29), today];
    case "This month":
      return [`${today.slice(0, 7)}-01`, today];
    default:
      return [`${today.slice(0, 4)}-01-01`, today];
  }
}

export type OrderListFilter = {
  search: string;
  zones: string[];
  reps: string[];
  markets: string[];
  /** Order type on the SO, or the item type on any of its ECs. */
  types: string[];
  dept: DeptFilterKey | null;
  /** Only with a department — a status is that department's own word. */
  deptStatus: string | null;
  /** Only with a department — whose sign-off it is. */
  signOff: SignOff | null;
  dateField: OrderDateField;
  from: string | null;
  to: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function list(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    ),
  ];
}

function date(value: string | undefined): string | null {
  if (!value || !ISO_DATE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

/**
 * Read the filter out of the URL. Anything unrecognised is dropped rather than
 * trusted — the values end up in SQL, and a status only counts when it is one
 * the chosen department actually has.
 */
export function parseOrderListFilter(
  get: (key: string) => string | undefined
): OrderListFilter {
  const deptRaw = get("dept");
  const dept = (DEPT_FILTER_KEYS as readonly string[]).includes(deptRaw ?? "")
    ? (deptRaw as DeptFilterKey)
    : null;
  const status = dept
    ? (statusesFor(dept).find((s) => s === get("dstatus")) ?? null)
    : null;
  const signOffRaw = get("signoff");
  const signOff =
    dept && SIGN_OFF_OPTIONS.some((o) => o.value === signOffRaw)
      ? (signOffRaw as SignOff)
      : null;
  const fieldRaw = get("datefield");
  const dateField = ORDER_DATE_FIELDS.some((f) => f.value === fieldRaw)
    ? (fieldRaw as OrderDateField)
    : "dispatch_target";

  // Picked backwards, the two dates still mean the span between them.
  let from = date(get("from"));
  let to = date(get("to"));
  if (from && to && from > to) [from, to] = [to, from];

  return {
    search: (get("q") ?? "").trim(),
    zones: list(get("zone")),
    reps: list(get("rep")),
    markets: list(get("market")),
    types: list(get("type")),
    dept,
    deptStatus: status,
    signOff,
    dateField,
    from,
    to,
  };
}

/** Whether anything narrows the list at all. */
export function isOrderListFiltered(f: OrderListFilter): boolean {
  return !!(
    f.search ||
    f.zones.length ||
    f.reps.length ||
    f.markets.length ||
    f.types.length ||
    f.dept ||
    f.from ||
    f.to
  );
}

/** The filter as URL parameters — for the export link. */
export function orderListFilterParams(f: OrderListFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set("q", f.search);
  if (f.zones.length) p.set("zone", f.zones.join(","));
  if (f.reps.length) p.set("rep", f.reps.join(","));
  if (f.markets.length) p.set("market", f.markets.join(","));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.dept) p.set("dept", f.dept);
  if (f.deptStatus) p.set("dstatus", f.deptStatus);
  if (f.signOff) p.set("signoff", f.signOff);
  if (f.from || f.to) {
    p.set("datefield", f.dateField);
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  }
  return p;
}

/** One line saying what the list is narrowed to — the export's cover sheet. */
export function describeOrderListFilter(f: OrderListFilter): string {
  const parts: string[] = [];
  if (f.search) parts.push(`Search: ${f.search}`);
  if (f.zones.length) parts.push(`Zone: ${f.zones.join(", ")}`);
  if (f.reps.length) parts.push(`Rep: ${f.reps.join(", ")}`);
  if (f.markets.length) parts.push(`Market: ${f.markets.join(", ")}`);
  if (f.types.length) parts.push(`Type: ${f.types.join(", ")}`);
  if (f.dept) {
    const signed = SIGN_OFF_OPTIONS.find((o) => o.value === f.signOff)?.label;
    parts.push(
      [DEPT_FILTER_LABELS[f.dept], f.deptStatus, signed?.toLowerCase()]
        .filter(Boolean)
        .join(" · ")
    );
  }
  if (f.from || f.to) {
    const field = ORDER_DATE_FIELDS.find((d) => d.value === f.dateField)?.label;
    parts.push(
      `${field}: ${f.from ?? "…"} to ${f.to ?? "…"}`
    );
  }
  return parts.length ? parts.join("  ·  ") : "All orders";
}
