"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { setDeptCompleteAction } from "@/app/risansi/orders/actions";
import {
  describeDays,
  DEPT_LABELS,
  type DeptCompletion,
  type DeptKey,
} from "@/lib/dept-completion";

function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * A department's sign-off on one SO or EC.
 *
 * Ticking it is a claim other people act on — Central stops chasing, the day
 * count is frozen — so it confirms first, and says what the answer will be
 * recorded as. Unticking confirms too, since reopening moves the number.
 */
export function DeptCompleteCheck({
  scopeId,
  dept,
  label,
  completion,
  canEdit,
}: {
  scopeId: string;
  dept: DeptKey;
  // What the row is, for the confirmation text: "EC/26/1/1385/39956".
  label: string;
  completion: DeptCompletion | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const took = completion ? describeDays(completion.days_taken) : null;

  async function toggle() {
    const complete = !completion;
    const message = complete
      ? `Mark ${DEPT_LABELS[dept]} complete for ${label}?\n\nThis records today as the completion date and how long it took against the original target. You can undo it.`
      : `Reopen ${DEPT_LABELS[dept]} for ${label}?\n\nThe recorded completion date and day count will be discarded.`;
    if (!confirm(message)) return;

    setSaving(true);
    setError(null);
    const result = await setDeptCompleteAction(scopeId, dept, complete);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (!canEdit) {
    // Everyone else still sees the outcome, just not the control.
    return completion ? (
      <span
        title={`Completed ${formatDate(completion.completed_on)}${took ? ` · ${took}` : ""}`}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"
      >
        <Check className="h-3.5 w-3.5" />
        Done
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <label className="inline-flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={!!completion}
          disabled={saving}
          onChange={toggle}
          aria-label={`${DEPT_LABELS[dept]} complete for ${label}`}
          className="h-4 w-4 cursor-pointer rounded border-input-border accent-emerald-600 disabled:cursor-not-allowed"
        />
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span
            className={`text-[11px] font-medium ${
              completion ? "text-emerald-700" : "text-muted-foreground"
            }`}
          >
            {completion ? "Done" : "Complete"}
          </span>
        )}
      </label>
      {completion && (
        <span className="text-[10px] text-muted-foreground">
          {formatDate(completion.completed_on)}
          {took ? ` · ${took}` : ""}
        </span>
      )}
      {error && (
        <span role="alert" className="text-[10px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/** Pick the sign-off for one row out of an SO's set. */
export function completionFor(
  completions: DeptCompletion[],
  dept: DeptKey,
  scopeId: string,
  perEc: boolean
): DeptCompletion | null {
  return (
    completions.find(
      (c) =>
        c.dept === dept &&
        (perEc ? c.item_id === scopeId : c.item_id === null)
    ) ?? null
  );
}
