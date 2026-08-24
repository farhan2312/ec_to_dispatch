"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createOrderAction } from "@/app/risansi/orders/actions";
import type { NewOrderInput } from "@/lib/orders";
import {
  BILL_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  ORDER_TYPE_OPTIONS,
  YES_NO_OPTIONS,
} from "@/lib/order-schema";

type FieldType = "text" | "date" | "number" | "select";
type Field = {
  name: keyof NewOrderInput;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  dependsOn?: { name: keyof NewOrderInput; value: string };
  required?: boolean;
};
type Section = { title: string; fields: Field[] };

// Client details come first — they're filled before anything else when
// creating an order. Client Code and Client Type are compulsory.
const SECTIONS: Section[] = [
  {
    title: "Client",
    fields: [
      { name: "client_code", label: "Client Code", type: "text", required: true },
      { name: "client_name", label: "Client Name", type: "text" },
      { name: "industry_type", label: "Industry", type: "text" },
      { name: "client_type", label: "Client Type", type: "text", required: true },
      { name: "market_type", label: "Market Type", type: "text" },
      { name: "reps", label: "Rep(s)", type: "text" },
    ],
  },
  {
    title: "Purchase Order",
    fields: [
      {
        name: "order_type",
        label: "Order Type",
        type: "select",
        options: ORDER_TYPE_OPTIONS,
      },
      {
        name: "bill_type",
        label: "Bill Type",
        type: "select",
        options: BILL_TYPE_OPTIONS,
      },
      { name: "quotation_no", label: "Quotation No.", type: "text" },
      { name: "po_no", label: "Purchase Order Number", type: "text" },
      { name: "customer_po_date", label: "Purchase Order Date", type: "date" },
      {
        name: "order_value",
        label: "Purchase/Sales Order Value (without GST)",
        type: "number",
      },
      {
        name: "order_currency",
        label: "Currency",
        type: "select",
        options: CURRENCY_OPTIONS,
      },
      { name: "so_no", label: "Sales Order Number", type: "text" },
      { name: "so_date", label: "Sales Order Date", type: "date" },
      {
        name: "total_quantity",
        label: "Sales Order Total Quantity",
        type: "number",
      },
    ],
  },
  {
    title: "Terms & Conditions",
    fields: [
      { name: "boi", label: "BOI", type: "select", options: YES_NO_OPTIONS },
      {
        name: "packing_details_required",
        label: "Packing Details Required",
        type: "select",
        options: YES_NO_OPTIONS,
      },
      { name: "qc_required", label: "Quality Required", type: "select", options: YES_NO_OPTIONS },
      {
        name: "freight_terms",
        label: "Freight Terms",
        type: "select",
        options: [
          { value: "Paid", label: "Paid" },
          { value: "To Pay", label: "To Pay" },
        ],
      },
      {
        name: "packing_requirement",
        label: "Packing Requirement",
        type: "select",
        options: [
          { value: "Wooden Box", label: "Wooden Box" },
          { value: "Loose", label: "Loose" },
        ],
      },
      {
        name: "delivery_date_as_per_so",
        label: "Delivery date As per SO",
        type: "date",
      },
      { name: "payment_terms", label: "Payment Terms", type: "text" },
      { name: "ld", label: "LD", type: "select", options: YES_NO_OPTIONS },
      {
        name: "ld_date",
        label: "LD Date",
        type: "date",
        dependsOn: { name: "ld", value: "Yes" },
      },
    ],
  },
  {
    title: "Target Dates",
    fields: [
      { name: "drg_target_date", label: "Target Date for Drawing", type: "date" },
      {
        name: "purchase_target_date",
        label: "Target Date for Purchase",
        type: "date",
        dependsOn: { name: "boi", value: "Yes" },
      },
      {
        name: "qc_doc_target_date",
        label: "Quality Target Date",
        type: "date",
        dependsOn: { name: "qc_required", value: "Yes" },
      },
      {
        name: "dispatch_team_target_date",
        label: "Target Date for Packing Team",
        type: "date",
      },
      { name: "dispatch_target_date", label: "Dispatch Target Date", type: "date" },
      {
        name: "dispatch_target_revised_date",
        label: "Revised Dispatch Target Date",
        type: "date",
      },
    ],
  },

  // --- Everything below is commented out, not deleted: the orders table was
  // trimmed to Client + Purchase Order Details columns only, so these fields
  // have no column to save into right now. Restore a section verbatim (and
  // re-add its columns via ALTER TABLE) when that data comes back.
  //
  // {
  //   title: "Order identity",
  //   fields: [
  //     { name: "ec_no", label: "EC No.", type: "text" },
  //     { name: "ec_generated_date", label: "EC Generated Date", type: "date" },
  //     { name: "ec_rcvd_operations_date", label: "EC Received in Operations", type: "date" },
  //     { name: "ec_sent_production_date", label: "EC Sent to Production", type: "date" },
  //     { name: "file_no", label: "File No.", type: "text" },
  //   ],
  // },
  // {
  //   title: "Item",
  //   fields: [
  //     { name: "model_no", label: "Model No.", type: "text" },
  //     { name: "pump_qty", label: "If Pump (Qty)", type: "number" },
  //     { name: "pump_sno", label: "Pump S.No.", type: "text" },
  //     { name: "orientation", label: "Orientation", type: "text" },
  //     { name: "liquid_application", label: "Liquid / Application", type: "text" },
  //     { name: "version", label: "Version", type: "text" },
  //   ],
  // },
  // {
  //   title: "Commercial & Dispatch",
  //   fields: [
  //     { name: "project", label: "Project", type: "select", options: YES_NO_OPTIONS },
  //     {
  //       name: "master_reason_of_delay",
  //       label: "Master Reason of Delay",
  //       type: "text",
  //     },
  //     {
  //       name: "dispatch_target_date",
  //       label: "Dispatch Target Date",
  //       type: "date",
  //     },
  //     {
  //       name: "dispatch_target_revised_date",
  //       label: "Revised Dispatch Target Date",
  //       type: "date",
  //     },
  //     {
  //       name: "drg_target_date",
  //       label: "Target Date for DRG",
  //       type: "date",
  //     },
  //   ],
  // },
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

  function firstMissingRequired(): Field | null {
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        if (field.required && !(values[field.name] ?? "").trim()) return field;
      }
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const missing = firstMissingRequired();
    if (missing) {
      setError(`${missing.label} is required.`);
      document.getElementById(missing.name)?.focus();
      return;
    }

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
              {section.fields.map((field) => {
                const disabled = field.dependsOn
                  ? (values[field.dependsOn.name] ?? "") !== field.dependsOn.value
                  : false;
                return (
                <div key={field.name}>
                  <label
                    htmlFor={field.name}
                    className="mb-1.5 block text-[13px] font-medium text-brand-label"
                  >
                    {field.label}
                    {field.required && <span className="text-danger"> *</span>}
                  </label>
                  {field.type === "select" ? (
                    <select
                      id={field.name}
                      name={field.name}
                      value={values[field.name] ?? ""}
                      onChange={(e) => update(field.name, e.target.value)}
                      disabled={disabled}
                      className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
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
                      disabled={disabled}
                      className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
                    />
                  )}
                </div>
                );
              })}
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
