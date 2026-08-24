"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { getOrderCoreAction } from "@/app/risansi/orders/actions";
import { SECTION_BY_TABLE } from "@/lib/order-schema";
import { formatDisplay } from "./editable-section";

const CORE = SECTION_BY_TABLE.get("orders")!;

/** Read-only popup of an SO's core "Order details", fetched on open. */
export function OrderDetailsModal({
  orderId,
  onClose,
}: {
  orderId: string;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getOrderCoreAction(orderId).then((o) => {
      if (!active) return;
      setOrder(o);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [orderId]);

  const soLabel = order
    ? String(order.so_no ?? `#${order.sl_no ?? "—"}`)
    : "";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-card-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-1 font-display text-lg font-semibold text-foreground">
          Order details
        </h2>
        {order && (
          <p className="mb-5 text-sm text-muted">
            SO {soLabel}
            {order.client_name ? ` · ${String(order.client_name)}` : ""}
          </p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : !order ? (
          <p className="py-10 text-sm text-muted">Order not found.</p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {CORE.fields.map((field) => (
              <div key={field.column}>
                <div className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                  {field.label}
                </div>
                <div className="text-[14px] text-foreground">
                  {formatDisplay(field, order[field.column])}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
