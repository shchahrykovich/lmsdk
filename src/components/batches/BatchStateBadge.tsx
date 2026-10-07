/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { cn } from "@/lib/utils";

const STATE_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  submitting: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  finished: "bg-green-500/15 text-green-700 dark:text-green-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  cancelled: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pending: "bg-muted text-muted-foreground",
  succeeded: "bg-green-500/15 text-green-700 dark:text-green-300",
  errored: "bg-red-500/15 text-red-700 dark:text-red-300",
  expired: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  stuck: "bg-red-500/15 text-red-700 dark:text-red-300",
};

export default function BatchStateBadge({ state }: Readonly<{ state: string }>): React.ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STATE_CLASSES[state] ?? "bg-muted text-muted-foreground"
      )}
    >
      {state}
    </span>
  );
}
