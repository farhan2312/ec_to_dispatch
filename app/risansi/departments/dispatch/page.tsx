import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canEditChild, canEditSection } from "@/lib/roles";
import {
  listOrdersForBillingPage,
  resolveFocusOrderId,
  listDeptCompletions,
  listOrderListOptions,
} from "@/lib/orders";
import { parsePage, parseQuery } from "@/lib/pagination";
import { parseDeptFilter } from "@/lib/order-list-filter";
import { unreadByOrder } from "@/lib/order-messages";
import { BillingWorkspace } from "@/components/risansi/billing-workspace";

export const metadata: Metadata = {
  title: "Dispatch | Risansi",
};

export const dynamic = "force-dynamic";

const TABLE = "order_dispatch" as const;

export default async function DispatchWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canEditSection(user.role, TABLE)) redirect("/risansi/dashboard");

  const params = await searchParams;
  const { edit, thread, page, q } = params;
  // This department's own filter bar, with the department pinned. "Ready to
  // dispatch" is the one it adds: the orders Assembly & Packing has packed.
  const filter = parseDeptFilter((key) => params[key], "dispatch");
  const focusOrderId = await resolveFocusOrderId(thread ?? edit);
  const filterOptions = await listOrderListOptions();
  // The same per-SO page Billing reads: it carries each SO's invoice cards,
  // which are this department's work.
  const queue = await listOrdersForBillingPage({
    page: parsePage(page),
    search: parseQuery(q),
    focusOrderId,
    filter,
  });

  const ids = [...new Set(queue.rows.map((o) => String(o.id)))];
  const completions = await listDeptCompletions(ids);
  const unreadThreads = await unreadByOrder(ids, user);

  return (
    <div className="px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <PackageCheck className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Dispatch
          </h1>
          <p className="text-sm text-muted">
            What leaves the works, once Assembly &amp; Packing has packed it: an
            invoice (or challan) card per despatch, its transporter and vehicle,
            the docket and charges, and the LR. The order&apos;s dispatch status
            follows from these.
          </p>
        </div>
      </div>

      <BillingWorkspace
        mode="dispatch"
        completions={completions}
        openThreadId={thread}
        focusOrderId={focusOrderId ?? undefined}
        role={user.role}
        unreadThreads={unreadThreads}
        queue={queue}
        filterOptions={filterOptions}
        canEdit={canEditChild(user.role, "order_invoices")}
        openOrderId={edit}
      />
    </div>
  );
}
