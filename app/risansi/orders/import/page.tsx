import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { canCreateOrders } from "@/lib/roles";
import {
  BULK_HEADERS,
  SYSTEM_GENERATED_HEADERS,
} from "@/lib/import-templates";
import {
  HeaderReference,
  ImportOrdersPanel,
} from "@/components/risansi/import-orders-panel";

export const metadata: Metadata = {
  title: "Import Orders | Risansi",
};

export const dynamic = "force-dynamic";

export default async function ImportOrdersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateOrders(user.role)) redirect("/risansi/orders");

  return (
    <div className="px-8 py-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Import Orders
          </h1>
          <p className="text-sm text-muted">
            Bulk-load orders from Excel. Use the column reference below so your
            file&apos;s headers match.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6">
        <ImportOrdersPanel />

        <HeaderReference
          title="System-generated import"
          description="The core order columns filled at intake (SO/EC, client, item, pump). Use this to add new orders; departments fill their sections in the app afterwards. Date format is dd/mm/yyyy."
          headers={SYSTEM_GENERATED_HEADERS}
          templateType="system"
        />

        <HeaderReference
          title="Full (bulk) import"
          description="Every tracked column across all departments — for migrating a complete tracker. Include only the columns you have; unknown headers are ignored and blank cells are left empty. Date format is dd/mm/yyyy."
          headers={BULK_HEADERS}
          templateType="bulk"
        />
      </div>
    </div>
  );
}
