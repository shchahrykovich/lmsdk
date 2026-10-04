/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";

type StatCardProps = Readonly<{
  label: string;
  value: string;
  detail?: string;
  icon: React.ReactNode;
}>;

export default function StatCard({ label, value, detail, icon }: StatCardProps): React.ReactNode {
  return (
    <div className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold text-foreground mt-2 tabular-nums">{value}</div>
      {detail && <div className="text-xs text-muted-foreground mt-1 truncate">{detail}</div>}
    </div>
  );
}
