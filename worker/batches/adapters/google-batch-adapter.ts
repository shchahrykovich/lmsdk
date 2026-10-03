import type { ExecuteRequest } from "../../providers/base-provider";
import {
  buildGoogleRequest,
  googleResponseText,
  googleResult,
  toGoogleRestRequest,
  type GoogleRawResponse,
} from "../../providers/google-codec";
import { renderExecuteRequest } from "../../execution/prompt-renderer";
import {
  classifySubmitStatus,
  errorText,
  BatchHttpError,
  ProviderRejectedError,
  RetryLaterError,
  type BatchAdapter,
  type DownloadedFile,
  type ItemOutcome,
  type ParsedResultLine,
  type ResultFileRef,
  type ShardInput,
  type ShardStatus,
  type SubmittedShard,
} from "./batch-adapter";

export const GOOGLE_BATCH_LIMITS = { maxItems: 100_000, maxBytes: 500 * 1024 * 1024 };
export const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";

interface GoogleBatchOperation {
  name?: string;
  done?: boolean;
  metadata?: {
    state?: string;
    output?: { responsesFile?: string };
  };
  response?: { responsesFile?: string };
  error?: { code?: number; message?: string };
}

interface GoogleResultLine {
  key: string;
  response?: GoogleRawResponse;
  error?: { code?: number | string; message?: string; status?: string };
  status?: { code?: number | string; message?: string };
}

const TERMINAL: Record<string, ShardStatus["outcome"]> = {
  SUCCEEDED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
};

const stateName = (state: string | undefined): string => (state ?? "UNKNOWN").replace(/^(BATCH|JOB)_STATE_/, "");

export class GoogleBatchAdapter implements BatchAdapter {
  readonly provider = "google";
  readonly limits = GOOGLE_BATCH_LIMITS;

  private readonly apiKey: string;
  private readonly fetchFn: typeof fetch;

  constructor(apiKey: string, fetchFn: typeof fetch = (input, init) => fetch(input, init)) {
    this.apiKey = apiKey;
    this.fetchFn = fetchFn;
  }

  encodeLine(key: string, request: ExecuteRequest): string {
    const params = buildGoogleRequest(renderExecuteRequest(request), null);
    return JSON.stringify({ key, request: toGoogleRestRequest(params) });
  }

  async submit(shard: ShardInput): Promise<SubmittedShard> {
    const fileName = shard.existingInputFileId ?? (await this.uploadInputSafely(shard));
    const operation = await this.call<GoogleBatchOperation>(
      `/v1beta/models/${encodeURIComponent(shard.model)}:batchGenerateContent`,
      { method: "POST", body: JSON.stringify({ batch: { displayName: shard.shardKey, inputConfig: { fileName } } }) },
      true
    );
    if (!operation.name) {
      throw new Error("Gemini returned a batch without a name");
    }
    return { providerBatchId: operation.name, inputFileId: fileName };
  }

  async poll(providerBatchId: string): Promise<ShardStatus> {
    const operation = await this.call<GoogleBatchOperation>(`/v1beta/${providerBatchId}`, { method: "GET" });
    const state = stateName(operation.metadata?.state);
    const outcome = TERMINAL[state];
    const responsesFile = operation.response?.responsesFile ?? operation.metadata?.output?.responsesFile;
    return {
      providerStatus: state,
      done: outcome !== undefined,
      ...(outcome ? { outcome } : {}),
      resultFiles: responsesFile ? [{ kind: "responses", ref: responsesFile }] : [],
      ...(operation.error?.message ? { errorMessage: operation.error.message } : {}),
    };
  }

  async download(file: ResultFileRef): Promise<DownloadedFile> {
    const response = await this.fetchFn(`${GOOGLE_API_BASE}/download/v1beta/${file.ref}:download?alt=media`, {
      headers: { "x-goog-api-key": this.apiKey },
    });
    if (!response.ok || !response.body) {
      throw new BatchHttpError(`Gemini download failed with HTTP ${response.status}`, response.status);
    }
    const length = Number(response.headers.get("content-length"));
    return { body: response.body, ...(Number.isFinite(length) && length > 0 ? { length } : {}) };
  }

  parseResultLine(line: string, requestedModel: string): ParsedResultLine {
    const parsed = JSON.parse(line) as GoogleResultLine;
    return { key: parsed.key, outcome: this.toOutcome(parsed, requestedModel) };
  }

  async cancel(providerBatchId: string): Promise<void> {
    await this.call(`/v1beta/${providerBatchId}:cancel`, { method: "POST" });
  }

  private async uploadInputSafely(shard: ShardInput): Promise<string> {
    try {
      return await this.uploadInput(shard);
    } catch (error) {
      if (error instanceof ProviderRejectedError || error instanceof RetryLaterError) throw error;
      throw new RetryLaterError(`Gemini file upload failed: ${errorText(error)}`);
    }
  }

  private async uploadInput(shard: ShardInput): Promise<string> {
    const start = await this.fetchFn(`${GOOGLE_API_BASE}/upload/v1beta/files`, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(shard.bytes),
        "X-Goog-Upload-Header-Content-Type": "application/jsonl",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: shard.shardKey } }),
    });
    const uploadUrl = start.headers.get("x-goog-upload-url");
    if (!start.ok || !uploadUrl) {
      throw classifySubmitStatus(start.status, `Gemini file upload could not start: HTTP ${start.status}`);
    }
    const { readable, writable } = new FixedLengthStream(shard.bytes);
    const piping = shard.openBody().pipeTo(writable);
    const finish = await this.fetchFn(uploadUrl, {
      method: "POST",
      headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
      body: readable,
    });
    await piping;
    const uploaded = (await finish.json()) as { file?: { name?: string } };
    if (!finish.ok || !uploaded.file?.name) {
      throw classifySubmitStatus(finish.status, `Gemini file upload failed: HTTP ${finish.status}`);
    }
    return uploaded.file.name;
  }

  private async call<T>(path: string, init: RequestInit, isSubmit = false): Promise<T> {
    const response = await this.fetchFn(`${GOOGLE_API_BASE}${path}`, {
      ...init,
      headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const message = `Gemini ${path}: HTTP ${response.status} ${await response.text()}`;
      throw isSubmit ? classifySubmitStatus(response.status, message) : new BatchHttpError(message, response.status);
    }
    return (await response.json()) as T;
  }

  private toOutcome(line: GoogleResultLine, requestedModel: string): ItemOutcome {
    const failure = line.error ?? line.status;
    if (failure && !line.response) {
      return { kind: "errored", error: { code: String(failure.code ?? "error"), message: failure.message ?? "" } };
    }
    if (!line.response) {
      return { kind: "errored", error: { code: "no_response", message: "The provider returned no answer" } };
    }
    try {
      return {
        kind: "succeeded",
        result: googleResult({
          model: requestedModel,
          outputText: googleResponseText(line.response),
          usageMetadata: line.response.usageMetadata,
          tier: "batch",
        }),
      };
    } catch (error) {
      return { kind: "errored", error: { code: "invalid_response", message: errorText(error) } };
    }
  }
}
