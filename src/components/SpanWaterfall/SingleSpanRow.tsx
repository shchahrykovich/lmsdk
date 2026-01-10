/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useRef } from "react";
import { Clock, Timer, CheckCircle2, AlertCircle } from "lucide-react";
import {formatDuration, formatTime, useTooltipPosition} from "./tooltip-utils";
import type {LogEntry, SpanData} from "./types";
import TimelineMarkers from "./TimelineMarkers";

export type SingleSpanRowProps = Readonly<{
  span: SpanData;
  spans: SpanData[];
  totalDuration: number;
  hoveredSpan: number | null;
  onHoverSpan: (value: number | null) => void;
  onSpanClick?: (log: LogEntry) => void;
}>;

export default function SingleSpanRow({
  span,
  spans,
  totalDuration,
  hoveredSpan,
  onHoverSpan,
  onSpanClick,
}: SingleSpanRowProps): React.ReactNode {
  const barRef = useRef<HTMLDivElement>(null);
  const { tooltipPosition, handleMouseEnterWithTooltip } = useTooltipPosition();
  const widthPercent = totalDuration > 0 ? (span.duration / totalDuration) * 100 : 0;
  const leftPercent = totalDuration > 0 ? (span.relativeStart / totalDuration) * 100 : 0;
  const spanGlobalIndex = spans.findIndex((s) => s.log.id === span.log.id);
  const isHovered = hoveredSpan === spanGlobalIndex;
  const isSuccess = span.log.isSuccess;
  const StatusIcon = isSuccess ? CheckCircle2 : AlertCircle;
  const statusClassName = isSuccess ? "text-emerald-600" : "text-red-600";
  const barClassName = isSuccess
    ? "bg-emerald-500 hover:bg-emerald-600"
    : "bg-red-500 hover:bg-red-600";

  return (
    <div className="grid grid-cols-[250px_1fr] gap-4 items-center">
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="w-4 shrink-0"></div>
          <StatusIcon className={`h-4 w-4 shrink-0 ${statusClassName}`} />
          <span className="font-medium text-foreground truncate">
            {span.log.promptName ?? `Prompt #${span.log.promptId}`}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            v{span.log.version}
          </span>
        </div>
      </div>

      <div className="relative flex items-center gap-2">
        <div ref={barRef} className="relative h-8 bg-muted/30 rounded flex-1">
          <div className="absolute inset-0 flex items-center">
            <TimelineMarkers />
          </div>

          <div
            className={`absolute h-full rounded transition-all cursor-pointer ${
              barClassName
            } ${isHovered ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
            style={{
              left: `${leftPercent}%`,
              width: `${Math.max(widthPercent, 0.5)}%`,
            }}
            onMouseEnter={(e) => handleMouseEnterWithTooltip(e, () => onHoverSpan(spanGlobalIndex))}
            onMouseLeave={() => onHoverSpan(null)}
            onClick={() => onSpanClick?.(span.log)}
          >
            {widthPercent > 10 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-medium text-white">
                  {formatDuration(span.duration)}
                </span>
              </div>
            )}
          </div>

          {isHovered && (
            <div
              className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-3 text-sm whitespace-nowrap pointer-events-none"
              style={{
                left: `${Math.min(leftPercent, 70)}%`,
                ...(tooltipPosition === 'below'
                  ? { top: "100%", marginTop: "8px" }
                  : { bottom: "100%", marginBottom: "8px" }
                ),
              }}
            >
              <div className="space-y-1.5">
                <div className="font-semibold text-foreground">
                  {span.log.promptName ?? `Prompt #${span.log.promptId}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Version {span.log.version} · Log #{span.log.id}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground mt-2">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Start: {formatTime(span.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" />
                  <span>Duration: {formatDuration(span.duration)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusIcon className={`h-3.5 w-3.5 ${statusClassName}`} />
                  <span className={statusClassName}>
                    {isSuccess ? "Success" : "Error"}
                  </span>
                </div>
                {!isSuccess && span.log.errorMessage && (
                  <div className="mt-2 pt-2 border-t border-border">
                    <div className="text-xs text-red-500 max-w-xs">
                      {span.log.errorMessage}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
