import { formatDuration } from "./format";

export type ActivityEventType =
  | "started"
  | "call_started"
  | "call_succeeded"
  | "call_failed"
  | "results_reused"
  | "finished"
  | "failed";

export interface ActivityEventDetails {
  totalCalls?: number;
  attempt?: number;
  provider?: string;
  model?: string;
  durationMs?: number;
  error?: string;
  reusedCalls?: number;
  baseEvaluationId?: number;
}

export interface ActivityEvent {
  id: number;
  type: ActivityEventType;
  recordId: number | null;
  promptId: number | null;
  versionId: number | null;
  details: ActivityEventDetails;
  createdAt: string;
}

export interface ActivityProgress {
  totalCalls: number;
  succeededCalls: number;
  sentAttempts: number;
  failedAttempts: number;
  reusedCalls?: number;
  lastEventAt: string | null;
}

export interface EvaluationActivity {
  events: ActivityEvent[];
  progress: ActivityProgress;
}

export type VersionLabels = Record<number, string>;

export interface ActivityStatus {
  tone: "info" | "warning" | "error" | "success";
  text: string;
}

export const STUCK_AFTER_MS = 11 * 60 * 1000;

export const isActiveEvaluationState = (state: string): boolean => state === "created" || state === "running";

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const versionLabel = (event: ActivityEvent, labels: VersionLabels): string =>
  event.versionId === null ? "unknown version" : labels[event.versionId] ?? `version ${event.versionId}`;

const withDuration = (text: string, durationMs: number | undefined, joiner: string): string =>
  durationMs === undefined ? text : `${text}${joiner}${formatDuration(durationMs)}`;

const withError = (text: string, error: string | undefined): string => (error ? `${text}: ${error}` : text);

const modelOf = ({ provider, model }: ActivityEventDetails): string | undefined =>
  provider && model ? `${provider}/${model}` : model ?? provider;

function describeSentCall(event: ActivityEvent, labels: VersionLabels): string {
  const model = modelOf(event.details);
  const target = model ? `${versionLabel(event, labels)} (${model})` : versionLabel(event, labels);
  const text = `Sent record #${event.recordId} to ${target}`;
  return event.details.attempt === undefined ? text : `${text}, attempt ${event.details.attempt}`;
}

function describeFailedCall(event: ActivityEvent, labels: VersionLabels): string {
  const text = `Record #${event.recordId} on ${versionLabel(event, labels)} failed`;
  const withAttempt = event.details.attempt === undefined ? text : `${text} on attempt ${event.details.attempt}`;
  return withError(withAttempt, event.details.error);
}

export function describeEvent(event: ActivityEvent, labels: VersionLabels): string {
  const { details } = event;
  switch (event.type) {
    case "started":
      return details.totalCalls === undefined ? "Started" : `Started: ${plural(details.totalCalls, "call")} to run`;
    case "call_started":
      return describeSentCall(event, labels);
    case "call_succeeded":
      return withDuration(`Answer for record #${event.recordId} from ${versionLabel(event, labels)}`, details.durationMs, " in ");
    case "call_failed":
      return describeFailedCall(event, labels);
    case "results_reused":
      return `Reused ${plural(details.reusedCalls ?? 0, "result")} from evaluation #${details.baseEvaluationId ?? "?"}`;
    case "finished":
      return withDuration("Finished", details.durationMs, " in ");
    case "failed":
      return withError(withDuration("Failed", details.durationMs, " after "), details.error);
  }
}

const doneCalls = (progress: ActivityProgress): number => progress.succeededCalls + (progress.reusedCalls ?? 0);

export function describeProgress(progress: ActivityProgress): string {
  const reused = progress.reusedCalls ? ` (${progress.reusedCalls} reused)` : "";
  const done = `${doneCalls(progress)} of ${plural(progress.totalCalls, "call")} done${reused}`;
  return progress.failedAttempts > 0 ? `${done} · ${plural(progress.failedAttempts, "failed attempt")}` : done;
}

export const progressPercent = (progress: ActivityProgress): number =>
  progress.totalCalls > 0 ? Math.min(100, Math.round((doneCalls(progress) / progress.totalCalls) * 100)) : 0;

function waitingStatus(event: ActivityEvent, labels: VersionLabels, waitedMs: number): ActivityStatus {
  const call = `record #${event.recordId} from ${versionLabel(event, labels)}`;
  if (waitedMs > STUCK_AFTER_MS) {
    return {
      tone: "warning",
      text: `No answer for ${call} for ${formatDuration(waitedMs)}. A call ends or is retried within 10 minutes, so the run may be stuck.`,
    };
  }
  const attempt = event.details.attempt === undefined ? "" : ` (attempt ${event.details.attempt})`;
  return { tone: "info", text: `Waiting ${formatDuration(waitedMs)} for an answer for ${call}${attempt}` };
}

function activeStatus(latest: ActivityEvent | undefined, labels: VersionLabels, nowMs: number): ActivityStatus {
  if (!latest) {
    return { tone: "info", text: "Waiting for the run to start" };
  }
  const quietMs = Math.max(0, nowMs - new Date(latest.createdAt).getTime());
  if (latest.type === "call_started") {
    return waitingStatus(latest, labels, quietMs);
  }
  if (quietMs > STUCK_AFTER_MS) {
    return { tone: "warning", text: `No activity for ${formatDuration(quietMs)}. The run may be stuck.` };
  }
  return { tone: "info", text: `Running. Last activity ${formatDuration(quietMs)} ago` };
}

export function currentStatus(
  state: string,
  activity: EvaluationActivity,
  labels: VersionLabels,
  nowMs: number
): ActivityStatus {
  const latest = activity.events[0];
  if (state === "failed") {
    const failed = activity.events.find((event) => event.type === "failed");
    return { tone: "error", text: failed ? describeEvent(failed, labels) : "Failed" };
  }
  if (state === "finished") {
    const finished = activity.events.find((event) => event.type === "finished");
    return { tone: "success", text: finished ? describeEvent(finished, labels) : "Finished" };
  }
  return activeStatus(latest, labels, nowMs);
}
