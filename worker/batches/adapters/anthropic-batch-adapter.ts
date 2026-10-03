import Anthropic from "@anthropic-ai/sdk";
import type { ExecuteRequest } from "../../providers/base-provider";
import { anthropicResult, buildAnthropicRequest } from "../../providers/anthropic-codec";
import { renderExecuteRequest } from "../../execution/prompt-renderer";
import { readLines, streamFromStrings } from "../streams";
import {
  classifySubmitStatus,
  errorText,
  type BatchAdapter,
  type DownloadedFile,
  type ItemOutcome,
  type ParsedResultLine,
  type ResultFileRef,
  type ShardInput,
  type ShardStatus,
  type SubmittedShard,
} from "./batch-adapter";

export const ANTHROPIC_BATCH_LIMITS = { maxItems: 100_000, maxBytes: 32 * 1024 * 1024 };

type BatchRequest = Anthropic.Messages.BatchCreateParams.Request;

export class AnthropicBatchAdapter implements BatchAdapter {
  readonly provider = "anthropic";
  readonly limits = ANTHROPIC_BATCH_LIMITS;
  private client: Anthropic;

  constructor(apiKey: string, client?: Anthropic) {
    this.client = client ?? new Anthropic({ apiKey, maxRetries: 0 });
  }

  encodeLine(key: string, request: ExecuteRequest): string {
    return JSON.stringify({ custom_id: key, params: buildAnthropicRequest(renderExecuteRequest(request)) });
  }

  async submit(shard: ShardInput): Promise<SubmittedShard> {
    const requests: BatchRequest[] = [];
    for await (const line of readLines(shard.openBody())) {
      requests.push(JSON.parse(line) as BatchRequest);
    }
    try {
      const batch = await this.client.messages.batches.create({ requests });
      return { providerBatchId: batch.id };
    } catch (error) {
      if (error instanceof Anthropic.APIError && typeof error.status === "number") {
        throw classifySubmitStatus(error.status, `Anthropic: ${error.message}`);
      }
      throw error;
    }
  }

  async poll(providerBatchId: string): Promise<ShardStatus> {
    const batch = await this.client.messages.batches.retrieve(providerBatchId);
    const done = batch.processing_status === "ended";
    return {
      providerStatus: batch.processing_status,
      done,
      ...(done ? { outcome: batch.cancel_initiated_at ? ("cancelled" as const) : ("completed" as const) } : {}),
      resultFiles: done ? [{ kind: "results", ref: providerBatchId }] : [],
    };
  }

  async download(file: ResultFileRef): Promise<DownloadedFile> {
    const decoder = await this.client.messages.batches.results(file.ref);
    async function* lines(): AsyncGenerator<string> {
      for await (const result of decoder) {
        yield JSON.stringify(result) + "\n";
      }
    }
    return { body: streamFromStrings(lines()) };
  }

  parseResultLine(line: string, requestedModel: string): ParsedResultLine {
    const parsed = JSON.parse(line) as Anthropic.Messages.MessageBatchIndividualResponse;
    return { key: parsed.custom_id, outcome: this.toOutcome(parsed.result, requestedModel) };
  }

  async cancel(providerBatchId: string): Promise<void> {
    await this.client.messages.batches.cancel(providerBatchId);
  }

  private toOutcome(result: Anthropic.Messages.MessageBatchResult, requestedModel: string): ItemOutcome {
    switch (result.type) {
      case "succeeded":
        try {
          return { kind: "succeeded", result: anthropicResult({ requestedModel, message: result.message, tier: "batch" }) };
        } catch (error) {
          return { kind: "errored", error: { code: "refusal", message: errorText(error) } };
        }
      case "errored":
        return {
          kind: "errored",
          error: { code: result.error.error.type, message: result.error.error.message },
        };
      case "canceled":
        return { kind: "cancelled" };
      case "expired":
        return { kind: "expired" };
    }
  }
}
