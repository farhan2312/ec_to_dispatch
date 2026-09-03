"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";

/**
 * URL-backed table state. The server reads these params to fetch one page, so
 * every control here writes to the query string rather than to local state —
 * that's what makes search, filters and paging act on the whole table instead
 * of on the rows already in the browser.
 */
export function useUrlTable() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParams = useCallback(
    (changes: Record<string, string | string[] | null>, resetPage = true) => {
      const next = new URLSearchParams(params?.toString() ?? "");
      for (const [key, value] of Object.entries(changes)) {
        const flat = Array.isArray(value) ? value.join(",") : value;
        if (flat === null || flat === "") next.delete(key);
        else next.set(key, flat);
      }
      // Any change other than paging itself puts the user back on page 1 —
      // otherwise a narrower search can land them past the last page.
      if (resetPage) next.delete("page");
      const qs = next.toString();
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [params, pathname, router]
  );

  return {
    pending,
    get: (key: string) => params?.get(key) ?? "",
    getList: (key: string) =>
      (params?.get(key) ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    setParams,
    setPage: (page: number) =>
      setParams({ page: page <= 1 ? null : String(page) }, false),
  };
}

/**
 * Search box bound to a URL param. Typing is debounced so each keystroke isn't
 * a server round-trip, and the value is kept locally in between so the input
 * never lags behind the user.
 */
export function UrlSearchInput({
  paramKey = "q",
  placeholder = "Search…",
  className = "",
}: {
  paramKey?: string;
  placeholder?: string;
  className?: string;
}) {
  const { get, setParams, pending } = useUrlTable();
  const urlValue = get(paramKey);
  const [value, setValue] = useState(urlValue);
  const dirty = useRef(false);

  // Adopt external changes (back button, "Clear all") only while the user
  // isn't mid-edit.
  useEffect(() => {
    if (!dirty.current) setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    if (!dirty.current) return;
    const timer = setTimeout(() => {
      dirty.current = false;
      setParams({ [paramKey]: value.trim() || null });
    }, 300);
    return () => clearTimeout(timer);
  }, [value, paramKey, setParams]);

  return (
    <div className={`relative w-full sm:max-w-xs ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => {
          dirty.current = true;
          setValue(e.target.value);
        }}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-input-border bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
      {pending && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

/** Pager bound to the `page` param. Mirrors the look of the in-memory one. */
export function UrlPagination({
  page,
  totalPages,
  from,
  to,
  total,
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
}) {
  const { setPage, pending } = useUrlTable();
  if (total === 0) return null;

  const stepClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input-border text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50";

  // A short window around the current page, so 40 pages don't render 40 chips.
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const windowEnd = Math.min(totalPages, Math.max(page + 2, 5));
  const pages: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pages.push(p);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border px-4 py-3 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        Showing {from}–{to} of {total}
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={stepClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors ${
              p === page
                ? "bg-primary text-primary-foreground"
                : "border border-input-border text-foreground hover:bg-background"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className={stepClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** A row of chips that set a single-value URL param (status tabs, categories). */
export function UrlTabs({
  paramKey,
  options,
  fallback,
}: {
  paramKey: string;
  options: { value: string; label: string; count?: number }[];
  fallback: string;
}) {
  const { get, setParams } = useUrlTable();
  const active = get(paramKey) || fallback;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === active;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() =>
              setParams({ [paramKey]: o.value === fallback ? null : o.value })
            }
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              on
                ? "bg-primary text-primary-foreground"
                : "border border-input-border bg-surface text-foreground hover:bg-background"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={on ? "opacity-80" : "text-muted-foreground"}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Clears every table param at once. */
export function UrlClearFilters({ keys }: { keys: string[] }) {
  const { setParams, get, getList } = useUrlTable();
  const anyActive = keys.some((k) => (get(k) || getList(k).length > 0) !== false && get(k) !== "");
  if (!anyActive) return null;
  return (
    <button
      type="button"
      onClick={() =>
        setParams(Object.fromEntries(keys.map((k) => [k, null])))
      }
      className="inline-flex items-center gap-1 rounded-lg border border-input-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-background"
    >
      <X className="h-3.5 w-3.5" />
      Clear all
    </button>
  );
}
