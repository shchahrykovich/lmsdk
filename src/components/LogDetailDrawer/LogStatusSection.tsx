/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Clock, Timer, CheckCircle2, AlertCircle } from "lucide-react";

type LogStatusSectionProps = Readonly<{
  isSuccess: boolean;
  durationMs: number | null;
  createdAt: number | string;
  errorMessage: string | null;
}>;

export function LogStatusSection({
  isSuccess,
  durationMs,
  createdAt,
  errorMessage,
}: LogStatusSectionProps): React.ReactNode {
  const formatDateTime = (value: string | number) => {
    const timestamp =
      typeof value === "number" && value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3 mb-3">
        {isSuccess ? (
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">Success</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Error</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Timer className="h-3.5 w-3.5" />
          <span>
            {typeof durationMs === "number"
              ? `${durationMs} ms`
              : "Duration unavailable"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatDateTime(createdAt)}</span>
        </div>
      </div>
      {errorMessage && (
        <div className="text-sm text-red-500 mt-3 whitespace-pre-wrap">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
