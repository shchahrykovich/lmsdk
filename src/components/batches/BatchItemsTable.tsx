/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import JsonSection from "@/components/JsonSection";
import { BATCH_ITEM_STATUSES, fetchBatchItems, type BatchItem, type BatchItemStatus } from "@/lib/batches";
import BatchStateBadge from "./BatchStateBadge";

const HEADER = "px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider";

type BatchItemsTableProps = Readonly<{
  projectId: number;
  batchId: number;
  refreshKey: number;
}>;

export default function BatchItemsTable({ projectId, batchId, refreshKey }: BatchItemsTableProps): React.ReactNode {
  const [status, setStatus] = useState<BatchItemStatus | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (cursor: string | null) => {
    try {
      setLoading(true);
      setError(null);
      const page = await fetchBatchItems(projectId, batchId, { cursor, status });
      setItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load items");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(null);
  }, [projectId, batchId, status, refreshKey]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[null, ...BATCH_ITEM_STATUSES].map((value) => (
          <Button
            key={value ?? "all"}
            variant={status === value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatus(value)}
          >
            {value ?? "all"}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className={`${HEADER} w-8`} />
              <th className={HEADER}>Custom id</th>
              <th className={HEADER}>Status</th>
              <th className={HEADER}>Tokens</th>
              <th className={HEADER}>Error</th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-center text-muted-foreground">
                  No items
                </td>
              </tr>
            )}
            {items.map((item) => (
              <Fragment key={item.id}>
                <tr
                  className="hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                >
                  <td className="px-4 py-2 text-muted-foreground">
                    {expanded === item.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </td>
                  <td className="px-4 py-2 text-sm font-mono text-foreground">{item.custom_id}</td>
                  <td className="px-4 py-2">
                    <BatchStateBadge state={item.status} />
                  </td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">
                    {typeof item.usage?.total_tokens === "number" ? item.usage.total_tokens : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm text-red-600 dark:text-red-400 truncate max-w-md">
                    {item.error ? `${item.error.code}: ${item.error.message}` : ""}
                  </td>
                </tr>
                {expanded === item.id && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 bg-muted/20">
                      <JsonSection title="Result" data={item.result ?? item.error ?? {}} compact />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <Button variant="outline" size="sm" disabled={loading} onClick={() => void load(nextCursor)}>
          {loading ? "Loading..." : "Load more"}
        </Button>
      )}
    </div>
  );
}
