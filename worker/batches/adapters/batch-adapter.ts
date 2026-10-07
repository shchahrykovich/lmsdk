import type { ExecuteRequest, ExecuteResult } from "../../providers/base-provider";

export interface BatchItemError {
  code: string;
  message: string;
}

export type ItemOutcome =
  | { kind: "succeeded"; result: ExecuteResult }
  | { kind: "errored"; error: BatchItemError }
  | { kind: "expired" }
  | { kind: "cancelled" };

export interface ParsedResultLine {
  key: string;
  outcome: ItemOutcome;
}

export type ShardOutcome = "completed" | "expired" | "cancelled" | "failed";

export interface ResultFileRef {
  kind: string;
  ref: string;
}

export interface ShardStatus {
  providerStatus: string;
  done: boolean;
  outcome?: ShardOutcome;
  resultFiles: ResultFileRef[];
  errorMessage?: string;
  resubmit?: boolean;
}

export interface ShardInput {
  shardKey: string;
  model: string;
  itemCount: number;
  bytes: number;
  existingInputFileId?: string | null;
  openBody: () => ReadableStream<Uint8Array>;
}

export interface SubmittedShard {
  providerBatchId: string;
  inputFileId?: string;
}

export interface DownloadedFile {
  body: ReadableStream<Uint8Array>;
  length?: number;
}

export interface BatchLimits {
  maxItems: number;
  maxBytes: number;
}

export interface BatchAdapter {
  readonly provider: string;
  readonly limits: BatchLimits;
  encodeLine(key: string, request: ExecuteRequest): string;
  submit(shard: ShardInput): Promise<SubmittedShard>;
  findSubmitted?(shard: ShardInput): Promise<SubmittedShard | null>;
  poll(providerBatchId: string): Promise<ShardStatus>;
  download(file: ResultFileRef): Promise<DownloadedFile>;
  parseResultLine(line: string, requestedModel: string): ParsedResultLine;
  cancel(providerBatchId: string): Promise<void>;
}

export class RetryLaterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryLaterError";
  }
}

export class ProviderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderRejectedError";
  }
}

export class BatchHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BatchHttpError";
    this.status = status;
  }
}

export function classifySubmitStatus(status: number, message: string): Error {
  if (status === 429) {
    return new RetryLaterError(message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRejectedError(message);
  }
  return new BatchHttpError(message, status);
}

const singleErrorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function errorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    parts.push(singleErrorText(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join("\nCaused by: ");
}
