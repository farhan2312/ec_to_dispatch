"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createOrderAction } from "@/app/risansi/orders/actions";
import type { NewOrderInput } from "@/lib/orders";
import {
  INDUSTRY_TYPE_OPTIONS,
  NATURE_OF_SUPPLY_OPTIONS,
} from "@/lib/order-schema";

type FieldType = "text" | "date" | "number" | "select";
type Field = {
  name: keyof NewOrderInput;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
};
type Section = { title: string; fields: Field[] };

const SECTIONS: Section[] = [
  {
    title: "Order identity",
    fields: [
      { name: "so_no", label: "SO No.", type: "text" },
      { name: "ec_no", label: "EC No.", type: "text" },
      { name: "ec_generated_date", label: "EC Generated Date", type: "date" },
      { name: "ec_rcvd_operations_date", label: "EC Received in Operations", type: "date" },
      { name: "ec_sent_production_date", label: "EC Sent to Production", type: "date" },
      { name: "file_no", label: "File No.", type: "text" },
    ],
  },
  {
    title: "Client",
    fields: [
      { name: "client_code", label: "Client Code", type: "text" },
      { name: "client_type", label: "Client Type", type: "text" },
      { name: "party", label: "Party", type: "text" },
      { name: "agent", label: "Agent", type: "text" },
      {
        name: "nature_of_supply",
        label: "Nature of Supply",
        type: "select",
        options: NATURE_OF_SUPPLY_OPTIONS,
      },
      {
        name: "industry_type",
        label: "Industry Type",
        type: "select",
        options: INDUSTRY_TYPE_OPTIONS,
      },
    ],
  },
  {
    title: "Item",
    fields: [
      { name: "item", label: "Item", type: "text" },
      { name: "po_no", label: "PO No.", type: "text" },
      { name: "customer_po_date", label: "Customer PO Date", type: "date" },
      { name: "model_no", label: "Model No.", type: "text" },
      { name: "pump_qty", label: "If Pump (Qty)", type: "number" },
      { name: "orientation", label: "Orientation", type: "text" },
      { name: "liquid_application", label: "Liquid / Application", type: "text" },
      { name: "version", label: "Version", type: "text" },
    ],
  },
  {
    title: "Commercial",
    fields: [
      { name: "project", label: "Project", type: "text" },
      {
        name: "master_reason_of_delay",
        label: "Master Reason of Delay",
        type: "text",
      },
      { name: "order_value", label: "Order Value", type: "number" },
    ],
  },
];

const inputClass =
  "h-11 w-full rounded-[10px] border border-input-border bg-surface px-[13px] text-[14px] text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20";

export function OrderForm() {
  const router = useRouter();
  const [values, setValues] = useState<NewOrderInput>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function update(name: keyof NewOrderInput, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await createOrderAction(values);
    if (!result.ok) {
      setIsSubmitting(false);
      setError(result.error);
      return;
    }
    router.push("/risansi/orders");
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl">
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-[10px] border border-danger-border bg-danger-bg px-4 py-2.5 text-sm text-danger"
        >
          {error}
        </div>
      )}

      <div className="space-y-8">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-xl border border-card-border bg-surface p-6 shadow-sm"
          >
            <h2 className="mb-4 font-display text-base font-semibold text-foreground">
              {section.title}
            </h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((field) => (
                <div key={field.name}>
                  <label
                    htmlFor={field.name}
                    className="mb-1.5 block text-[13px] font-medium text-brand-label"
                  >
                    {field.label}
                  </label>
                  {field.type === "select" ? (
                    <select
                      id={field.name}
                      name={field.name}
                      value={values[field.name] ?? ""}
                      onChange={(e) => update(field.name, e.target.value)}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {field.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={field.name}
                      name={field.name}
                      type={field.type}
                      step={field.type === "number" ? "any" : undefined}
                      value={values[field.name] ?? ""}
                      onChange={(e) => update(field.name, e.target.value)}
                      className={inputClass}
                    />
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-70"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? "Creating..." : "Create order"}
        </button>
        <Link
          href="/risansi/orders"
          className="flex h-11 items-center justify-center rounded-[10px] border border-input-border bg-surface px-6 text-sm font-medium text-foreground transition-colors hover:bg-background"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
