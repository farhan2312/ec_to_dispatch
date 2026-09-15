"use client";

import { PackageCheck } from "lucide-react";
import {
  DeptStatCards,
  FilterBar,
  Panel,
  SignOffList,
  StatCard,
  StatusBars,
  WorkTable,
  baseColumns,
  textColumn,
} from "./parts";
import {
  useDeptDashboard,
  type DeptDashboardProps,
} from "./use-dept-dashboard";

/**
 * Dispatch's board. Work is per SO and comes last: an order reaches this
 * department once Assembly & Packing has packed it, and leaves when it is
 * fully dispatched. The figure that matters here is how much is packed and
 * waiting — work sitting on the floor with nothing stopping it going out.
 */
export function DispatchDashboard(props: DeptDashboardProps) {
  const d = useDeptDashboard("dispatch", props);
  const c = baseColumns(d);

  // Ready but not gone: Assembly has packed at least one EC and the order is
  // not yet fully dispatched. The pipeline's own status vocabulary decides
  // "gone"; `assembly_done` is the packing date Assembly records.
  const readyNotGone = d.mine.filter(
    (r) => r.assembly_done && !d.view.done(r)
  ).length;

  return (
    <div>
      <DeptStatCards
        d={d}
        extra={
          <StatCard
            icon={PackageCheck}
            label="Packed, not dispatched"
            value={readyNotGone}
            hint="ready to go out"
            accent="bg-emerald-50 text-emerald-600"
          />
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Dispatch status" wide>
          <StatusBars d={d} />
        </Panel>
        <Panel title="Recently completed">
          <SignOffList d={d} />
        </Panel>
      </div>

      <FilterBar d={d} />

      <WorkTable
        d={d}
        columns={[
          c.sl,
          c.so,
          c.client,
          c.zone,
          textColumn("bill", "Bill type", (r) => r.bill_type),
          textColumn("packed", "Packed", (r) => (r.assembly_done ? "Yes" : "—")),
          c.target,
          c.status,
          c.signOff,
        ]}
      />
    </div>
  );
}
