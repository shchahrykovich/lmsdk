import OpenAI from "openai";
import type { Batch } from "openai/resources/batches";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import type { ExecuteRequest } from "../../providers/base-provider";
import { buildOpenAIRequest, openAIResult } from "../../providers/openai-codec";
import { renderExecuteRequest } from "../../execution/prompt-renderer";
import { readChunks } from "../streams";
import {
  classifySubmitStatus,
  errorText,
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

export const OPENAI_BATCH_LIMITS = { maxItems: 50_000, maxBytes: 190 * 1024 * 1024 };
export const OPENAI_UPLOAD_PART_BYTES = 16 * 1024 * 1024;
const RESPONSES_ENDPOINT = "/v1/responses";
const SHARD_METADATA_KEY = "lmsdk_shard";
const QUEUE_FULL_CODES = new Set(["token_limit_exceeded"]);

interface OpenAIResultLine {
  custom_id: string;
  response?: { status_code: number; body?: OpenAIResponse & { error?: { code?: string; message?: string } } } | null;
  error?: { code?: string; message?: string } | null;
}

const TERMINAL: Record<string, ShardStatus["outcome"]> = {
  completed: "completed",
  expired: "expired",
  cancelled: "cancelled",
  failed: "failed",
};

export class OpenAIBatchAdapter implements BatchAdapter {
  readonly provider = "openai";
  readonly limits = OPENAI_BATCH_LIMITS;
  private client: OpenAI;

  constructor(apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey, maxRetries: 0 });
  }

  encodeLine(key: string, request: ExecuteRequest): string {
    return JSON.stringify({
      custom_id: key,
      method: "POST",
      url: RESPONSES_ENDPOINT,
      body: buildOpenAIRequest(renderExecuteRequest(request)),
    });
  }

  async submit(shard: ShardInput): Promise<SubmittedShard> {
    const inputFileId = shard.existingInputFileId ?? (await this.uploadInput(shard));
    try {
      const batch = await this.client.batches.create({
        input_file_id: inputFileId,
        endpoint: RESPONSES_ENDPOINT,
        completion_window: "24h",
        metadata: { [SHARD_METADATA_KEY]: shard.shardKey },
      });
      return { providerBatchId: batch.id, inputFileId };
    } catch (error) {
      throw this.submitFailure(error);
    }
  }

  async findSubmitted(shard: ShardInput): Promise<SubmittedShard | null> {
    const page = await this.client.batches.list({ limit: 100 });
    const match = page.data.find((batch) => batch.metadata?.[SHARD_METADATA_KEY] === shard.shardKey);
    return match ? { providerBatchId: match.id, inputFileId: match.input_file_id } : null;
  }

  async poll(providerBatchId: string): Promise<ShardStatus> {
    return this.toStatus(await this.client.batches.retrieve(providerBatchId));
  }

  async download(file: ResultFileRef): Promise<DownloadedFile> {
    const response = await this.client.files.content(file.ref);
    const length = Number(response.headers.get("content-length"));
    return { body: response.body!, ...(Number.isFinite(length) && length > 0 ? { length } : {}) };
  }

  parseResultLine(line: string, requestedModel: string): ParsedResultLine {
    const parsed = JSON.parse(line) as OpenAIResultLine;
    return { key: parsed.custom_id, outcome: this.toOutcome(parsed, requestedModel) };
  }

  async cancel(providerBatchId: string): Promise<void> {
    await this.client.batches.cancel(providerBatchId);
  }

  private async uploadInput(shard: ShardInput): Promise<string> {
    try {
      const upload = await this.client.uploads.create({
        bytes: shard.bytes,
        filename: `${shard.shardKey}.jsonl`,
        mime_type: "application/jsonl",
        purpose: "batch",
      });
      const partIds: string[] = [];
      for await (const chunk of readChunks(shard.openBody(), OPENAI_UPLOAD_PART_BYTES)) {
        const part = await this.client.uploads.parts.create(upload.id, {
          data: new File([chunk], `${shard.shardKey}-${partIds.length}.jsonl`),
        });
        partIds.push(part.id);
      }
      const completed = await this.client.uploads.complete(upload.id, { part_ids: partIds });
      if (!completed.file?.id) {
        throw new Error(`OpenAI upload ${upload.id} finished without a file`);
      }
      return completed.file.id;
    } catch (error) {
      const failure = this.submitFailure(error);
      throw failure instanceof ProviderRejectedError ? failure : new RetryLaterError(`OpenAI upload failed: ${errorText(error)}`);
    }
  }

  private submitFailure(error: unknown): unknown {
    if (error instanceof OpenAI.APIError && typeof error.status === "number") {
      return classifySubmitStatus(error.status, `OpenAI: ${error.message}`);
    }
    return error;
  }

  private toStatus(batch: Batch): ShardStatus {
    const outcome = TERMINAL[batch.status];
    const errors = batch.errors?.data ?? [];
    const resultFiles: ResultFileRef[] = [
      ...(batch.output_file_id ? [{ kind: "output", ref: batch.output_file_id }] : []),
      ...(batch.error_file_id ? [{ kind: "error", ref: batch.error_file_id }] : []),
    ];
    const errorMessage = errors.map((item) => `${item.code ?? "error"}: ${item.message ?? ""}`).join("; ") || undefined;
    const queueFull =
      batch.status === "failed" &&
      errors.some((item) => QUEUE_FULL_CODES.has(item.code ?? "") || /enqueued token limit/i.test(item.message ?? ""));
    return {
      providerStatus: batch.status,
      done: outcome !== undefined && !queueFull,
      ...(outcome ? { outcome } : {}),
      resultFiles,
      ...(errorMessage ? { errorMessage } : {}),
      ...(queueFull ? { resubmit: true } : {}),
    };
  }

  private toOutcome(line: OpenAIResultLine, requestedModel: string): ItemOutcome {
    if (line.error) {
      return this.lineErrorOutcome(line.error);
    }
    const response = line.response;
    if (response?.status_code !== 200 || !response.body) {
      return this.httpErrorOutcome(response);
    }
    try {
      return { kind: "succeeded", result: openAIResult({ requestedModel, response: response.body, tier: "batch" }) };
    } catch (error) {
      return { kind: "errored", error: { code: "invalid_response", message: errorText(error) } };
    }
  }

  private lineErrorOutcome(error: NonNullable<OpenAIResultLine["error"]>): ItemOutcome {
    if (error.code === "batch_expired") return { kind: "expired" };
    if (error.code === "batch_cancelled") return { kind: "cancelled" };
    return { kind: "errored", error: { code: error.code ?? "error", message: error.message ?? "" } };
  }

  private httpErrorOutcome(response: OpenAIResultLine["response"]): ItemOutcome {
    const bodyError = response?.body?.error;
    return {
      kind: "errored",
      error: {
        code: bodyError?.code ?? `http_${response?.status_code ?? "unknown"}`,
        message: bodyError?.message ?? "The provider returned no answer",
      },
    };
  }
}
