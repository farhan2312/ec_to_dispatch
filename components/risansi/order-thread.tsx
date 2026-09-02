"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { isCentral, roleLabel } from "@/lib/roles";
import type { LaneSummary, OrderMessage } from "@/lib/order-messages";
import {
  listLanesAction,
  openThreadAction,
  postMessageAction,
} from "@/app/risansi/orders/thread-actions";

const MAX_MESSAGE_LENGTH = 2000;

function stamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Always date + time — a thread spans weeks, so a bare clock is ambiguous.
  // The year is dropped for the current year to keep the line short.
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

/**
 * One SO's discussion. Lanes are per department and never cross: a department
 * user sees only their own lane, Central Visibility / Admin pick which
 * department they're talking to.
 *
 * An entry is either a plain note or one flagged as a delay. A delay is the
 * same message, marked and dated by when it was logged, so the reason for a
 * hold-up stays on the order.
 */
export function OrderThread({
  orderId,
  role,
  soLabel,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: {
  orderId: string;
  role: string;
  soLabel?: string;
  className?: string;
  // Adds the expand/collapse control to the header. The modal keeps it off
  // — there is nothing to collapse into there.
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const central = isCentral(role);
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);
  const [lanes, setLanes] = useState<LaneSummary[]>([]);
  const [lane, setLane] = useState<string | null>(central ? null : role);
  const [messages, setMessages] = useState<OrderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Composer — a note, or the same message flagged as a delay.
  const [mode, setMode] = useState<"note" | "delay">("note");
  const [body, setBody] = useState("");

  async function refreshLanes() {
    const res = await listLanesAction(orderId);
    if (res.ok) setLanes(res.lanes);
  }

  // Pick the lane worth showing first: unread, else most recently active,
  // else the first department. Department users only ever have their own.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listLanesAction(orderId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setLanes(res.lanes);
      if (!central) return; // lane already fixed to the user's own role
      const best =
        res.lanes.find((l) => l.unread > 0) ??
        [...res.lanes]
          .filter((l) => l.last_at)
          .sort((a, b) => (a.last_at! < b.last_at! ? 1 : -1))[0] ??
        res.lanes[0];
      setLane(best?.dept_role ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, central]);

  // Load the selected lane — only once the panel is open.
  useEffect(() => {
    if (!lane || !open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await openThreadAction(orderId, lane);
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setMessages([]);
        return;
      }
      setError(null);
      setMessages(res.messages);
      // The lane is read now — clear its badge without another round trip.
      setLanes((prev) =>
        prev.map((l) => (l.dept_role === lane ? { ...l, unread: 0 } : l))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, lane, open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!lane || body.trim() === "" || sending) return;
    setSending(true);
    const res = await postMessageAction(orderId, lane, body, mode);
    setSending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setBody("");
    setMode("note");
    setMessages(res.messages);
    refreshLanes();
  }

  const laneLabel = lane ? roleLabel(lane) : "";
  // Header summary, so a collapsed card still shows there is something here.
  const totalUnread = lanes.reduce((n, l) => n + l.unread, 0);
  const totalMessages = lanes.reduce((n, l) => n + l.total, 0);
  const Header = collapsible ? "button" : "div";

  const delayCount = messages.filter((m) => m.kind === "delay").length;

  return (
    <section
      className={`rounded-xl border border-card-border bg-surface shadow-sm ${className}`}
    >
      <Header
        className={`flex w-full flex-wrap items-center justify-between gap-2 px-5 py-4 text-left ${
          open ? "border-b border-card-border" : ""
        }`}
        {...(collapsible
          ? {
              type: "button" as const,
              onClick: () => setOpen((v) => !v),
              "aria-expanded": open,
            }
          : {})}
      >
        <div className="flex items-center gap-2">
          {collapsible &&
            (open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ))}
          <MessageSquare className="h-4 w-4 text-primary" />
          <h2 className="font-display text-base font-semibold text-foreground">
            Discussion
          </h2>
          {totalUnread > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">
              {totalUnread}
            </span>
          )}
          {delayCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              {delayCount} delay
              {delayCount === 1 ? "" : "s"}
            </span>
          )}
          {!open && totalUnread === 0 && totalMessages > 0 && (
            <span className="text-xs text-muted">{totalMessages}</span>
          )}
        </div>
        <p className="text-xs text-muted">
          {central
            ? "Each department is a separate conversation — they can't see each other's."
            : `Visible to you and Central Visibility only${soLabel ? ` · SO ${soLabel}` : ""}.`}
        </p>
      </Header>

      {/* Central picks the department lane; a department user has just one. */}
      {open && central && lanes.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-card-border px-4 py-2.5">
          {lanes.map((l) => {
            const active = l.dept_role === lane;
            return (
              <button
                key={l.dept_role}
                type="button"
                onClick={() => setLane(l.dept_role)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-card-border bg-background text-muted hover:text-foreground"
                }`}
              >
                {roleLabel(l.dept_role)}
                {l.unread > 0 ? (
                  <span
                    className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                      active
                        ? "bg-primary-foreground text-primary"
                        : "bg-rose-600 text-white"
                    }`}
                  >
                    {l.unread}
                  </span>
                ) : (
                  l.total > 0 && (
                    <span
                      className={`text-[10px] font-medium ${active ? "opacity-80" : "opacity-70"}`}
                    >
                      {l.total}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <>
          <div className="max-h-96 min-h-[10rem] space-y-3 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted">
                No messages yet
                {central && laneLabel ? ` with ${laneLabel}` : ""}. Post an
                update, or log a delay so the reason stays on this order.
              </p>
            ) : (
              messages.map((m) => {
                // --- delay: the same message, flagged and dated.
                if (m.kind === "delay") {
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
                    >
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                          <AlertTriangle className="h-3 w-3" />
                          Delay
                        </span>
                        <span className="text-[11px] font-semibold text-amber-900">
                          {stamp(m.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm text-amber-950">
                        {m.body}
                      </p>
                      <div className="mt-1.5 text-[11px] text-amber-800">
                        {m.author_name} · {roleLabel(m.author_role)}
                      </div>
                    </div>
                  );
                }
                // --- plain note: chat bubble.
                return (
                  <div
                    key={m.id}
                    className={`flex ${m.mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                        m.mine
                          ? "bg-primary text-primary-foreground"
                          : "border border-card-border bg-background text-foreground"
                      }`}
                    >
                      {!m.mine && (
                        <div className="mb-0.5 text-[11px] font-semibold text-primary">
                          {m.author_name}
                          <span className="ml-1 font-normal text-muted-foreground">
                            {roleLabel(m.author_role)}
                          </span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {m.body}
                      </p>
                      <div
                        className={`mt-1 text-[10px] ${
                          m.mine
                            ? "text-primary-foreground/70"
                            : "text-muted-foreground"
                        }`}
                      >
                        {stamp(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          {error && (
            <p role="alert" className="px-5 pb-2 text-xs text-danger">
              {error}
            </p>
          )}

          <form
            onSubmit={send}
            className="space-y-2.5 border-t border-card-border px-5 py-4"
          >
            {/* Note vs delay decides whether the structured fields appear. */}
            <div className="inline-flex rounded-lg border border-card-border p-0.5">
              {(["note", "delay"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`h-7 rounded-md px-3 text-xs font-semibold transition-colors ${
                    mode === value
                      ? value === "delay"
                        ? "bg-amber-600 text-white"
                        : "bg-primary text-primary-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {value === "note" ? "Note" : "Log a delay"}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter makes a new line.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(e);
                  }
                }}
                rows={2}
                maxLength={MAX_MESSAGE_LENGTH}
                disabled={!lane || sending}
                placeholder={
                  mode === "delay"
                    ? "What exactly is holding it up?"
                    : central && laneLabel
                      ? `Message ${laneLabel}…`
                      : "Add an update…"
                }
                className="min-h-[2.75rem] flex-1 resize-y rounded-[10px] border border-input-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!lane || sending || body.trim() === ""}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  mode === "delay"
                    ? "bg-amber-600 text-white hover:bg-amber-700"
                    : "bg-primary text-primary-foreground hover:bg-primary-hover"
                }`}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === "delay" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {mode === "delay" ? "Log delay" : "Send"}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
