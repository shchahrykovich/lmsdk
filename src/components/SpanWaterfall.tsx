/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useMemo, useState, useRef, useEffect } from "react";
import { Clock, Timer, CheckCircle2, AlertCircle, ChevronRight, ChevronDown } from "lucide-react";
import {formatDuration, formatTime, normalizeTimestamp, useTooltipPosition} from "./SpanWaterfall/tooltip-utils";
import type {GroupedSpans, LogEntry, SpanData} from "@/components/SpanWaterfall/types.ts";
import SingleSpanRow from "@/components/SpanWaterfall/SingleSpanRow.tsx";
import TimelineMarkers from "@/components/SpanWaterfall/TimelineMarkers.tsx";
import SpanRow from "@/components/SpanWaterfall/SpanRow.tsx";

type SpanWaterfallProps = Readonly<{
  logs: LogEntry[];
  onSpanClick?: (log: LogEntry) => void;
}>;

type GroupHeaderRowProps = Readonly<{
  group: GroupedSpans;
  groupKey: string;
  isCollapsed: boolean;
  totalDuration: number;
  hoveredGroup: string | null;
  onHoverGroup: (key: string | null) => void;
  onToggleGroup: (key: string) => void;
}>;

type GroupCollapsedSummaryProps = Readonly<{
  group: GroupedSpans;
  groupKey: string;
  totalDuration: number;
  hoveredGroup: string | null;
  onHoverGroup: (key: string | null) => void;
  onToggleGroup: (key: string) => void;
  barClassName: string;
  isError: boolean;
}>;

function GroupCollapsedSummary({
  group,
  groupKey,
  totalDuration,
  hoveredGroup,
  onHoverGroup,
  onToggleGroup,
  barClassName,
  isError,
}: GroupCollapsedSummaryProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const { tooltipPosition, handleMouseEnterWithTooltip } = useTooltipPosition();

  return (
    <div className="relative flex items-center gap-2">
      <div ref={barRef} className="relative h-8 bg-muted/30 rounded flex-1">
        <div className="absolute inset-0 flex items-center">
          <TimelineMarkers />
        </div>

        <div
          className={`absolute h-full rounded transition-all cursor-pointer ${
            barClassName
          } ${hoveredGroup === groupKey ? "ring-2 ring-offset-1 ring-foreground" : ""}`}
          style={{
            left: `${totalDuration > 0 ? (group.relativeStart / totalDuration) * 100 : 0}%`,
            width: `${Math.max(
              totalDuration > 0
                ? ((group.relativeEnd - group.relativeStart) / totalDuration) * 100
                : 0,
              0.5
            )}%`,
          }}
          onMouseEnter={(e) => handleMouseEnterWithTooltip(e, () => onHoverGroup(groupKey), 180)}
          onMouseLeave={() => onHoverGroup(null)}
          onClick={(event) => {
            event.stopPropagation();
            onToggleGroup(groupKey);
          }}
        />

        {hoveredGroup === groupKey && (
          <div
            className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-3 text-sm whitespace-nowrap pointer-events-none"
            style={{
              left: `${Math.min(
                totalDuration > 0 ? (group.relativeStart / totalDuration) * 100 : 0,
                70
              )}%`,
              ...(tooltipPosition === 'below'
                ? { top: "100%", marginTop: "8px" }
                : { bottom: "100%", marginBottom: "8px" }
              ),
            }}
          >
            <div className="space-y-1.5">
              <div className="font-semibold text-foreground">
                {group.promptName}
              </div>
              <div className="text-xs text-muted-foreground">
                Version {group.version} · {group.spans.length} execution
                {group.spans.length !== 1 ? "s" : ""}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground mt-2">
                <Clock className="h-3.5 w-3.5" />
                <span>Start: {formatTime(group.minStartTime)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                <span>Total Duration: {formatDuration(group.totalDuration)}</span>
              </div>
              <div className="flex items-center gap-2">
                {isError ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                    <span className="text-red-600">
                      {group.successCount} success, {group.errorCount} error
                      {group.errorCount !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-600">
                      {group.successCount} success
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <span className="text-xs text-muted-foreground shrink-0">
        {formatDuration(group.totalDuration)}
      </span>
    </div>
  );
}

type GroupExpandedSummaryProps = Readonly<{
  group: GroupedSpans;
}>;

function GroupExpandedSummary({ group }: GroupExpandedSummaryProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Total: {formatDuration(group.totalDuration)}</span>
      {group.successCount > 0 && (
        <span className="text-emerald-600">{group.successCount} success</span>
      )}
      {group.errorCount > 0 && (
        <span className="text-red-600">
          {group.errorCount} error{group.errorCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function GroupHeaderRow({
  group,
  groupKey,
  isCollapsed,
  totalDuration,
  hoveredGroup,
  onHoverGroup,
  onToggleGroup,
}: GroupHeaderRowProps) {
  const isError = group.errorCount > 0;
  const StatusIcon = isError ? AlertCircle : CheckCircle2;
  const statusClassName = isError ? "text-red-600" : "text-emerald-600";
  const barClassName = isError
    ? "bg-red-500 hover:bg-red-600"
    : "bg-emerald-500 hover:bg-emerald-600";

  const summary = isCollapsed ? (
    <GroupCollapsedSummary
      group={group}
      groupKey={groupKey}
      totalDuration={totalDuration}
      hoveredGroup={hoveredGroup}
      onHoverGroup={onHoverGroup}
      onToggleGroup={onToggleGroup}
      barClassName={barClassName}
      isError={isError}
    />
  ) : (
    <GroupExpandedSummary group={group} />
  );

  return (
    <div
      className="grid grid-cols-[250px_1fr] gap-4 items-center cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2"
      onClick={() => onToggleGroup(groupKey)}
    >
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <StatusIcon className={`h-4 w-4 shrink-0 ${statusClassName}`} />
          <span className="font-medium text-foreground truncate">
            {group.promptName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            v{group.version}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            ({group.spans.length})
          </span>
        </div>
      </div>

      {summary}
    </div>
  );
}

export default function SpanWaterfall({ logs, onSpanClick }: SpanWaterfallProps): React.ReactNode {
  const [hoveredSpan, setHoveredSpan] = useState<number | null>(null);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [initializedCollapse, setInitializedCollapse] = useState(false);

  const { spans, totalDuration } = useMemo(() => {
    if (logs.length === 0) {
      return { spans: [], totalDuration: 0 };
    }

    // Calculate span data
    const spansData: SpanData[] = logs.map((log) => {
      const startTime = normalizeTimestamp(log.createdAt);
      const duration = log.durationMs ?? 0;

      return {
        log,
        startTime,
        duration,
        relativeStart: 0, // Will be calculated below
        relativeEnd: 0, // Will be calculated below
      };
    });

    // Sort by start time
    spansData.sort((a, b) => a.startTime - b.startTime);

    // Find the earliest start time
    const minTime = Math.min(...spansData.map((s) => s.startTime));
    const maxTime = Math.max(...spansData.map((s) => s.startTime + s.duration));
    const totalDuration = maxTime - minTime;

    // Calculate relative positions
    spansData.forEach((span) => {
      span.relativeStart = span.startTime - minTime;
      span.relativeEnd = span.relativeStart + span.duration;
    });

    return { spans: spansData, totalDuration };
  }, [logs]);

  // Group spans by prompt name and version (only if multiple executions)
  const { groupedSpans, singleSpans } = useMemo(() => {
    const groups = new Map<string, GroupedSpans>();

    spans.forEach((span) => {
      const promptName = span.log.promptName ?? `Prompt #${span.log.promptId}`;
      const version = span.log.version;
      const key = `${promptName}_v${version}`;

      if (!groups.has(key)) {
        groups.set(key, {
          promptName,
          promptId: span.log.promptId,
          version,
          spans: [],
          totalDuration: 0,
          successCount: 0,
          errorCount: 0,
          minStartTime: Infinity,
          maxEndTime: -Infinity,
          relativeStart: 0,
          relativeEnd: 0,
        });
      }

      const group = groups.get(key)!;
      group.spans.push(span);
      group.totalDuration += span.duration;

      // Track the earliest start and latest end
      group.minStartTime = Math.min(group.minStartTime, span.startTime);
      group.maxEndTime = Math.max(group.maxEndTime, span.startTime + span.duration);

      if (span.log.isSuccess) {
        group.successCount++;
      } else {
        group.errorCount++;
      }
    });

    // Separate single-execution groups from multi-execution groups
    const groupsArray: GroupedSpans[] = [];
    const singles: SpanData[] = [];

    groups.forEach((group) => {
      if (group.spans.length > 1) {
        groupsArray.push(group);
      } else {
        // Add the single span directly
        singles.push(group.spans[0]);
      }
    });

    // Calculate relative positions for groups
    if (spans.length > 0) {
      const minTime = Math.min(...spans.map((s) => s.startTime));

      groupsArray.forEach((group) => {
        group.relativeStart = group.minStartTime - minTime;
        group.relativeEnd = group.maxEndTime - minTime;
      });
    }

    return { groupedSpans: groupsArray, singleSpans: singles };
  }, [spans]);

  const timelineItems = useMemo(() => {
    const items = [
      ...groupedSpans.map((group) => ({ type: "group" as const, data: group })),
      ...singleSpans.map((span) => ({ type: "single" as const, data: span })),
    ];

    return items.sort((a, b) => {
      const timeA = a.type === "group" ? a.data.minStartTime : a.data.startTime;
      const timeB = b.type === "group" ? b.data.minStartTime : b.data.startTime;
      return timeA - timeB;
    });
  }, [groupedSpans, singleSpans]);

  // Initialize all groups as collapsed by default
  useEffect(() => {
    if (!initializedCollapse && groupedSpans.length > 0) {
      const allGroupKeys = groupedSpans.map(g => `${g.promptName}_v${g.version}`);
      setCollapsedGroups(new Set(allGroupKeys));
      setInitializedCollapse(true);
    }
  }, [groupedSpans, initializedCollapse]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  if (spans.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Timeline</h2>
        <div className="text-center text-muted-foreground py-8">
          No timing data available
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Timeline</h2>
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Timer className="h-4 w-4" />
            <span>Total duration: {formatDuration(totalDuration)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>{spans.length} execution{spans.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      {/* Timeline scale */}
      <div className="mb-4 grid grid-cols-[250px_1fr] gap-4">
        {/* Empty space for labels column */}
        <div></div>

        {/* Timeline scale column */}
        <div className="relative">
          {/* Duration scale */}
          <div className="relative h-6">
            <div className="absolute inset-0 flex justify-between items-center text-xs text-muted-foreground">
              <span>0ms</span>
              <span>{formatDuration(totalDuration / 4)}</span>
              <span>{formatDuration(totalDuration / 2)}</span>
              <span>{formatDuration((totalDuration * 3) / 4)}</span>
              <span>{formatDuration(totalDuration)}</span>
            </div>
          </div>

          {/* Date/Time labels */}
          <div className="relative h-5 mt-1 mb-7">
            <div className="absolute inset-0 flex justify-between items-start text-xs text-muted-foreground">
              <span className="flex flex-col items-start">
                <span className="font-medium">Start</span>
                <span>{formatTime(spans[0].startTime)}</span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-medium">End</span>
                <span>{formatTime(spans[spans.length - 1].startTime + spans[spans.length - 1].duration)}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {timelineItems.map((item) => {
          if (item.type === "group") {
            const group = item.data;
            const groupKey = `${group.promptName}_v${group.version}`;
            const isCollapsed = collapsedGroups.has(groupKey);

            return (
              <div key={groupKey} className="space-y-1">
                <GroupHeaderRow
                  group={group}
                  groupKey={groupKey}
                  isCollapsed={isCollapsed}
                  totalDuration={totalDuration}
                  hoveredGroup={hoveredGroup}
                  onHoverGroup={setHoveredGroup}
                  onToggleGroup={toggleGroup}
                />
                {!isCollapsed &&
                  group.spans.map((span, index) => (
                    <SpanRow
                      key={span.log.id}
                      span={span}
                      index={index}
                      spans={spans}
                      totalDuration={totalDuration}
                      hoveredSpan={hoveredSpan}
                      onHoverSpan={setHoveredSpan}
                      onSpanClick={onSpanClick}
                    />
                  ))}
              </div>
            );
          }

          return (
            <SingleSpanRow
              key={item.data.log.id}
              span={item.data}
              spans={spans}
              totalDuration={totalDuration}
              hoveredSpan={hoveredSpan}
              onHoverSpan={setHoveredSpan}
              onSpanClick={onSpanClick}
            />
          );
        })}
      </div>
    </div>
  );
}
