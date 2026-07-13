"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import {
  addChildRow,
  createOrder,
  deleteChildRow,
  insertParsedOrders,
  updateChildRow,
  updateOrderSection,
  type NewOrderInput,
} from "@/lib/orders";
import { parseOrdersWorkbook } from "@/lib/excel-import";
import {
  CHILD_FIELDS,
  SECTION_BY_TABLE,
  type ChildTable,
  type OrderTable,
} from "@/lib/order-schema";
import { canCreateOrders, canEditChild, canEditSection } from "@/lib/roles";

export type CreateOrderResult =
  | { ok: true; slNo: number }
  | { ok: false; error: string };

export async function createOrderAction(
  input: NewOrderInput
): Promise<CreateOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to create orders." };
  }

  // Require at least one identifier so we don't create blank rows.
  if (!(input.so_no ?? "").trim() && !(input.ec_no ?? "").trim()) {
    return { ok: false, error: "Enter at least an SO No. or EC No." };
  }

  try {
    const { sl_no } = await createOrder(input);
    revalidatePath("/risansi/orders");
    return { ok: true, slNo: sl_no };
  } catch (error) {
    console.error("createOrder failed:", error);
    return { ok: false, error: "Could not create the order. Please try again." };
  }
}

export type UpdateSectionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateOrderSectionAction(
  orderId: string,
  table: string,
  values: Record<string, string>
): Promise<UpdateSectionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  if (!SECTION_BY_TABLE.has(table as OrderTable)) {
    return { ok: false, error: "Unknown section." };
  }

  if (!canEditSection(user.role, table as OrderTable)) {
    return {
      ok: false,
      error: "You don't have permission to edit this section.",
    };
  }

  try {
    await updateOrderSection(orderId, table as OrderTable, values);
    revalidatePath(`/risansi/orders/${orderId}`);
    revalidatePath("/risansi/orders");
    return { ok: true };
  } catch (error) {
    console.error("updateOrderSection failed:", error);
    return { ok: false, error: "Could not save changes. Please try again." };
  }
}

export type ChildActionResult = { ok: true } | { ok: false; error: string };

async function guardChild(table: string): Promise<ChildActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (table !== "order_pumps" && table !== "order_lots") {
    return { ok: false, error: "Unknown list." };
  }
  if (!canEditChild(user.role, table)) {
    return { ok: false, error: "You don't have permission to edit this list." };
  }
  return { ok: true };
}

export async function addOrderChildAction(
  orderId: string,
  table: string
): Promise<ChildActionResult> {
  const guard = await guardChild(table);
  if (!guard.ok) return guard;
  try {
    await addChildRow(table as ChildTable, orderId);
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("addOrderChild failed:", error);
    return { ok: false, error: "Could not add the row." };
  }
}

export async function updateOrderChildAction(
  id: string,
  table: string,
  values: Record<string, string>,
  orderId: string
): Promise<ChildActionResult> {
  const guard = await guardChild(table);
  if (!guard.ok) return guard;
  // Ignore any keys not in the child schema.
  const allowed = new Set(CHILD_FIELDS[table as ChildTable].map((f) => f.column));
  const clean = Object.fromEntries(
    Object.entries(values).filter(([k]) => allowed.has(k))
  );
  try {
    await updateChildRow(table as ChildTable, id, clean);
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("updateOrderChild failed:", error);
    return { ok: false, error: "Could not save the row." };
  }
}

export async function deleteOrderChildAction(
  id: string,
  table: string,
  orderId: string
): Promise<ChildActionResult> {
  const guard = await guardChild(table);
  if (!guard.ok) return guard;
  try {
    await deleteChildRow(table as ChildTable, id);
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("deleteOrderChild failed:", error);
    return { ok: false, error: "Could not delete the row." };
  }
}

export type ImportOrdersResult =
  | { ok: true; inserted: number; skipped: number; matchedColumns: number }
  | { ok: false; error: string };

export async function importOrdersAction(
  formData: FormData
): Promise<ImportOrdersResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to import orders." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose an Excel (.xlsx) file." };
  }
  if (!/\.xlsx?$/i.test(file.name)) {
    return { ok: false, error: "Only .xlsx / .xls files are supported." };
  }

  try {
    const buffer = await file.arrayBuffer();
    const parsed = await parseOrdersWorkbook(buffer);

    if (parsed.matchedColumns === 0) {
      return {
        ok: false,
        error:
          "No recognizable tracker columns were found. Check the file's header row.",
      };
    }
    if (parsed.rows.length === 0) {
      return { ok: false, error: "No data rows found to import." };
    }

    const { inserted } = await insertParsedOrders(parsed.rows);
    revalidatePath("/risansi/orders");
    return {
      ok: true,
      inserted,
      skipped: parsed.skipped,
      matchedColumns: parsed.matchedColumns,
    };
  } catch (error) {
    console.error("importOrders failed:", error);
    return {
      ok: false,
      error: "Could not import the file. Please check its format and try again.",
    };
  }
}
