/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import {
  barHeightPercent,
  formatCount,
  formatDayLabel,
  type DailyExecutions,
} from "@/lib/project-stats";

type DailyExecutionsChartProps = Readonly<{
  daily: DailyExecutions[];
}>;

export default function DailyExecutionsChart({ daily }: DailyExecutionsChartProps): React.ReactNode {
  const max = Math.max(0, ...daily.map((day) => day.total));
  const windowTotal = daily.reduce((sum, day) => sum + day.total, 0);

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Executions, last {daily.length} days</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary" />
            Succeeded
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500" />
            Failed
          </span>
          <span>{formatCount(windowTotal)} total (UTC days)</span>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-40">
        {daily.map((day) => (
          <div
            key={day.date}
            className="flex-1 h-full flex flex-col justify-end"
            title={`${formatDayLabel(day.date)}: ${formatCount(day.total)} executions, ${formatCount(day.failed)} failed`}
          >
            <div
              className="w-full flex flex-col justify-end rounded-t-sm overflow-hidden bg-primary"
              style={{ height: `${barHeightPercent(day.total, max)}%` }}
            >
              <div
                className="w-full bg-red-500"
                style={{ height: `${day.total > 0 ? (day.failed / day.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-2">
        {daily.map((day, index) => (
          <div key={day.date} className="flex-1 text-center text-[10px] text-muted-foreground tabular-nums">
            {index % 2 === daily.length % 2 ? "" : formatDayLabel(day.date)}
          </div>
        ))}
      </div>
      {windowTotal === 0 && (
        <p className="text-sm text-muted-foreground mt-4">No executions in this period.</p>
      )}
    </div>
  );
}
