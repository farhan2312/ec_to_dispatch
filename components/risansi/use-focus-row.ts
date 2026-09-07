"use client";

import { useEffect, useState } from "react";

/**
 * Scroll a deep-linked row into view and flash a ring around it.
 *
 * Following a notification should land you *on* the SO/EC, not merely on the
 * page that contains it — the server picks the right page, this puts the row
 * in front of you. `ids` are tried in order, so an EC row wins over its SO
 * header row when both are on screen.
 */
export function useFocusRow(ids: (string | undefined | null)[], ready: boolean) {
  const [flashing, setFlashing] = useState<string | null>(null);
  const key = ids.filter(Boolean).join("|");

  useEffect(() => {
    if (!key || !ready) return;
    // Wait a frame so rows revealed by the expand effect are in the DOM.
    const raf = requestAnimationFrame(() => {
      for (const id of key.split("|")) {
        const el = document.querySelector<HTMLElement>(
          `[data-focus-row="${CSS.escape(id)}"]`
        );
        if (!el) continue;
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setFlashing(id);
        return;
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [key, ready]);

  // Fade the ring out on its own — it marks where you landed, it isn't state.
  useEffect(() => {
    if (!flashing) return;
    const t = setTimeout(() => setFlashing(null), 2600);
    return () => clearTimeout(t);
  }, [flashing]);

  return (id: string | undefined | null) =>
    id != null && id === flashing
      ? "ring-2 ring-inset ring-primary/70 bg-primary/[0.06]"
      : "";
}
