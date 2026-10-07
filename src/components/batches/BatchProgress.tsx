/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Progress } from "@/components/ui/progress";
import { completedPercent, type BatchCounts } from "@/lib/batches";

export default function BatchProgress({ counts }: Readonly<{ counts: BatchCounts }>): React.ReactNode {
  const done = counts.total - counts.pending;
  return (
    <div className="min-w-32 space-y-1">
      <Progress value={completedPercent(counts)} className="h-1.5" />
      <div className="text-xs text-muted-foreground">
        {done} / {counts.total} done
        {counts.errored > 0 && <span className="text-red-600 dark:text-red-400"> · {counts.errored} errored</span>}
      </div>
    </div>
  );
}
