/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import type { ProviderBatch } from "@/lib/batches";
import BatchStateBadge from "./BatchStateBadge";

const HEADER = "px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider";

export default function ProviderBatchesTable({ batches }: Readonly<{ batches: ProviderBatch[] }>): React.ReactNode {
  if (batches.length === 0) {
    return <p className="text-sm text-muted-foreground">No provider batches. Paced batches and drafts have none.</p>;
  }
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className={HEADER}>Provider batch id</th>
            <th className={HEADER}>State</th>
            <th className={HEADER}>Provider status</th>
            <th className={HEADER}>Items</th>
            <th className={HEADER}>Error</th>
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {batches.map((batch, index) => (
            <tr key={batch.id ?? `planned-${index}`}>
              <td className="px-4 py-2 text-sm font-mono text-foreground">{batch.id ?? "—"}</td>
              <td className="px-4 py-2">
                <BatchStateBadge state={batch.state} />
              </td>
              <td className="px-4 py-2 text-sm text-muted-foreground">{batch.provider_status ?? "—"}</td>
              <td className="px-4 py-2 text-sm text-muted-foreground">{batch.items}</td>
              <td className="px-4 py-2 text-sm text-red-600 dark:text-red-400">{batch.error ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
