"use server";

import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  addChildRow,
  createItem,
  setItemOrderCopy,
  setInvoiceLrFile,
  createOrder,
  deleteChildRow,
  deleteItem,
  deleteOrder,
  deleteQcDocument,
  getItemDetail,
  getOrderDetail,
  insertQcDocument,
  listQcDocuments,
  updateChildRow,
  updateOrderSection,
  type NewItemInput,
  type NewOrderInput,
  type QcDocTable,
  type QcDocumentMeta,
} from "@/lib/orders";
import {
  CHILD_FIELDS,
  SECTION_BY_TABLE,
  type ChildTable,
  type OrderTable,
} from "@/lib/order-schema";
import {
  canAccessDepartment,
  canCreateOrders,
  canEditChild,
  canEditQcDocuments,
  canEditQcRequirementDocs,
  canEditSection,
  isCentral,
} from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { emitNotification, notifySectionSaved } from "@/lib/notifications";

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

  if (!(input.client_code ?? "").trim()) {
    return { ok: false, error: "Client Code is required." };
  }
  if (!(input.client_type ?? "").trim()) {
    return { ok: false, error: "Client Type is required." };
  }

  try {
    const { id, sl_no } = await createOrder(input);
    const label = (input.so_no ?? `#${sl_no}`).trim();
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.create",
      category: "activity",
      target: label,
      details: `Created order #${sl_no}`,
    });

    // Creating an order doesn't notify anyone by itself, but the trigger
    // fields (payment terms, target dates) count as being set if they're
    // filled in on the create form — otherwise those departments would never
    // hear about them. `before: null` makes every filled field a transition.
    await notifySectionSaved({
      orderId: id,
      orderLabel: label,
      table: "orders",
      actorRole: user.role,
      before: null,
      after: input as Record<string, unknown>,
    });

    revalidatePath("/risansi/orders");
    return { ok: true, slNo: sl_no };
  } catch (error) {
    console.error("createOrder failed:", error);
    return { ok: false, error: "Could not create the order. Please try again." };
  }
}

export type ViewPisPayload = {
  bill_type: string | null;
  // For Tax Invoice: the PI list. For Challan: a single flat row (or null).
  pis: Record<string, unknown>[];
  challan: Record<string, unknown> | null;
};

/** Read-only PI (or Challan) view for the Accounts workspace. */
export async function getOrderPisAction(
  orderId: string
): Promise<ViewPisPayload> {
  const user = await getCurrentUser();
  if (!user) return { bill_type: null, pis: [], challan: null };
  const detail = await getOrderDetail(orderId);
  if (!detail) return { bill_type: null, pis: [], challan: null };
  return {
    bill_type: (detail.order.bill_type as string | null) ?? null,
    pis: detail.order_billing_docs ?? [],
    challan: (detail.order_billing as Record<string, unknown> | null) ?? null,
  };
}

/** The SO's core "Order details" row, for a read-only popup. Any signed-in
 *  user with a workspace can view it (billing/accounts "View order details"). */
export async function getOrderCoreAction(
  orderId: string
): Promise<Record<string, unknown> | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const detail = await getOrderDetail(orderId);
  return detail?.order ?? null;
}

export type CreateItemResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string };

/** Add an EC/pump item to an SO (the Add-On form). Central Visibility only. */
export async function createItemAction(
  orderId: string,
  input: NewItemInput
): Promise<CreateItemResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to add EC items." };
  }

  const order = await getOrderDetail(orderId);
  if (!order) return { ok: false, error: "Order not found." };

  // Every EC inherits the SO's Order Type (Pump/Spare) — the Add-On is of that
  // type, not re-selected per EC.
  const itemInput: NewItemInput = {
    ...input,
    item_type: (order.order.order_type as string | null) ?? input.item_type,
  };

  try {
    const { id: itemId } = await createItem(orderId, itemInput);
    const soLabel = String(order.order.so_no ?? `#${order.order.sl_no}`);
    const ecLabel = (input.ec_no ?? "").trim();
    const label = ecLabel ? `${soLabel} · ${ecLabel}` : soLabel;
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: label,
      details: `Added EC item to ${soLabel}`,
    });

    // No target-date notifications here: target dates are SO-level and fire
    // on order create/update, not on adding an EC.

    revalidatePath("/risansi/orders");
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true, itemId };
  } catch (error) {
    console.error("createItem failed:", error);
    return { ok: false, error: "Could not add the EC item. Please try again." };
  }
}

const MAX_ORDER_COPY_BYTES = 8 * 1024 * 1024; // stay under the action-body cap

/**
 * Add a Spare EC — like createItemAction but takes FormData so it can carry
 * the Order Copy file. Fields: ec_no, ec_date, quantity, and optional
 * `order_copy` file input.
 */
export async function createSpareItemAction(
  orderId: string,
  formData: FormData
): Promise<CreateItemResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to add EC items." };
  }

  const file = formData.get("order_copy");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && file.size > MAX_ORDER_COPY_BYTES) {
    return { ok: false, error: `"${file.name}" is larger than 8MB.` };
  }

  const input: NewItemInput = {
    ec_no: (formData.get("ec_no") as string | null) ?? undefined,
    ec_date: (formData.get("ec_date") as string | null) ?? undefined,
    model_no: (formData.get("model_no") as string | null) ?? undefined,
    quantity: (formData.get("quantity") as string | null) ?? undefined,
  };

  const result = await createItemAction(orderId, input);
  if (!result.ok) return result;

  if (hasFile) {
    try {
      const data = Buffer.from(await file.arrayBuffer());
      await setItemOrderCopy(result.itemId, {
        name: file.name,
        mimeType: file.type || null,
        size: file.size,
        data,
      });
      revalidatePath(`/risansi/orders/${orderId}`);
    } catch (error) {
      // The EC is already saved — surface the upload failure so the user knows
      // to retry the file (via edit later, once wired), but keep the EC row.
      console.error("setItemOrderCopy failed:", error);
      return {
        ok: false,
        error: "EC added, but the Order Copy file failed to upload. Retry the upload.",
      };
    }
  }

  return result;
}

export type DeleteItemResult = { ok: true } | { ok: false; error: string };

/** Delete an EC item (cascades to its department detail + lots). */
export async function deleteItemAction(itemId: string): Promise<DeleteItemResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to delete EC items." };
  }
  try {
    const detail = await getItemDetail(itemId);
    const orderId = detail ? String(detail.order.id) : null;
    await deleteItem(itemId);
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: detail ? String(detail.item.ec_no ?? "EC item") : "EC item",
      details: "Deleted EC item",
    });
    revalidatePath("/risansi/orders");
    if (orderId) revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("deleteItem failed:", error);
    return { ok: false, error: "Could not delete the EC item. Please try again." };
  }
}

export type DeleteOrderResult = { ok: true } | { ok: false; error: string };

export async function deleteOrderAction(
  orderId: string
): Promise<DeleteOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  // Same roles that create orders may delete them (Central Visibility / Admin).
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to delete orders." };
  }

  try {
    const detail = await getOrderDetail(orderId);
    const label = detail
      ? String(detail.order.so_no ?? `#${detail.order.sl_no}`)
      : orderId;
    await deleteOrder(orderId);
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.delete",
      category: "activity",
      target: label,
      details: `Deleted order ${label}`,
    });
    revalidatePath("/risansi/orders");
    return { ok: true };
  } catch (error) {
    console.error("deleteOrder failed:", error);
    return { ok: false, error: "Could not delete the order. Please try again." };
  }
}

export type UpdateSectionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Save one section. `id` is the SO's order_id for SO-scope sections
 * (orders/billing/accounts) or the EC's item_id for item-scope sections
 * (order_items + drawing/purchase/qc/planning/dispatch).
 */
export async function updateOrderSectionAction(
  id: string,
  table: string,
  values: Record<string, string>
): Promise<UpdateSectionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const section = SECTION_BY_TABLE.get(table as OrderTable);
  if (!section) {
    return { ok: false, error: "Unknown section." };
  }

  if (!canEditSection(user.role, table as OrderTable)) {
    return {
      ok: false,
      error: "You don't have permission to edit this section.",
    };
  }

  // Non-central users can't edit fields marked centralOnly (filled by Mitali).
  let allowedValues = values;
  if (!isCentral(user.role)) {
    const centralOnly = new Set(
      section.fields.filter((f) => f.centralOnly).map((f) => f.column)
    );
    allowedValues = Object.fromEntries(
      Object.entries(values).filter(([k]) => !centralOnly.has(k))
    );
  }

  const tbl = table as OrderTable;
  try {
    if (section.scope === "so") {
      const before = await getOrderDetail(id);
      await updateOrderSection(id, tbl, allowedValues);
      await logAudit({
        actor: { id: user.id, email: user.email, role: user.role },
        action: "order.update",
        category: "activity",
        target: section.title,
        details: `Updated ${section.title}`,
      });
      if (before) {
        const after = await getOrderDetail(id);
        if (after) {
          const o = before.order;
          const label = String(o.so_no ?? `#${o.sl_no}`);
          const pick = (d: NonNullable<typeof before>) =>
            tbl === "orders"
              ? d.order
              : ((d as Record<string, unknown>)[tbl] as Record<string, unknown> | null);
          await notifySectionSaved({
            orderId: id,
            orderLabel: label,
            table: tbl,
            actorRole: user.role,
            before: pick(before),
            after: pick(after),
          });
        }
      }
      revalidatePath(`/risansi/orders/${id}`);
    } else {
      // Item-scope: id is the item_id.
      const before = await getItemDetail(id);
      await updateOrderSection(id, tbl, allowedValues);
      await logAudit({
        actor: { id: user.id, email: user.email, role: user.role },
        action: "order.update",
        category: "activity",
        target: section.title,
        details: `Updated ${section.title}`,
      });
      if (before) {
        const after = await getItemDetail(id);
        if (after) {
          const o = before.order;
          const ec = before.item.ec_no;
          const label = `${String(o.so_no ?? `#${o.sl_no}`)}${ec ? ` · ${ec}` : ""}`;
          const pick = (d: NonNullable<typeof before>) =>
            tbl === "order_items"
              ? d.item
              : ((d as Record<string, unknown>)[tbl] as Record<string, unknown> | null);
          await notifySectionSaved({
            orderId: String(o.id),
            itemId: id,
            orderLabel: label,
            table: tbl,
            actorRole: user.role,
            before: pick(before),
            after: pick(after),
          });
        }
      }
      revalidatePath(`/risansi/orders/${String(before?.order.id ?? "")}/items/${id}`);
    }

    revalidatePath("/risansi/orders");
    return { ok: true };
  } catch (error) {
    console.error("updateOrderSection failed:", error);
    return { ok: false, error: "Could not save changes. Please try again." };
  }
}

export type ChildActionResult = { ok: true } | { ok: false; error: string };

const CHILD_TABLES: readonly ChildTable[] = [
  "order_lots",
  "order_boi_items",
  "order_billing_docs",
  "order_packing_slips",
  "order_invoices",
];

function isChildTable(table: string): table is ChildTable {
  return (CHILD_TABLES as readonly string[]).includes(table);
}

async function guardChild(table: string): Promise<ChildActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!isChildTable(table)) {
    return { ok: false, error: "Unknown list." };
  }
  if (!canEditChild(user.role, table)) {
    return { ok: false, error: "You don't have permission to edit this list." };
  }
  return { ok: true };
}

export async function addOrderChildAction(
  orderId: string,
  table: string,
  // Packing slips only: 'tentative' (Planning) or 'actual' (Packing).
  kind?: string
): Promise<ChildActionResult> {
  const guard = await guardChild(table);
  if (!guard.ok) return guard;
  try {
    await addChildRow(table as ChildTable, orderId, kind);
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
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  const tbl = table as ChildTable;
  // Ignore any keys not in the child schema.
  const allowed = new Set(CHILD_FIELDS[tbl].map((f) => f.column));
  const clean = Object.fromEntries(
    Object.entries(values).filter(([k]) => allowed.has(k))
  );
  try {
    // For PIs: capture pre-save pi_no so we can notify Accounts only when it
    // becomes newly filled (empty → set), not on every subsequent edit.
    let piNoBefore: string | null = null;
    if (tbl === "order_billing_docs") {
      const before = await query<{ pi_no: string | null }>(
        `SELECT pi_no FROM order_billing_docs WHERE id = $1`,
        [id]
      );
      piNoBefore = before.rows[0]?.pi_no ?? null;
    }

    await updateChildRow(tbl, id, clean);

    if (tbl === "order_billing_docs") {
      const piNoAfter = (clean.pi_no ?? "").trim();
      const wasEmpty = !(piNoBefore ?? "").trim();
      if (wasEmpty && piNoAfter) {
        // Newly-filled PI number → tell Accounts + Central (skip Central if
        // Central is the one who saved — they already know).
        await notifyPiCreated(orderId, id, piNoAfter, user.role);
      }
    }
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("updateOrderChild failed:", error);
    return { ok: false, error: "Could not save the row." };
  }
}

/** Notify Accounts (and Central for oversight) when Billing files a new PI. */
async function notifyPiCreated(
  orderId: string,
  _piId: string,
  piNo: string,
  actorRole: string
): Promise<void> {
  const detail = await getOrderDetail(orderId);
  const soLabel = detail
    ? String(detail.order.so_no ?? `#${detail.order.sl_no}`)
    : orderId;
  // Always tell Accounts; also tell Central Visibility (and by extension Admin,
  // via recipientRolesForUser) unless Central themselves saved the PI.
  const roles = ["accounts"];
  if (!isCentral(actorRole)) roles.push("central_visibility");
  // itemId is intentionally null here: notifications.item_id is a FK to
  // order_items(id), and a PI id (order_billing_docs.id) would fail that
  // constraint. Deep-link is by order_id — Accounts opens the SO detail.
  await emitNotification({
    roles,
    orderId,
    type: "dept_update",
    message: `PI ${piNo} created for ${soLabel}`,
  });
}

const MAX_LR_BYTES = 8 * 1024 * 1024;

/** Attach (or replace) an invoice's LR document. Billing only. */
export async function uploadInvoiceLrAction(
  invoiceId: string,
  orderId: string,
  formData: FormData
): Promise<ChildActionResult> {
  const guard = await guardChild("order_invoices");
  if (!guard.ok) return guard;

  const file = formData.get("lr");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to attach." };
  }
  if (file.size > MAX_LR_BYTES) {
    return { ok: false, error: `"${file.name}" is larger than 8MB.` };
  }
  try {
    const data = Buffer.from(await file.arrayBuffer());
    await setInvoiceLrFile(invoiceId, {
      name: file.name,
      mimeType: file.type || null,
      size: file.size,
      data,
    });
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("uploadInvoiceLr failed:", error);
    return { ok: false, error: "Could not attach the file. Please try again." };
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

export type QcDocumentResult = { ok: true } | { ok: false; error: string };

const MAX_QC_FILE_BYTES = 8 * 1024 * 1024; // stay under the 10MB action body cap

const QC_DOC_TABLES: readonly QcDocTable[] = [
  "order_qc_documents",
  "order_qc_requirement_documents",
];

// The `table` argument crosses a Server Action boundary (a public POST
// endpoint), so re-validate it here even though the caller's TS type says
// it's already a QcDocTable.
function isQcDocTable(table: string): table is QcDocTable {
  return (QC_DOC_TABLES as readonly string[]).includes(table);
}

function canEditQcDocTable(table: QcDocTable, role: string): boolean {
  return table === "order_qc_documents"
    ? canEditQcDocuments(role)
    : canEditQcRequirementDocs(role);
}

const QC_DOC_TABLE_LABEL: Record<QcDocTable, string> = {
  order_qc_documents: "QC",
  order_qc_requirement_documents: "QC Requirement Docs",
};

export async function listQcDocumentsAction(
  table: QcDocTable,
  orderId: string
): Promise<QcDocumentMeta[]> {
  const user = await getCurrentUser();
  if (!user || !isQcDocTable(table)) return [];
  // Both document sets are viewable by anyone with QC section access.
  if (!canAccessDepartment(user.role, "order_qc")) return [];
  return listQcDocuments(table, orderId);
}

export async function uploadQcDocumentsAction(
  table: QcDocTable,
  orderId: string,
  formData: FormData
): Promise<QcDocumentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!isQcDocTable(table)) {
    return { ok: false, error: "Unknown document set." };
  }
  if (!canEditQcDocTable(table, user.role)) {
    return { ok: false, error: "You don't have permission to attach documents here." };
  }

  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, error: "Choose at least one file." };
  }
  const tooBig = files.find((f) => f.size > MAX_QC_FILE_BYTES);
  if (tooBig) {
    return { ok: false, error: `"${tooBig.name}" is larger than 8MB.` };
  }

  try {
    for (const file of files) {
      const data = Buffer.from(await file.arrayBuffer());
      await insertQcDocument(table, orderId, {
        name: file.name,
        mimeType: file.type || null,
        size: file.size,
        data,
      });
    }
    const label = QC_DOC_TABLE_LABEL[table];
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: label,
      details: `Attached ${files.length} document${files.length === 1 ? "" : "s"} to ${label}`,
    });
    revalidatePath("/risansi/departments/qc");
    return { ok: true };
  } catch (error) {
    console.error("uploadQcDocuments failed:", error);
    return { ok: false, error: "Could not upload the file(s). Please try again." };
  }
}

export async function deleteQcDocumentAction(
  table: QcDocTable,
  id: string
): Promise<QcDocumentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!isQcDocTable(table)) {
    return { ok: false, error: "Unknown document set." };
  }
  if (!canEditQcDocTable(table, user.role)) {
    return { ok: false, error: "You don't have permission to delete documents here." };
  }
  try {
    await deleteQcDocument(table, id);
    revalidatePath("/risansi/departments/qc");
    return { ok: true };
  } catch (error) {
    console.error("deleteQcDocument failed:", error);
    return { ok: false, error: "Could not delete the file. Please try again." };
  }
}

