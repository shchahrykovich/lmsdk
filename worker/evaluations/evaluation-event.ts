export type EvaluationEventType =
  | "started"
  | "call_started"
  | "call_succeeded"
  | "call_failed"
  | "finished"
  | "failed";

export interface EvaluationEventDetails {
  totalCalls?: number;
  attempt?: number;
  provider?: string;
  model?: string;
  durationMs?: number;
  error?: string;
}

export interface NewEvaluationEvent {
  type: EvaluationEventType;
  recordId?: number;
  promptId?: number;
  versionId?: number;
  details?: EvaluationEventDetails;
}

export interface EvaluationEvent {
  id: number;
  type: EvaluationEventType;
  recordId: number | null;
  promptId: number | null;
  versionId: number | null;
  details: EvaluationEventDetails;
  createdAt: Date;
}
