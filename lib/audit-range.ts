/**
 * Range presets for the audit log, shared by the page (which turns one into a
 * SQL cutoff) and the view (which renders the buttons). Plain module so both
 * sides agree on the keys.
 */

export type AuditRange = "today" | "7d" | "30d" | "all";
export type AuditTab = "by_user" | "activity" | "logins" | "ownership";

export const AUDIT_RANGES: { key: AuditRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All" },
];

export const AUDIT_TABS: { key: AuditTab; label: string }[] = [
  { key: "by_user", label: "Usage by User" },
  { key: "activity", label: "Activity" },
  { key: "logins", label: "Logins & Sessions" },
  { key: "ownership", label: "Ownership Changes" },
];

/** Which `audit_log.category` each event tab shows. */
export const AUDIT_CATEGORY_BY_TAB: Record<string, string | null> = {
  by_user: null,
  activity: "activity",
  logins: "auth",
  ownership: "ownership",
};

const DAY = 86_400_000;

/**
 * Midnight IST today. Not `setHours(0,0,0,0)`, which zeroes the *runtime's*
 * local timezone — UTC on the server, the browser's tz after hydration — and
 * would split "Today" across two different cutoffs.
 */
function todayStartIst(): Date {
  const isoDate = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  return new Date(`${isoDate}T00:00:00+05:30`);
}

/** The SQL cutoff for a range preset — null means "no lower bound". */
export function auditSince(range: string): string | null {
  const now = Date.now();
  if (range === "today") return todayStartIst().toISOString();
  if (range === "7d") return new Date(now - 7 * DAY).toISOString();
  if (range === "30d") return new Date(now - 30 * DAY).toISOString();
  return null;
}
