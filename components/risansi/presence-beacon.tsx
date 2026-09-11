"use client";

import { useEffect } from "react";

/** How often a present user is reported. One row per minute server-side. */
const BEAT_MS = 60_000;
/** Longer than this without a touch and the user is taken to have walked away. */
const IDLE_MS = 5 * 60_000;

const INPUT_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;

/**
 * Reports the user as active once a minute while they are actually using the
 * app: the tab is in front and they have touched it within the last five
 * minutes. A tab left open over lunch stops counting after five minutes; a
 * background tab never counts. This is what the audit log's Active Time sums.
 *
 * Renders nothing.
 */
export function PresenceBeacon() {
  useEffect(() => {
    let lastInput = Date.now();
    let lastBeat = 0;

    const present = () =>
      document.visibilityState === "visible" && Date.now() - lastInput < IDLE_MS;

    const beat = () => {
      if (!present()) return;
      // Several triggers can land in the same minute (a tab regaining focus,
      // the interval); the server dedupes, but there is no need to ask.
      if (Date.now() - lastBeat < BEAT_MS - 1_000) return;
      lastBeat = Date.now();
      fetch("/api/presence", { method: "POST", keepalive: true }).catch(() => {
        // A missed minute is not worth surfacing.
      });
    };

    // mousemove fires constantly; recording the time is all it does.
    const onInput = () => {
      const wasIdle = Date.now() - lastInput >= IDLE_MS;
      lastInput = Date.now();
      // Coming back from idle starts the minute now rather than at the next tick.
      if (wasIdle) beat();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };

    for (const e of INPUT_EVENTS) window.addEventListener(e, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(beat, BEAT_MS);
    beat();

    return () => {
      for (const e of INPUT_EVENTS) window.removeEventListener(e, onInput);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
