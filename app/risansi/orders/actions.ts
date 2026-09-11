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
  getChildOrderId,
  getItemDetail,
  getOrderDetail,
  getOrderDeptStatus,
  insertBillingDocs,
  getOrderLabel,
  insertQcDocument,
  listQcDocuments,
  addTargetRevision,
  completeDept,
  deleteLatestTargetRevision,
  listTargetRevisions,
  uncompleteDept,
  updateChildRow,
  updateOrderSection,
  upsertInvoiceFromPackingSlip,
  type NewItemInput,
  type NewOrderInput,
  type QcDocTable,
  type QcDocumentMeta,
  type SoDeptStatus,
} from "@/lib/orders";
import {
  CHILD_FIELDS,
  SECTION_BY_TABLE,
  firstMissingAddOnField,
  type ChildTable,
  type OrderTable,
} from "@/lib/order-schema";
import {
  getClientByCode,
  searchClients,
  type MarketIntellClient,
} from "@/lib/market-intell";
import {
  canAccessDepartment,
  canCreateOrders,
  canEditChild,
  canEditQcDocuments,
  canEditQcRequirementDocs,
  canEditSection,
  isCentral,
} from "@/lib/roles";
import { parsePiWorkbook } from "@/lib/pi-import";
import { DEPT_FILTER_KEYS } from "@/lib/dept-status";
import {
  describeDays,
  DEPT_LABELS,
  type DeptCompletion,
  type DeptKey,
} from "@/lib/dept-completion";
import {
  isTargetKey,
  TARGET_BY_KEY,
  type TargetRevision,
} from "@/lib/target-dates";
import { logAudit } from "@/lib/audit";
import {
  checkFieldBounds,
  checkReceivedWithinValue,
  numericValue,
} from "@/lib/order-validation";
import {
  childLabel,
  childValues,
  describeChanges,
  qcDocumentSubject,
  subjectForChild,
  subjectForItem,
  subjectForOrder,
} from "@/lib/audit-subject";
import {
  drawingHandoffDetail,
  drawingHandoffEvents,
  emitNotification,
  notifySectionSaved,
  targetDateRecipients,
  type DrawingHandoffs,
} from "@/lib/notifications";

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
  // Order value and quantity cannot be negative — the form says so, but this
  // is also how the Excel import creates orders.
  const bounds = checkFieldBounds(
    SECTION_BY_TABLE.get("orders")!.fields,
    input as Record<string, unknown>
  );
  if (bounds) return { ok: false, error: bounds };

  try {
    const { id, sl_no } = await createOrder(input);
    const label = (input.so_no ?? `#${sl_no}`).trim();
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.create",
      category: "activity",
      target: label,
      details: `Created order ${label} (Sl. No. ${sl_no})`,
      subject: { orderId: id, soNo: label },
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

// ---------------------------------------------------------------------------
// Client lookup from the Market Intell database (READ-ONLY — see
// lib/market-intell.ts). Powers the debounced client search on the orders page.
// ---------------------------------------------------------------------------

export type ClientSearchResult =
  | { ok: true; clients: MarketIntellClient[] }
  | { ok: false; error: string };

/** Debounced type-ahead over Market Intell clients (code or legal name). */
export async function searchClientsAction(
  term: string
): Promise<ClientSearchResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to create orders." };
  }
  try {
    return { ok: true, clients: await searchClients(term) };
  } catch (error) {
    console.error("searchClients failed:", error);
    return { ok: false, error: "Could not reach the client directory." };
  }
}

/**
 * Create an SO seeded from a Market Intell client. Only the client CODE comes
 * from the browser — the stored details are re-read server-side, so a tampered
 * request can't inject arbitrary client data.
 */
export async function createOrderFromClientAction(
  clientCode: string
): Promise<CreateOrderResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to create orders." };
  }

  let client: MarketIntellClient | null;
  try {
    client = await getClientByCode(clientCode);
  } catch (error) {
    console.error("getClientByCode failed:", error);
    return { ok: false, error: "Could not reach the client directory." };
  }
  if (!client) return { ok: false, error: "That client was not found." };

  return createOrderAction({
    client_code: client.code,
    client_name: client.legal_name ?? undefined,
    market_type: client.market_type ?? undefined,
    client_type: client.client_type ?? undefined,
    industry_type: client.industry ?? undefined,
    zone: client.zone ?? undefined,
    reps: client.rep_name ?? undefined,
  });
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

  // Every Add-On field is mandatory (the Spare's Order Copy file aside). The
  // form checks this too; repeated here so a crafted request can't create a
  // half-filled EC.
  const missing = firstMissingAddOnField(
    itemInput.item_type,
    itemInput as Record<string, unknown>
  );
  if (missing) return { ok: false, error: `${missing.label} is required.` };

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
      details: ecLabel ? `Added EC ${ecLabel} to ${soLabel}` : `Added an EC to ${soLabel}`,
      subject: { orderId, itemId, soNo: soLabel, ecNo: ecLabel || null },
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
    internal_model: (formData.get("internal_model") as string | null) ?? undefined,
    version: (formData.get("version") as string | null) ?? undefined,
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

/** Attach or replace a Spare EC's Order Copy after creation. */
export async function uploadItemOrderCopyAction(
  itemId: string,
  orderId: string,
  formData: FormData
): Promise<ChildActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canCreateOrders(user.role)) {
    return { ok: false, error: "You don't have permission to change the Order Copy." };
  }
  const file = formData.get("order_copy");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a file to attach." };
  }
  if (file.size > MAX_ORDER_COPY_BYTES) {
    return { ok: false, error: `"${file.name}" is larger than 8MB.` };
  }
  try {
    const data = Buffer.from(await file.arrayBuffer());
    await setItemOrderCopy(itemId, {
      name: file.name,
      mimeType: file.type || null,
      size: file.size,
      data,
    });
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: "Order Copy",
      details: `Attached Order Copy "${file.name}"`,
      subject: await subjectForItem(itemId),
    });
    revalidatePath(`/risansi/orders/${orderId}/items/${itemId}`);
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("uploadItemOrderCopy failed:", error);
    return { ok: false, error: "Could not attach the file. Please try again." };
  }
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
      details: detail
        ? `Deleted ${detail.item.ec_no ? `EC ${String(detail.item.ec_no)}` : "an EC"} from ${String(detail.order.so_no ?? `#${detail.order.sl_no}`)}`
        : "Deleted an EC",
      subject: detail
        ? {
            orderId: String(detail.order.id),
            itemId,
            soNo: String(detail.order.so_no ?? `#${detail.order.sl_no}`),
            ecNo: (detail.item.ec_no as string | null) ?? null,
          }
        : { itemId },
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
      subject: { orderId, soNo: detail ? label : null },
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
  const bounds = checkFieldBounds(section.fields, allowedValues);
  if (bounds) return { ok: false, error: bounds };
  try {
    if (section.scope === "so") {
      const before = await getOrderDetail(id);
      // Amount received never exceeds the order value — checked from whichever
      // side is being saved, so neither can be moved past the other.
      if (before && tbl === "order_accounts" && "amount_received" in allowedValues) {
        const problem = checkReceivedWithinValue(
          numericValue(allowedValues.amount_received),
          numericValue(before.order.order_value),
          "received"
        );
        if (problem) return { ok: false, error: problem };
      }
      if (before && tbl === "orders" && "order_value" in allowedValues) {
        const accounts = (before as Record<string, unknown>).order_accounts as
          | Record<string, unknown>
          | null
          | undefined;
        const problem = checkReceivedWithinValue(
          numericValue(accounts?.amount_received),
          numericValue(allowedValues.order_value),
          "order value"
        );
        if (problem) return { ok: false, error: problem };
      }
      await updateOrderSection(id, tbl, allowedValues);
      const after = before ? await getOrderDetail(id) : null;
      const pick = (d: NonNullable<typeof before>) =>
        tbl === "orders"
          ? d.order
          : ((d as Record<string, unknown>)[tbl] as Record<string, unknown> | null);
      // Named as it reads after the save, so renaming the SO logs under the
      // new number with the old one in the change list.
      const current = (after ?? before)?.order;
      const label = current ? String(current.so_no ?? `#${current.sl_no}`) : null;
      const changes =
        before && after ? describeChanges(section.fields, pick(before), pick(after)) : null;
      await logAudit({
        actor: { id: user.id, email: user.email, role: user.role },
        action: "order.update",
        category: "activity",
        target: section.title,
        details: changes
          ? `Updated ${section.title} — ${changes}`
          : `Saved ${section.title} (no changes)`,
        subject: { orderId: id, soNo: label },
      });
      if (before && after && label) {
        await notifySectionSaved({
          orderId: id,
          orderLabel: label,
          table: tbl,
          actorRole: user.role,
          before: pick(before),
          after: pick(after),
        });
      }
      revalidatePath(`/risansi/orders/${id}`);
    } else {
      // Item-scope: id is the item_id.
      const before = await getItemDetail(id);
      await updateOrderSection(id, tbl, allowedValues);
      const after = before ? await getItemDetail(id) : null;
      const pick = (d: NonNullable<typeof before>) =>
        tbl === "order_items"
          ? d.item
          : ((d as Record<string, unknown>)[tbl] as Record<string, unknown> | null);
      const current = after ?? before;
      const soNo = current ? String(current.order.so_no ?? `#${current.order.sl_no}`) : null;
      const ecNo = current ? ((current.item.ec_no as string | null) ?? null) : null;
      const changes =
        before && after ? describeChanges(section.fields, pick(before), pick(after)) : null;
      await logAudit({
        actor: { id: user.id, email: user.email, role: user.role },
        action: "order.update",
        category: "activity",
        target: section.title,
        details: changes
          ? `Updated ${section.title} — ${changes}`
          : `Saved ${section.title} (no changes)`,
        subject: {
          orderId: current ? String(current.order.id) : null,
          itemId: id,
          soNo,
          ecNo,
        },
      });
      if (before && after && soNo) {
        await notifySectionSaved({
          orderId: String(before.order.id),
          itemId: id,
          orderLabel: `${soNo}${ecNo ? ` · ${ecNo}` : ""}`,
          table: tbl,
          actorRole: user.role,
          before: pick(before),
          after: pick(after),
        });
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

// Runtime allow-list for the `table` argument, which crosses a server-action
// boundary. Keep in sync with the ChildTable union — the `Record` type below
// makes a missing entry a compile error rather than a silent "Unknown list."
const CHILD_TABLES_SET: Record<ChildTable, true> = {
  order_lots: true,
  order_boi_items: true,
  order_billing_docs: true,
  order_packing_slips: true,
  order_invoices: true,
  order_drawing_revisions: true,
};
const CHILD_TABLES: readonly ChildTable[] = Object.keys(
  CHILD_TABLES_SET
) as ChildTable[];

function isChildTable(table: string): table is ChildTable {
  return (CHILD_TABLES as readonly string[]).includes(table);
}

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

async function guardChild(
  table: string
): Promise<{ ok: true; user: CurrentUser } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!isChildTable(table)) {
    return { ok: false, error: "Unknown list." };
  }
  if (!canEditChild(user.role, table)) {
    return { ok: false, error: "You don't have permission to edit this list." };
  }
  return { ok: true, user };
}

/** One audit line for a list row, on the SO / EC it belongs to. */
async function auditChild(
  user: CurrentUser,
  table: ChildTable,
  subject: Awaited<ReturnType<typeof subjectForChild>>,
  details: string
) {
  await logAudit({
    actor: { id: user.id, email: user.email, role: user.role },
    action: "order.update",
    category: "activity",
    target: childLabel(table, null),
    details,
    subject,
  });
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
    const created = await addChildRow(table as ChildTable, orderId, kind);
    if (created) {
      await auditChild(
        guard.user,
        table as ChildTable,
        await subjectForChild(table as ChildTable, created.id),
        `Added a ${childLabel(table as ChildTable, null)} row`
      );
    }
    // Actual packing slips need an invoice add-on to appear in Billing &
    // Dispatch the moment Packing clicks Add — don't wait for the first
    // Save. The invoice's read-only header stays blank until Packing fills
    // in the slip.
    if (created && table === "order_packing_slips" && kind === "actual") {
      await upsertInvoiceFromPackingSlip(created.id);
      // Refresh the parent SO's detail page too (this action's `orderId` is
      // the item_id for per-EC children, so the direct revalidate below only
      // hits the item route).
      const soId = await getChildOrderId("order_packing_slips", created.id);
      if (soId) revalidatePath(`/risansi/orders/${soId}`);
    }
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
  const user = guard.user;
  const tbl = table as ChildTable;
  // Ignore any keys not in the child schema, and drop `centralOnly` fields
  // when the caller isn't Central Visibility — the UI renders those read-only,
  // but the action is a public endpoint so it must enforce it too.
  const allowed = new Set(
    CHILD_FIELDS[tbl]
      .filter((f) => !f.centralOnly || isCentral(user.role))
      .map((f) => f.column)
  );
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

    // Actual packing slips: capture pre-save kind so we know whether to
    // upsert a linked invoice row afterwards. Doing it before the update
    // covers the case where the client changes packing_slip_no on the same
    // save — we still fire the upsert against the new value.
    let actualSlipKind: "actual" | "tentative" | null = null;
    if (tbl === "order_packing_slips") {
      const meta = await query<{ kind: string | null }>(
        `SELECT kind FROM order_packing_slips WHERE id = $1`,
        [id]
      );
      const k = (meta.rows[0]?.kind ?? "").toLowerCase();
      if (k === "actual" || k === "tentative") actualSlipKind = k;
    }

    // Drawing revisions: capture the three hand-offs before the write so we
    // notify only on the flip to Yes, not on every re-save of a row that was
    // already Yes. Applies to every revision row, not just the first issue.
    let drgBefore: DrawingHandoffs | null = null;
    if (tbl === "order_drawing_revisions") {
      drgBefore = await drawingHandoffs(id);
    }

    // What the row said before, and whose it is — read ahead of the write so
    // the audit line can say what changed.
    const [rowBefore, subject] = await Promise.all([
      childValues(tbl, id),
      subjectForChild(tbl, id),
    ]);

    await updateChildRow(tbl, id, clean);

    const rowAfter = await childValues(tbl, id);
    const changes = describeChanges(CHILD_FIELDS[tbl], rowBefore, rowAfter);
    await auditChild(
      user,
      tbl,
      subject,
      changes
        ? `Updated ${childLabel(tbl, rowAfter)} — ${changes}`
        : `Saved ${childLabel(tbl, rowAfter)} (no changes)`
    );

    // For per-EC child tables (BOI items, packing slips) the `orderId` arg is
    // actually the item_id. The notification's order_id is a FK to orders(id),
    // so we must resolve the real SO id — otherwise the INSERT hits an FK
    // violation and the notification is silently dropped.
    const isPerEc =
      tbl === "order_boi_items" ||
      tbl === "order_packing_slips" ||
      tbl === "order_drawing_revisions";
    const soOrderId = isPerEc
      ? (await getChildOrderId(tbl, id)) ?? null
      : orderId;
    const notifyMuted = user.role === "central_visibility";

    if (tbl === "order_billing_docs") {
      const piNoAfter = (clean.pi_no ?? "").trim();
      const wasEmpty = !(piNoBefore ?? "").trim();
      if (wasEmpty && piNoAfter) {
        // Newly-filled PI number → tell Accounts + Central (skip Central if
        // Central is the one who saved — they already know).
        await notifyPiCreated(orderId, id, piNoAfter, user.role);
      }
    } else if (tbl === "order_packing_slips" && actualSlipKind === "actual") {
      // Actual packing slip saved → upsert its matching invoice row so
      // Billing sees an add-on pre-populated with EC / Packing Slip No. /
      // Qty (read-only), then tell Billing + Central which slip is ready.
      const ctx = await upsertInvoiceFromPackingSlip(id);
      const emitOrderId = soOrderId ?? ctx?.order_id ?? null;
      if (emitOrderId) {
        const soLabel = (await getOrderLabel(emitOrderId)) ?? emitOrderId;
        const ec = ctx?.ec_no ? `EC ${ctx.ec_no}` : "EC";
        const psn = ctx?.packing_slip_no ?? "";
        const qty = ctx?.quantity != null ? ` · Qty ${ctx.quantity}` : "";
        const detail = `${soLabel} · ${ec}${psn ? ` · Packing Slip ${psn}` : ""}${qty}`;
        const billingRoles = ["operations"];
        // Only Mitali (central_visibility) herself is self-muted; admin acting
        // still notifies central_visibility (and admin's bell picks it up via
        // the admin → central_visibility recipient expansion).
        if (!notifyMuted) billingRoles.push("central_visibility");
        await emitNotification({
          roles: billingRoles,
          orderId: emitOrderId,
          type: "dept_update",
          message: `Actual packing slip ready to invoice — ${detail}`,
        });
      }
    } else if (tbl === "order_invoices") {
      // Billing & Dispatch save → Central Visibility (Mitali).
      if (!notifyMuted && soOrderId) {
        const soLabel = (await getOrderLabel(soOrderId)) ?? soOrderId;
        await emitNotification({
          roles: ["central_visibility"],
          orderId: soOrderId,
          type: "dept_update",
          message: `Billing & Dispatch updated for ${soLabel}`,
        });
      }
    } else if (tbl === "order_packing_slips" && actualSlipKind === "tentative") {
      // Tentative packing slip save (Planning) → Central Visibility.
      if (!notifyMuted && soOrderId) {
        const soLabel = (await getOrderLabel(soOrderId)) ?? soOrderId;
        await emitNotification({
          roles: ["central_visibility"],
          orderId: soOrderId,
          type: "dept_update",
          message: `Tentative packing details updated for ${soLabel}`,
        });
      }
    } else if (tbl === "order_drawing_revisions") {
      // Each hand-off tells whoever acts next: Drawing's issue to Operations
      // and to Production go up to Mitali (muted when she saves); her issue to
      // the client and the approval come back down to Drawing. A "No" reports
      // the same way a "Yes" does — see drawingHandoffEvents.
      const after = await drawingHandoffs(id);
      if (after && soOrderId) {
        const events = drawingHandoffEvents(drgBefore, after, notifyMuted);
        if (events.length > 0) {
          const soLabel = (await getOrderLabel(soOrderId)) ?? soOrderId;
          const detail = drawingHandoffDetail(soLabel, after);
          for (const event of events) {
            await emitNotification({
              roles: event.roles,
              orderId: soOrderId,
              // Per-EC child: this action's `orderId` arg is the item id, so the
              // bell can deep-link straight to the EC.
              itemId: orderId,
              type: "dept_update",
              message: `Drawing ${event.what} — ${detail}`,
            });
          }
        }
      }
    } else if (tbl === "order_boi_items") {
      // Purchase BOI item save → Central Visibility, and Planning: a bought-out
      // receipt date is what unblocks their schedule, so they need to hear it
      // without going looking.
      if (soOrderId) {
        const soLabel = (await getOrderLabel(soOrderId)) ?? soOrderId;
        const roles = ["planning"];
        if (!notifyMuted) roles.push("central_visibility");
        await emitNotification({
          roles,
          orderId: soOrderId,
          type: "dept_update",
          message: `Purchase BOI updated for ${soLabel}`,
        });
      }
    }
    // Refresh the parent SO detail page when the child is per-EC (its
    // `orderId` arg is the item_id), so Billing & Dispatch reflects any
    // invoice row we just upserted.
    if (isPerEc && soOrderId) {
      revalidatePath(`/risansi/orders/${soOrderId}`);
    }
    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("updateOrderChild failed:", error);
    return { ok: false, error: "Could not save the row." };
  }
}

/** Read one revision's hand-off state, before and after the write. */
async function drawingHandoffs(id: string): Promise<DrawingHandoffs | null> {
  const result = await query<DrawingHandoffs>(
    `SELECT rv.revision_no, it.ec_no, rv.issued_to_operations,
            rv.issued_to_operations_remarks, rv.issued_to_client, rv.approved,
            rv.issued_to_production
       FROM order_drawing_revisions rv
       JOIN order_items it ON it.id = rv.item_id
      WHERE rv.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
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
  // via recipientRolesForUser) unless Mitali herself saved the PI. Admin
  // saves still notify central_visibility so admin's bell picks it up.
  const roles = ["accounts"];
  if (actorRole !== "central_visibility") roles.push("central_visibility");
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
    const [subject, row] = await Promise.all([
      subjectForChild("order_invoices", invoiceId),
      childValues("order_invoices", invoiceId),
    ]);
    await auditChild(
      guard.user,
      "order_invoices",
      subject,
      `Attached LR copy "${file.name}" to ${childLabel("order_invoices", row)}`
    );
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
    const tbl = table as ChildTable;
    // Once it is gone there is nothing left to name it by.
    const [subject, row] = await Promise.all([
      subjectForChild(tbl, id),
      childValues(tbl, id),
    ]);
    await deleteChildRow(tbl, id);
    await auditChild(guard.user, tbl, subject, `Deleted ${childLabel(tbl, row)}`);
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
  order_qc_documents: "Quality",
  order_qc_requirement_documents: "Quality Requirement Docs",
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
    const names = files.map((f) => `"${f.name}"`).join(", ");
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: label,
      details: `Attached ${files.length} document${files.length === 1 ? "" : "s"} to ${label}: ${names}`,
      // The documents hang off the EC — this argument is its item id.
      subject: await subjectForItem(orderId),
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
    const { subject, fileName } = await qcDocumentSubject(table, id);
    await deleteQcDocument(table, id);
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: QC_DOC_TABLE_LABEL[table],
      details: `Deleted ${fileName ? `"${fileName}"` : "a document"} from ${QC_DOC_TABLE_LABEL[table]}`,
      subject,
    });
    revalidatePath("/risansi/departments/qc");
    return { ok: true };
  } catch (error) {
    console.error("deleteQcDocument failed:", error);
    return { ok: false, error: "Could not delete the file. Please try again." };
  }
}


export type BoiItemsResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: string };

/**
 * The bought-out items on one EC, read-only.
 *
 * Planning needs these to schedule around a pending receipt, so the read is
 * open to Planning and Purchase (its owner) plus Central Visibility — but it
 * is a read only: the rows themselves are written through the Purchase
 * workspace, under its own permission checks.
 */
export async function boiItemsAction(itemId: string): Promise<BoiItemsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };

  const allowed =
    isCentral(user.role) ||
    canEditSection(user.role, "order_planning") ||
    canEditSection(user.role, "order_purchase");
  if (!allowed) {
    return { ok: false, error: "You don't have access to bought-out items." };
  }

  try {
    const result = await query<Record<string, unknown>>(
      `SELECT id, boi_item, boi_item_other, boi_make_desc,
              to_char(expected_receipt_date, 'YYYY-MM-DD') AS expected_receipt_date,
              to_char(receipt_date, 'YYYY-MM-DD') AS receipt_date, remarks
         FROM order_boi_items
        WHERE item_id = $1
        ORDER BY created_at`,
      [itemId]
    );
    return { ok: true, rows: result.rows };
  } catch (error) {
    console.error("boiItemsAction failed:", error);
    return { ok: false, error: "Could not load the bought-out items." };
  }
}

export type DeptStatusResult =
  | { ok: true; status: SoDeptStatus }
  | { ok: false; error: string };

/**
 * Every department's status for one SO — the "Departments" popup on the order
 * list. Read-only, cross-department, so it's gated to the roles that see the
 * whole-order list (Central Visibility / Admin).
 */
export async function orderDeptStatusAction(
  orderId: string
): Promise<DeptStatusResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!isCentral(user.role)) {
    return { ok: false, error: "You don't have access to department status." };
  }
  try {
    const status = await getOrderDeptStatus(orderId);
    if (!status) return { ok: false, error: "Order not found." };
    return { ok: true, status };
  } catch (error) {
    console.error("orderDeptStatusAction failed:", error);
    return { ok: false, error: "Could not load department status." };
  }
}

const MAX_PI_XLSX_BYTES = 5 * 1024 * 1024;

export type ImportPiResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

/**
 * Upload a PI Excel to auto-fill an SO's Operation card. Only rows that parse
 * cleanly are inserted; rows with errors are counted as skipped and reported.
 * Same permission as adding a PI by hand (Billing & Operations).
 */
export async function importPiExcelAction(
  orderId: string,
  formData: FormData
): Promise<ImportPiResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canEditChild(user.role, "order_billing_docs")) {
    return { ok: false, error: "You don't have permission to add PIs." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an .xlsx file to upload." };
  }
  if (file.size > MAX_PI_XLSX_BYTES) {
    return { ok: false, error: "That file is larger than 5 MB." };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Only .xlsx files can be uploaded." };
  }

  try {
    const parsed = await parsePiWorkbook(Buffer.from(await file.arrayBuffer()));
    if (parsed.missingPiNo) {
      return {
        ok: false,
        error: "No PI No. column found. Expected columns: PI No., PI Date, PI Value.",
      };
    }
    const good = parsed.rows.filter((r) => r.errors.length === 0);
    if (good.length === 0) {
      return { ok: false, error: "No valid PI rows found in that sheet." };
    }
    const inserted = await insertBillingDocs(
      orderId,
      good.map((r) => ({ pi_no: r.pi_no, pi_date: r.pi_date, pi_value: r.pi_value }))
    );
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.update",
      category: "activity",
      target: "PI",
      details: `Imported ${inserted} PI${inserted === 1 ? "" : "s"} from "${file.name}": ${good
        .map((r) => r.pi_no)
        .filter(Boolean)
        .slice(0, 10)
        .join(", ")}`,
      subject: await subjectForOrder(orderId),
    });
    revalidatePath(`/risansi/orders/${orderId}`);
    revalidatePath("/risansi/departments/billing");
    return { ok: true, inserted, skipped: parsed.rows.length - good.length };
  } catch (error) {
    console.error("importPiExcelAction failed:", error);
    return { ok: false, error: "Could not read that workbook." };
  }
}

// ---------------------------------------------------------------------------
// Target date history
// ---------------------------------------------------------------------------

/** Dates read better in a notification than the ISO the input produces. */
function formatTargetDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export type TargetRevisionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Move one of the SO's target dates, keeping the old value as history.
 *
 * Targets are Central Visibility's to set (departments read them), so the
 * guard matches the Order details section rather than the department that
 * works to the date.
 */
export async function addTargetRevisionAction(
  orderId: string,
  targetKey: string,
  date: string,
  reason: string
): Promise<TargetRevisionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canEditSection(user.role, "orders")) {
    return { ok: false, error: "You don't have permission to set target dates." };
  }
  if (!isTargetKey(targetKey)) {
    return { ok: false, error: "Unknown target date." };
  }
  // A date is the whole point of the row, so it is the one required field.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "Choose a date." };
  }

  const target = TARGET_BY_KEY.get(targetKey)!;
  const trimmedReason = reason.trim() || null;
  try {
    const { seq } = await addTargetRevision({
      orderId,
      target,
      date,
      reason: trimmedReason,
      actorId: user.id,
      actorRole: user.role,
    });

    const label = (await getOrderLabel(orderId)) ?? orderId;
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.target_date",
      category: "activity",
      target: label,
      details:
        (seq === 1
          ? `Set ${target.label} to ${formatTargetDate(date)}`
          : `Revised ${target.label} to ${formatTargetDate(date)} (revision ${seq - 1})`) +
        (trimmedReason ? ` — reason: ${trimmedReason}` : ""),
      subject: { orderId, soNo: label },
    });

    // The department working to this date has to hear it — both when it is
    // first set and every time it moves, since a revision changes their
    // deadline as much as the original did. The reason rides along: "moved to
    // the 19th" is far less useful than knowing why.
    // Target dates used to notify through notifySectionSaved; they are no
    // longer written by a section save, so the emit happens here instead.
    const recipients = targetDateRecipients(target.column);
    if (recipients) {
      const when = formatTargetDate(date);
      const why = trimmedReason ? ` · ${trimmedReason}` : "";
      await emitNotification({
        roles: recipients.roles,
        orderId,
        type: "target_date",
        message:
          seq === 1
            ? `${recipients.label} set for ${label} — ${when}${why}`
            : `${recipients.label} revised for ${label} — ${when}${why}`,
      });
    }

    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("addTargetRevision failed:", error);
    return { ok: false, error: "Could not save the target date." };
  }
}

/**
 * Undo the most recent value of a target date. Only the latest is removable —
 * rewriting the middle of a history is what makes a history worthless.
 */
export async function deleteTargetRevisionAction(
  orderId: string,
  targetKey: string
): Promise<TargetRevisionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!canEditSection(user.role, "orders")) {
    return { ok: false, error: "You don't have permission to set target dates." };
  }
  if (!isTargetKey(targetKey)) {
    return { ok: false, error: "Unknown target date." };
  }

  const target = TARGET_BY_KEY.get(targetKey)!;
  try {
    const { removed, now } = await deleteLatestTargetRevision(orderId, target);
    if (removed === null) {
      return { ok: false, error: "There is nothing to remove." };
    }

    const label = (await getOrderLabel(orderId)) ?? orderId;
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.target_date",
      category: "activity",
      target: label,
      details: now
        ? `Removed ${target.label} ${removed}, back to ${now}`
        : `Cleared ${target.label} (was ${removed})`,
      subject: { orderId, soNo: label },
    });

    // Same reasoning as setting one: the department is working to this date,
    // so being told it was withdrawn matters as much as being told it moved.
    const recipients = targetDateRecipients(target.column);
    if (recipients) {
      await emitNotification({
        roles: recipients.roles,
        orderId,
        type: "target_date",
        message: now
          ? `${recipients.label} reverted for ${label} — ${formatTargetDate(now)}`
          : `${recipients.label} cleared for ${label}`,
      });
    }

    revalidatePath(`/risansi/orders/${orderId}`);
    return { ok: true };
  } catch (error) {
    console.error("deleteTargetRevision failed:", error);
    return { ok: false, error: "Could not remove the target date." };
  }
}

/**
 * The change history of one target date, for the read-only view departments
 * get in their queue. Any signed-in user may read it: the date is already
 * shown to them, and why it moved is the part they actually need.
 *
 * Loaded on demand rather than joined into every queue page — most rows are
 * never opened, and a target rarely has more than a couple of entries.
 */
export async function getTargetHistoryAction(
  orderId: string,
  targetKey: string
): Promise<TargetRevision[]> {
  const user = await getCurrentUser();
  if (!user || !isTargetKey(targetKey)) return [];
  const all = await listTargetRevisions(orderId);
  return all.filter((r) => r.target_key === targetKey);
}

// ---------------------------------------------------------------------------
// Department completion
// ---------------------------------------------------------------------------

export type DeptCompleteResult =
  | { ok: true; completion: DeptCompletion | null }
  | { ok: false; error: string };

/** Section table each department signs off through, for the permission check. */
const DEPT_SECTION: Record<DeptKey, OrderTable> = {
  drawing: "order_drawing",
  purchase: "order_purchase",
  quality: "order_qc",
  planning: "order_planning",
  assembly: "order_assembly_dispatch",
  billing: "order_billing",
  accounts: "order_accounts",
  // Dispatch status is derived from the invoices, which Billing owns.
  dispatch: "order_billing",
};

/**
 * Tick or untick a department's sign-off. `scopeId` is the EC's item id for the
 * per-EC departments and the SO's order id for the rest.
 *
 * Whoever may edit the department's own section may sign it off — the same rule
 * that governs every other write it makes — and Central Visibility can too.
 */
export async function setDeptCompleteAction(
  scopeId: string,
  dept: string,
  complete: boolean
): Promise<DeptCompleteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You are not signed in." };
  if (!(DEPT_FILTER_KEYS as readonly string[]).includes(dept)) {
    return { ok: false, error: "Unknown department." };
  }
  const key = dept as DeptKey;
  if (!canEditSection(user.role, DEPT_SECTION[key])) {
    return {
      ok: false,
      error: "You don't have permission to complete this department.",
    };
  }

  try {
    if (!complete) {
      const orderId = await uncompleteDept(scopeId, key);
      if (!orderId) return { ok: false, error: "Nothing to undo." };
      const subject =
        scopeId === orderId ? await subjectForOrder(orderId) : await subjectForItem(scopeId);
      await logAudit({
        actor: { id: user.id, email: user.email, role: user.role },
        action: "order.dept_complete",
        category: "activity",
        target: subject.soNo ?? orderId,
        details: `Reopened ${DEPT_LABELS[key]}`,
        subject,
      });
      revalidatePath(`/risansi/orders/${orderId}`);
      return { ok: true, completion: null };
    }

    const completion = await completeDept({
      scopeId,
      dept: key,
      actorId: user.id,
      actorRole: user.role,
    });
    if (!completion) return { ok: false, error: "Could not find that record." };

    const label = (await getOrderLabel(completion.order_id)) ?? completion.order_id;
    const took = describeDays(completion.days_taken);
    await logAudit({
      actor: { id: user.id, email: user.email, role: user.role },
      action: "order.dept_complete",
      category: "activity",
      target: label,
      details: `Completed ${DEPT_LABELS[key]}${took ? ` — ${took}` : ""}`,
      subject: completion.item_id
        ? await subjectForItem(completion.item_id)
        : { orderId: completion.order_id, soNo: label },
    });

    // Central Visibility tracks the pipeline, so a department finishing is
    // exactly the kind of event they should not have to go looking for.
    if (user.role !== "central_visibility") {
      await emitNotification({
        roles: ["central_visibility"],
        orderId: completion.order_id,
        itemId: completion.item_id,
        type: "dept_update",
        message: `${DEPT_LABELS[key]} completed for ${label}${took ? ` — ${took}` : ""}`,
      });
    }

    revalidatePath(`/risansi/orders/${completion.order_id}`);
    return { ok: true, completion };
  } catch (error) {
    console.error("setDeptComplete failed:", error);
    return { ok: false, error: "Could not save. Please try again." };
  }
}
