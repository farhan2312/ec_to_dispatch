"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

/**
 * A dropdown filter that accepts several values at once — the table's built-in
 * facets are single-select, so anything needing "these three zones" uses this.
 * Selecting nothing means no filtering at all.
 */
export function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter((v) => v !== option)
        : [...selected, option]
    );
  }

  const summary =
    selected.length === 0
      ? `All ${label.toLowerCase()}s`
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label} filter`}
        className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors ${
          selected.length > 0
            ? "border-primary/40 bg-primary/[0.06] text-foreground"
            : "border-input-border bg-surface text-foreground hover:bg-background"
        }`}
      >
        <span className="text-muted">{label}:</span>
        <span className="font-medium">{summary}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 z-30 mt-1.5 max-h-72 w-56 overflow-y-auto rounded-lg border border-card-border bg-surface py-1 shadow-lg">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">No values.</p>
          ) : (
            <>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="mb-1 flex w-full items-center gap-1.5 border-b border-card-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear selection
                </button>
              )}
              {options.map((option) => {
                const checked = selected.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-background"
                  >
                    <span
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input-border"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {option}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
