"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

/**
 * Client-side search + pagination over an in-memory row list.
 * `getText` returns the searchable text for a row.
 */
export function useTableSearch<T>(
  rows: T[],
  getText: (row: T) => string,
  pageSize = 15
) {
  const [query, setQueryRaw] = useState("");
  const [page, setPage] = useState(1);

  function setQuery(value: string) {
    setQueryRaw(value);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => getText(r).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return {
    query,
    setQuery,
    page: current,
    setPage,
    totalPages,
    pageRows,
    total,
    from,
    to,
  };
}

/** A faceted filter over a row list: one dropdown per definition. */
export type FilterDef<T> = {
  key: string;
  label: string;
  getValue: (row: T) => string | null;
  // Fixed dropdown options (e.g. a status enum). When set, these are used
  // as-is instead of the values actually present in the data — so a status
  // like "Pending" still shows up even before any row has it.
  staticOptions?: string[];
};

/**
 * Text search + faceted dropdown filters + per-column text filters +
 * pagination over an in-memory list. Dropdown options are derived from the
 * values present in the data, so a filter never offers a choice that would
 * yield zero rows on its own.
 */
export function useTableFilters<T>(
  rows: T[],
  getText: (row: T) => string,
  filters: FilterDef<T>[],
  textFilters: FilterDef<T>[] = [],
  pageSize = 15
) {
  const [query, setQueryRaw] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  function setQuery(value: string) {
    setQueryRaw(value);
    setPage(1);
  }
  function setFilter(key: string, value: string) {
    setSelected((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }
  function setTextFilter(key: string, value: string) {
    setTextValues((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }
  function clearAll() {
    setSelected({});
    setTextValues({});
    setQueryRaw("");
    setPage(1);
  }

  // Distinct, sorted option values per dropdown filter, from the full row
  // set — unless the filter defines its own fixed option list.
  const options = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const def of filters) {
      if (def.staticOptions) {
        map[def.key] = def.staticOptions;
        continue;
      }
      const set = new Set<string>();
      for (const row of rows) {
        const v = def.getValue(row);
        if (v && v.trim() !== "") set.add(v.trim());
      }
      map[def.key] = [...set].sort((a, b) => a.localeCompare(b));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !getText(r).toLowerCase().includes(q)) return false;
      for (const def of filters) {
        const sel = selected[def.key];
        if (sel && (def.getValue(r) ?? "").trim() !== sel) return false;
      }
      for (const def of textFilters) {
        const val = (textValues[def.key] ?? "").trim().toLowerCase();
        if (val && !(def.getValue(r) ?? "").toLowerCase().includes(val)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, selected, textValues]);

  const activeCount =
    Object.values(selected).filter(Boolean).length +
    Object.values(textValues).filter((v) => v.trim() !== "").length;
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return {
    query,
    setQuery,
    selected,
    setFilter,
    textValues,
    setTextFilter,
    clearAll,
    options,
    activeCount,
    page: current,
    setPage,
    totalPages,
    pageRows,
    total,
    from,
    to,
  };
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const active = value !== "";
  return (
    <div className="relative w-32 shrink-0 sm:w-36">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className={`h-9 w-full appearance-none rounded-lg border bg-surface pl-2.5 pr-7 text-xs transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 ${
          active
            ? "border-primary font-medium text-foreground"
            : "border-input-border text-muted-foreground hover:border-muted-foreground/40"
        }`}
      >
        <option value="">{label}: All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      />
    </div>
  );
}

function FilterTextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const active = value.trim() !== "";
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      aria-label={label}
      className={`h-9 w-28 shrink-0 rounded-lg border bg-surface px-2.5 text-xs transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 sm:w-32 ${
        active
          ? "border-primary font-medium text-foreground"
          : "border-input-border text-foreground hover:border-muted-foreground/40"
      }`}
    />
  );
}

/**
 * A modern filter toolbar: search box + a dropdown per filter definition +
 * an input per text-filter definition, with an active-filter count and a
 * one-click clear. Pair with `useTableFilters`.
 */
export function FilterBar<T>({
  filters,
  options,
  selected,
  setFilter,
  textFilters = [],
  textValues = {},
  setTextFilter,
  query,
  setQuery,
  activeCount,
  clearAll,
  total,
  searchPlaceholder = "Search…",
}: {
  filters: FilterDef<T>[];
  options: Record<string, string[]>;
  selected: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  textFilters?: FilterDef<T>[];
  textValues?: Record<string, string>;
  setTextFilter?: (key: string, value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  activeCount: number;
  clearAll: () => void;
  total: number;
  searchPlaceholder?: string;
}) {
  const hasQuery = query.trim() !== "";
  return (
    <div className="mb-4 rounded-xl border border-card-border bg-surface p-3 shadow-sm">
      {/* Row 1 — free-text search. */}
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-10 w-full rounded-lg border border-input-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>

      {/* Row 2 — compact faceted filters. */}
      {(textFilters.length > 0 || filters.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {textFilters.map((def) => (
            <FilterTextInput
              key={def.key}
              label={def.label}
              value={textValues[def.key] ?? ""}
              onChange={(v) => setTextFilter?.(def.key, v)}
            />
          ))}
          {filters.map((def) => (
            <FilterSelect
              key={def.key}
              label={def.label}
              value={selected[def.key] ?? ""}
              options={options[def.key] ?? []}
              onChange={(v) => setFilter(def.key, v)}
            />
          ))}
        </div>
      )}

      {(activeCount > 0 || hasQuery) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-card-border pt-3 text-xs text-muted">
          <span>
            {total} {total === 1 ? "result" : "results"}
            {activeCount > 0 &&
              ` · ${activeCount} filter${activeCount === 1 ? "" : "s"} active`}
          </span>
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-input-border px-2.5 py-1 font-medium text-foreground transition-colors hover:bg-background"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-input-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
      />
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  setPage,
  from,
  to,
  total,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  from: number;
  to: number;
  total: number;
}) {
  if (total === 0) return null;

  const stepClass =
    "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input-border text-foreground transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border px-4 py-3 text-sm text-muted">
      <span>
        Showing {from}–{to} of {total}
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
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              aria-current={p === page ? "page" : undefined}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors ${
                p === page
                  ? "bg-primary text-primary-foreground"
                  : "border border-input-border text-foreground hover:bg-background"
              }`}
            >
              {p}
            </button>
          )
        )}
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

/** Page numbers with ellipsis for large page counts. */
function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: (number | "…")[] = [1];
  if (page > 3) pages.push("…");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (page < totalPages - 2) pages.push("…");
  pages.push(totalPages);
  return pages;
}
