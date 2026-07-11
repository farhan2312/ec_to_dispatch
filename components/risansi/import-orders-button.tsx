"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
  importOrdersAction,
  type ImportOrdersResult,
} from "@/app/risansi/orders/actions";

export function ImportOrdersButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<
    Extract<ImportOrdersResult, { ok: true }> | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null);
    setError(null);
    setResult(null);
    setIsImporting(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please choose an Excel (.xlsx) file.");
      return;
    }
    setError(null);
    setIsImporting(true);

    const formData = new FormData();
    formData.append("file", file);
    const res = await importOrdersAction(formData);
    setIsImporting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResult(res);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-input-border bg-surface px-4 text-sm font-semibold text-foreground transition-colors hover:bg-background"
      >
        <Upload className="h-4 w-4" />
        Import Excel
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={close} aria-hidden />

          <div className="relative w-full max-w-md rounded-2xl border border-card-border bg-card p-6 shadow-xl">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>

            {result ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Import complete
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Imported <span className="font-semibold text-foreground">{result.inserted}</span>{" "}
                  {result.inserted === 1 ? "order" : "orders"}
                  {result.skipped > 0 && `, skipped ${result.skipped} empty rows`}.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-6 h-11 w-full rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2 className="mb-1 font-display text-lg font-semibold text-foreground">
                  Import orders from Excel
                </h2>
                <p className="mb-5 text-sm text-muted">
                  Upload an .xlsx file matching the tracker columns. Matching
                  columns are detected automatically.
                </p>

                <form onSubmit={handleSubmit}>
                  {error && (
                    <div
                      role="alert"
                      className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
                    >
                      {error}
                    </div>
                  )}

                  <label className="mb-5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input-border bg-surface px-4 py-8 text-center transition-colors hover:bg-background">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {file ? file.name : "Choose a file"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      .xlsx or .xls
                    </span>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        setFile(e.target.files?.[0] ?? null);
                        setError(null);
                      }}
                    />
                  </label>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={close}
                      className="h-11 flex-1 rounded-[10px] border border-input-border bg-surface text-sm font-medium text-foreground transition-colors hover:bg-background"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isImporting || !file}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
                    >
                      {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {isImporting ? "Importing..." : "Import"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
