"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Copy, Download, Loader2, Upload } from "lucide-react";
import {
  importOrdersAction,
  type ImportOrdersResult,
} from "@/app/risansi/orders/actions";

export function ImportOrdersPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<
    Extract<ImportOrdersResult, { ok: true }> | null
  >(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function resetFile() {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Please choose an Excel (.xlsx) file.");
      return;
    }
    setError(null);
    setResult(null);
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
    <div className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
      <h2 className="mb-1 font-display text-base font-semibold text-foreground">
        Upload file
      </h2>
      <p className="mb-4 text-sm text-muted">
        Choose an .xlsx file. Matching columns are detected automatically — the
        first recognizable header row is used.
      </p>

      {result ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-5 w-5" />
            Imported {result.inserted} {result.inserted === 1 ? "order" : "orders"}
            {result.skipped > 0 && ` · skipped ${result.skipped} empty rows`}.
          </div>
          <button
            type="button"
            onClick={resetFile}
            className="mt-3 inline-flex h-9 items-center rounded-lg border border-emerald-300 bg-white px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            Import another file
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger">
              {error}
            </div>
          )}

          <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input-border bg-background/40 px-4 py-10 text-center transition-colors hover:bg-background">
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {file ? file.name : "Choose a file"}
            </span>
            <span className="text-xs text-muted-foreground">.xlsx or .xls</span>
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

          <button
            type="submit"
            disabled={isImporting || !file}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {isImporting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isImporting ? "Importing…" : "Import"}
          </button>
        </form>
      )}
    </div>
  );
}

export function HeaderReference({
  title,
  description,
  headers,
  templateType,
}: {
  title: string;
  description: string;
  headers: string[];
  templateType: "system" | "bulk";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(headers.join("\t"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <div className="rounded-xl border border-card-border bg-surface p-6 shadow-sm">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-foreground">
          {title}
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {headers.length} columns
        </span>
      </div>
      <p className="mb-4 text-sm text-muted">{description}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href={`/api/orders/template?type=${templateType}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <Download className="h-3.5 w-3.5" />
          Download template
        </a>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-background"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied!" : "Copy headers"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {headers.map((h, i) => (
          <span
            key={h}
            className="inline-flex items-center gap-1 rounded-md border border-card-border bg-background/50 px-2 py-0.5 text-xs text-foreground"
          >
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            {h}
          </span>
        ))}
      </div>
    </div>
  );
}
