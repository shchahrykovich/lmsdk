import type { JSX } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  currentStatus,
  describeEvent,
  describeProgress,
  isActiveEvaluationState,
  progressPercent,
  type ActivityStatus,
  type EvaluationActivity,
  type VersionLabels,
} from "@/lib/evaluation-activity";

interface EvaluationActivityPanelProps {
  readonly state: string;
  readonly activity: EvaluationActivity;
  readonly versionLabels: VersionLabels;
  readonly nowMs: number;
}

const toneClasses: Record<ActivityStatus["tone"], string> = {
  info: "border-border bg-muted/40 text-foreground",
  warning: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  error: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  success: "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100",
};

function StatusIcon({ status, active }: Readonly<{ status: ActivityStatus; active: boolean }>): JSX.Element {
  if (status.tone === "error") return <AlertCircle className="h-4 w-4 shrink-0" />;
  if (status.tone === "warning") return <AlertTriangle className="h-4 w-4 shrink-0" />;
  if (status.tone === "success") return <CheckCircle2 className="h-4 w-4 shrink-0" />;
  return active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />;
}

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function EvaluationActivityPanel({
  state,
  activity,
  versionLabels,
  nowMs,
}: EvaluationActivityPanelProps): JSX.Element {
  const status = currentStatus(state, activity, versionLabels, nowMs);
  const active = isActiveEvaluationState(state);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <span className="text-sm text-muted-foreground">{describeProgress(activity.progress)}</span>
      </div>

      <Progress value={progressPercent(activity.progress)} className="h-1.5" />

      <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", toneClasses[status.tone])}>
        <StatusIcon status={status} active={active} />
        <span className="break-words">{status.text}</span>
      </div>

      {activity.events.length > 0 && (
        <ol className="max-h-64 overflow-y-auto divide-y divide-border text-sm">
          {activity.events.map((event) => (
            <li key={event.id} className="flex gap-3 py-1.5">
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground leading-5">{timeOf(event.createdAt)}</span>
              <span className={cn("break-words", event.type.endsWith("failed") && "text-red-600 dark:text-red-400")}>
                {describeEvent(event, versionLabels)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
