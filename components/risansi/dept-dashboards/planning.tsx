"use client";

import { useState } from "react";
import { SingleSelectFilter } from "../multi-select-filter";
import { formatDate } from "./dates";
import {
  DeadlineList,
  DeptStatCards,
  FilterBar,
  Panel,
  StatusBars,
  WorkTable,
  baseColumns,
} from "./parts";
import {
  useDeptDashboard,
  type DeptDashboardProps,
} from "./use-dept-dashboard";

/**
 * Planning's board. Planning has no deadline of its own — it schedules to the
 * order's dispatch date, which is the one date on the order that gets revised.
 * A revision moves the whole plan, so the original date stays on screen beside
 * it and a filter picks out the orders that have moved.
 */
export function PlanningDashboard(props: DeptDashboardProps) {
  const [revised, setRevised] = useState<string | null>(null);

  const d = useDeptDashboard("planning", props, {
    filter: (r) => !revised || (revised === "Revised") === !!r.dispatch_target_revised_date,
    active: !!revised,
    onClear: () => setRevised(null),
  });
  const c = baseColumns(d);

  return (
    <div>
      <DeptStatCards d={d} />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Planning status" wide>
          <StatusBars d={d} />
        </Panel>
        <Panel title="Next dispatch dates">
          <DeadlineList d={d} />
        </Panel>
      </div>

      <FilterBar
        d={d}
        extra={
          <SingleSelectFilter
            label="Dispatch date"
            allLabel="Any"
            options={[
              { value: "Revised", label: "Revised" },
              { value: "Original", label: "Not revised" },
            ]}
            selected={revised}
            onChange={setRevised}
          />
        }
      />

      <WorkTable
        d={d}
        columns={[
          c.sl,
          c.so,
          c.ec,
          c.client,
          c.zone,
          c.status,
          // c.target already resolves to the revised date where there is one;
          // this says what it was before, so a slipped plan is visible.
          {
            ...c.target,
            label: "Dispatch target",
          },
          {
            key: "original",
            label: "Originally",
            className: "whitespace-nowrap text-muted",
            cell: (r) =>
              r.dispatch_target_revised_date ? (
                <span className="line-through">
                  {formatDate(r.dispatch_target_date)}
                </span>
              ) : (
                "—"
              ),
          },
          c.signOff,
        ]}
        minWidth={1000}
      />
    </div>
  );
}
