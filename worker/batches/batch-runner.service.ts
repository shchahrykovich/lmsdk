import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Batch, BatchShard } from "../db/schema";
import { PromptService } from "../prompts/prompt.service";
import { PromptVersionId } from "../prompts/prompt-version-id";
import { EntityId } from "../shared/entity-id";
import { ProjectId } from "../shared/project-id";
import { parsePromptBody, type PromptBody } from "../execution/prompt-body";
import { buildExecuteRequest } from "../execution/prompt-renderer";
import { ProviderService } from "../services/provider.service";
import type { ProviderConfig } from "../providers/provider-factory";
import { NullPromptExecutionLogger } from "../providers/logger/null-prompt-execution-logger";
import { ProviderTimeoutError } from "../providers/provider-timeout-error";
import {
  errorText,
  ProviderRejectedError,
  RetryLaterError,
  type BatchAdapter,
  type ItemOutcome,
  type ParsedResultLine,
  type ResultFileRef,
  type ShardOutcome,
  type SubmittedShard,
} from "./adapters/batch-adapter";
import type { BatchAdapterFactory } from "./adapters/adapter-factory";
import { BatchRepository } from "./batch.repository";
import { BatchItemRepository, type ItemCompletion, type ItemLayout } from "./batch-item.repository";
import { BatchFilesRepository, type BatchLocation, type PartSegment } from "./batch-files.repository";
import { parseItemKey } from "./batch-item-key";
import { toCompletion } from "./batch-outcome";
import { completeLines } from "./streams";
import { resultsExpireAt, workflowInstanceId, type BatchWorkflowParams } from "./batch.service";

export const IMPORT_WINDOW_BYTES = 1024 * 1024;
export const IMPORT_MAX_WINDOW_BYTES = 64 * 1024 * 1024;
export const IMPORT_MAX_LINES = 250;
export const MAX_SUBMIT_ATTEMPTS = 20;
export const PACED_ENQUEUE_PAGE = 500;
export const PLAN_PAGE = 1000;
export const PACED_MAX_ATTEMPTS = 5;
const QUEUE_SEND_LIMIT = 100;

export type ShardState = "planned" | "submitted" | "ended" | "imported" | "failed" | "cancelled";

export interface PacedItemMessage {
  tenantId: number;
  projectId: number;
  batchId: number;
  itemId: number;
}

export interface ImportRange {
  shardId: number;
  fileIndex: number;
  offset: number;
  size: number;
}

interface PlannedShard {
  firstId: number;
  lastId: number;
  items: number;
  bytes: number;
  segments: PartSegment[];
}

interface SubmitAttempt {
  shard: BatchShard;
  attempts: number;
  adapter: BatchAdapter;
  input: Parameters<BatchAdapter["submit"]>[0];
}

export interface ShardSnapshot {
  id: number;
  seq: number;
  state: string;
  submitAttempts: number;
  resultFiles: number;
}

export interface BatchSnapshot {
  mode: string;
  cancelRequested: boolean;
  shards: ShardSnapshot[];
}

export type SubmitOutcome = "submitted" | "retry_later" | "failed";

export type PacedOutcome = { done: true } | { done: false; retryAfterSeconds: number };

export interface BatchRunnerDeps {
  db: DrizzleD1Database;
  files: BatchFilesRepository;
  adapters: BatchAdapterFactory;
  pacedQueue?: Queue<PacedItemMessage>;
  providerConfig?: ProviderConfig;
  cache?: KVNamespace;
  now?: () => Date;
}

const TERMINAL_SHARD_STATES: readonly string[] = ["imported", "failed", "cancelled"];

const LEFTOVER_STATUS: Record<ShardOutcome, { status: "errored" | "expired" | "cancelled"; error: string | null }> = {
  completed: { status: "errored", error: JSON.stringify({ code: "no_result", message: "The provider returned no result for this item" }) },
  expired: { status: "expired", error: null },
  cancelled: { status: "cancelled", error: null },
  failed: { status: "errored", error: null },
};

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
};

export class BatchRunnerService {
  private readonly batches: BatchRepository;
  private readonly items: BatchItemRepository;
  private readonly prompts: PromptService;
  private readonly deps: BatchRunnerDeps;
  private readonly now: () => Date;

  constructor(deps: BatchRunnerDeps) {
    this.deps = deps;
    this.batches = new BatchRepository(deps.db);
    this.items = new BatchItemRepository(deps.db);
    this.prompts = new PromptService(deps.db);
    this.now = deps.now ?? (() => new Date());
  }

  static batchId(params: Pick<BatchWorkflowParams, "tenantId" | "projectId" | "userId" | "batchId">): EntityId<number> {
    return new EntityId(params.batchId, new ProjectId(params.projectId, params.tenantId, params.userId));
  }

  async snapshot(batchId: EntityId<number>): Promise<BatchSnapshot> {
    const batch = await this.requireBatch(batchId);
    const shards = await this.batches.listShards(batchId);
    return {
      mode: batch.mode,
      cancelRequested: batch.cancelRequestedAt !== null,
      shards: shards.map((shard) => ({
        id: shard.id,
        seq: shard.seq,
        state: shard.state,
        submitAttempts: shard.submitAttempts,
        resultFiles: this.resultFiles(shard).length,
      })),
    };
  }

  async plan(batchId: EntityId<number>): Promise<number> {
    const existing = await this.batches.listShards(batchId);
    if (existing.length > 0) return existing.length;
    const batch = await this.requireBatch(batchId);
    const groups = await this.packShards(batchId, this.deps.adapters(batch.provider));
    const shards = await this.batches.insertShards(
      groups.map((group, seq) => ({
        batchId: batch.id,
        tenantId: batch.tenantId,
        projectId: batch.projectId,
        seq,
        parts: JSON.stringify(group.segments),
        itemCount: group.items,
        bytes: group.bytes,
      }))
    );
    for (const [index, shard] of shards.entries()) {
      await this.items.assignShard(batchId, groups[index]!, shard.id);
    }
    return shards.length;
  }

  async markRunning(batchId: EntityId<number>): Promise<void> {
    await this.batches.transitionState(batchId, "submitting", "running");
  }

  async submitShard(batchId: EntityId<number>, shardId: number): Promise<SubmitOutcome> {
    const batch = await this.requireBatch(batchId);
    const shard = await this.requireShard(batchId, shardId);
    if (shard.state !== "planned") return shard.state === "failed" ? "failed" : "submitted";
    const adapter = this.deps.adapters(batch.provider);
    const input = {
      shardKey: `lmsdk-${workflowInstanceId(batch)}-${shard.seq}-${shard.submitAttempts}`,
      model: batch.model,
      itemCount: shard.itemCount,
      bytes: shard.bytes,
      existingInputFileId: shard.inputFileId,
      openBody: () => this.deps.files.openSegments(this.location(batch), JSON.parse(shard.parts) as PartSegment[]),
    };
    const attempts = shard.submitAttempts + 1;

    try {
      const submitted = await adapter.submit(input);
      await this.recordSubmitted(batchId, { shard, attempts }, submitted);
      if (batch.cancelRequestedAt) {
        await adapter.cancel(submitted.providerBatchId).catch(() => undefined);
      }
      return "submitted";
    } catch (error) {
      return await this.handleSubmitFailure(batchId, { shard, attempts, adapter, input }, error);
    }
  }

  async pollShards(batchId: EntityId<number>): Promise<number[]> {
    const batch = await this.requireBatch(batchId);
    const shards = (await this.batches.listShards(batchId)).filter((shard) => shard.state === "submitted");
    if (shards.length === 0) return [];
    const adapter = this.deps.adapters(batch.provider);
    const ended: number[] = [];
    for (const shard of shards) {
      try {
        const status = await adapter.poll(shard.providerBatchId!);
        if (status.resubmit) {
          await this.batches.updateShard(batchId, shard.id, {
            state: "planned",
            providerBatchId: null,
            providerStatus: status.providerStatus,
            errorMessage: status.errorMessage ?? null,
          });
        } else if (status.done) {
          await this.batches.updateShard(batchId, shard.id, {
            state: "ended",
            providerStatus: status.providerStatus,
            outcome: status.outcome ?? "completed",
            resultFiles: JSON.stringify(status.resultFiles),
            errorMessage: status.errorMessage ?? null,
            endedAt: this.now(),
          });
          ended.push(shard.id);
        } else {
          await this.batches.updateShard(batchId, shard.id, { providerStatus: status.providerStatus });
        }
      } catch (error) {
        console.error("[BatchRunner] Poll failed", { batchId: batch.id, shardId: shard.id, error: errorText(error) });
      }
    }
    return ended;
  }

  async endedShardIds(batchId: EntityId<number>): Promise<number[]> {
    return (await this.batches.listShards(batchId)).filter((shard) => shard.state === "ended").map((shard) => shard.id);
  }

  async copyResultFile(batchId: EntityId<number>, shardId: number, fileIndex: number): Promise<number> {
    const batch = await this.requireBatch(batchId);
    const shard = await this.requireShard(batchId, shardId);
    const file = this.resultFiles(shard)[fileIndex];
    if (!file) return 0;
    const downloaded = await this.deps.adapters(batch.provider).download(file);
    return await this.deps.files.putRaw(this.rawKey(batch, shard, file), downloaded.body, downloaded.length);
  }

  async importRange(batchId: EntityId<number>, range: ImportRange): Promise<number> {
    const { shardId, fileIndex, offset, size } = range;
    const batch = await this.requireBatch(batchId);
    const shard = await this.requireShard(batchId, shardId);
    const file = this.resultFiles(shard)[fileIndex];
    if (!file || offset >= size) return size;
    const { lines, consumed } = await this.readLines(this.rawKey(batch, shard, file), offset, size);
    const adapter = this.deps.adapters(batch.provider);
    const parsed = lines.map((line) => this.parseLine(adapter, line, batch.model)).filter((line) => line !== null);
    await this.applyOutcomes(batchId, batch, parsed);
    await this.batches.refreshTotals(batchId);
    return offset + consumed;
  }

  async finalizeShard(batchId: EntityId<number>, shardId: number): Promise<void> {
    const shard = await this.requireShard(batchId, shardId);
    if (TERMINAL_SHARD_STATES.includes(shard.state)) return;
    const leftover = LEFTOVER_STATUS[(shard.outcome as ShardOutcome | null) ?? "completed"];
    const error =
      leftover.error ??
      (leftover.status === "errored"
        ? JSON.stringify({ code: "provider_batch_failed", message: shard.errorMessage ?? "The provider batch failed" })
        : null);
    await this.items.markPending(batchId, { status: leftover.status, error, at: this.now(), shardId: shard.id });
    await this.batches.updateShard(batchId, shard.id, { state: "imported" });
    await this.batches.refreshTotals(batchId);
  }

  async cancelPlannedShards(batchId: EntityId<number>): Promise<void> {
    const shards = (await this.batches.listShards(batchId)).filter((shard) => shard.state === "planned");
    for (const shard of shards) {
      await this.items.markPending(batchId, { status: "cancelled", error: null, at: this.now(), shardId: shard.id });
      await this.batches.updateShard(batchId, shard.id, { state: "cancelled" });
    }
    await this.batches.refreshTotals(batchId);
  }

  async allShardsTerminal(batchId: EntityId<number>): Promise<boolean> {
    const shards = await this.batches.listShards(batchId);
    return shards.every((shard) => TERMINAL_SHARD_STATES.includes(shard.state));
  }

  async finish(batchId: EntityId<number>): Promise<string> {
    const batch = await this.requireBatch(batchId);
    const now = this.now();
    await this.batches.refreshTotals(batchId);
    const state = batch.cancelRequestedAt ? "cancelled" : "finished";
    for (const from of ["submitting", "running"] as const) {
      await this.batches.transitionState(batchId, from, state, { finishedAt: now, resultsExpireAt: resultsExpireAt(now) });
    }
    return state;
  }

  async fail(batchId: EntityId<number>, message: string): Promise<void> {
    await this.cancelSubmittedShards(batchId);
    const now = this.now();
    const error = JSON.stringify({ code: "batch_failed", message });
    await this.items.markPending(batchId, { status: "errored", error, at: now });
    await this.batches.refreshTotals(batchId);
    for (const from of ["draft", "submitting", "running"] as const) {
      await this.batches.transitionState(batchId, from, "failed", {
        errorMessage: message,
        finishedAt: now,
        resultsExpireAt: resultsExpireAt(now),
      });
    }
  }

  private async cancelSubmittedShards(batchId: EntityId<number>): Promise<void> {
    const batch = await this.batches.findById(batchId);
    if (batch?.mode !== "native") return;
    const submitted = (await this.batches.listShards(batchId)).filter((shard) => shard.state === "submitted");
    if (submitted.length === 0) return;
    const adapter = this.deps.adapters(batch.provider);
    for (const shard of submitted) {
      try {
        await adapter.cancel(shard.providerBatchId!);
        await this.batches.updateShard(batchId, shard.id, { state: "cancelled" });
      } catch (error) {
        console.error("[BatchRunner] Could not cancel a provider batch", { batchId: batch.id, shardId: shard.id, error: errorText(error) });
      }
    }
  }

  async enqueuePaced(batchId: EntityId<number>, afterId: number): Promise<number | null> {
    const queue = this.deps.pacedQueue;
    if (!queue) throw new Error("The paced batch queue is not configured");
    const page = await this.items.listPage(batchId, afterId, PACED_ENQUEUE_PAGE, "pending");
    if (page.length === 0) return null;
    const messages = page.map((item) => ({
      body: { tenantId: batchId.tenantId, projectId: batchId.projectId, batchId: batchId.id, itemId: item.id },
    }));
    for (let index = 0; index < messages.length; index += QUEUE_SEND_LIMIT) {
      await queue.sendBatch(messages.slice(index, index + QUEUE_SEND_LIMIT));
    }
    return page[page.length - 1]!.id;
  }

  async pacedProgress(batchId: EntityId<number>): Promise<number> {
    await this.batches.refreshTotals(batchId);
    return await this.items.countPending(batchId);
  }

  async runPacedItem(message: PacedItemMessage, attempts: number): Promise<PacedOutcome> {
    const batchId = new EntityId(message.batchId, new ProjectId(message.projectId, message.tenantId, "batch"));
    const batch = await this.batches.findById(batchId);
    const item = batch ? await this.items.findItem(batchId, message.itemId) : undefined;
    if (!batch || item?.status !== "pending") return { done: true };
    if (batch.cancelRequestedAt) {
      await this.items.complete(batchId, [{ id: item.id, status: "cancelled" }], this.now());
      return { done: true };
    }

    const body = await this.pinnedBody(batch);
    const line = JSON.parse(await this.deps.files.readPartRange(this.location(batch), item.partKey, item.byteOffset, item.bytes)) as {
      variables?: Record<string, unknown>;
    };
    const outcome = await this.executePaced(batch, body, line.variables ?? {}, attempts);
    if (outcome === "retry") {
      return { done: false, retryAfterSeconds: Math.min(300, 30 * attempts) };
    }
    await this.applyOutcomes(batchId, batch, [{ itemId: item.id, outcome }], body);
    return { done: true };
  }

  async failPacedItem(message: PacedItemMessage, reason: string): Promise<void> {
    const batchId = new EntityId(message.batchId, new ProjectId(message.projectId, message.tenantId, "batch"));
    const error = JSON.stringify({ code: "internal_error", message: reason });
    await this.items.complete(batchId, [{ id: message.itemId, status: "errored", error }], this.now());
  }

  private async executePaced(
    batch: Batch,
    body: PromptBody,
    variables: Record<string, unknown>,
    attempts: number
  ): Promise<ItemOutcome | "retry"> {
    if (!this.deps.providerConfig || !this.deps.cache) {
      throw new Error("Paced batches need the provider configuration");
    }
    const version = { model: batch.model, projectId: batch.projectId, slug: "" };
    const service = new ProviderService(this.deps.providerConfig, new NullPromptExecutionLogger(), this.deps.cache);
    try {
      const result = await service.executePrompt(batch.provider, buildExecuteRequest(version, body, variables));
      return { kind: "succeeded", result };
    } catch (error) {
      if (statusOf(error) === 429) {
        if (attempts < PACED_MAX_ATTEMPTS) return "retry";
        return { kind: "errored", error: { code: "rate_limited", message: errorText(error) } };
      }
      if (error instanceof ProviderTimeoutError) {
        return { kind: "errored", error: { code: error.code, message: error.message } };
      }
      return { kind: "errored", error: { code: "provider_error", message: errorText(error) } };
    }
  }

  private async applyOutcomes(
    batchId: EntityId<number>,
    batch: Batch,
    outcomes: ({ itemId: number; outcome: ItemOutcome } | ParsedResultLine)[],
    knownBody?: PromptBody
  ): Promise<void> {
    if (outcomes.length === 0) return;
    const ids = await this.resolveItemIds(batchId, outcomes);
    const responseFormat = (knownBody ?? (await this.pinnedBody(batch))).response_format;
    const completions: ItemCompletion[] = [];
    const location = this.location(batch);
    await Promise.all(
      outcomes.map(async (entry) => {
        const itemId = "itemId" in entry ? entry.itemId : ids.get(entry.key);
        if (itemId === undefined) {
          console.error("[BatchRunner] Result for an unknown item", { batchId: batch.id, key: "key" in entry ? entry.key : "" });
          return;
        }
        const { completion, stored } = toCompletion(itemId, entry.outcome, responseFormat);
        if (stored) {
          await this.deps.files.putResult(location, itemId, stored);
        }
        completions.push(completion);
      })
    );
    await this.items.complete(batchId, completions, this.now());
  }

  private async resolveItemIds(
    batchId: EntityId<number>,
    outcomes: ({ itemId: number; outcome: ItemOutcome } | ParsedResultLine)[]
  ): Promise<Map<string, number>> {
    const lines = outcomes
      .filter((entry): entry is ParsedResultLine => "key" in entry)
      .map((entry) => parseItemKey(entry.key))
      .filter((line) => line !== null);
    return lines.length > 0 ? await this.items.findIdsByLines(batchId, lines) : new Map();
  }

  private parseLine(adapter: BatchAdapter, line: string, model: string): ParsedResultLine | null {
    try {
      return adapter.parseResultLine(line, model);
    } catch (error) {
      console.error("[BatchRunner] Could not parse a result line", { error: errorText(error) });
      return null;
    }
  }

  private async readLines(key: string, offset: number, size: number): Promise<{ lines: string[]; consumed: number }> {
    let window = IMPORT_WINDOW_BYTES;
    for (;;) {
      const length = Math.min(window, size - offset);
      const bytes = await this.deps.files.readRawRange(key, offset, length);
      const isLast = offset + length >= size;
      const result = completeLines(bytes, isLast, IMPORT_MAX_LINES);
      if (result.consumed > 0 || isLast || window >= IMPORT_MAX_WINDOW_BYTES) {
        return result.consumed > 0 || isLast ? result : { lines: [], consumed: length };
      }
      window *= 4;
    }
  }

  private async handleSubmitFailure(
    batchId: EntityId<number>,
    attempt: SubmitAttempt,
    error: unknown
  ): Promise<SubmitOutcome> {
    const { shard, attempts, adapter, input } = attempt;
    if (error instanceof RetryLaterError && attempts < MAX_SUBMIT_ATTEMPTS) {
      await this.batches.updateShard(batchId, shard.id, { submitAttempts: attempts, errorMessage: error.message });
      return "retry_later";
    }
    if (!(error instanceof ProviderRejectedError) && !(error instanceof RetryLaterError) && adapter.findSubmitted) {
      const found = await adapter.findSubmitted(input).catch(() => null);
      if (found) {
        await this.recordSubmitted(batchId, { shard, attempts }, found);
        return "submitted";
      }
    }
    const message =
      error instanceof ProviderRejectedError || error instanceof RetryLaterError
        ? errorText(error)
        : `The provider did not confirm the batch, so LM SDK did not retry it to avoid paying twice: ${errorText(error)}`;
    await this.batches.updateShard(batchId, shard.id, { state: "failed", submitAttempts: attempts, errorMessage: message });
    await this.items.markPending(batchId, {
      status: "errored",
      error: JSON.stringify({ code: "submit_failed", message }),
      at: this.now(),
      shardId: shard.id,
    });
    await this.batches.refreshTotals(batchId);
    return "failed";
  }

  private async recordSubmitted(
    batchId: EntityId<number>,
    { shard, attempts }: Pick<SubmitAttempt, "shard" | "attempts">,
    submitted: SubmittedShard
  ): Promise<void> {
    await this.batches.updateShard(batchId, shard.id, {
      state: "submitted",
      providerBatchId: submitted.providerBatchId,
      inputFileId: submitted.inputFileId ?? shard.inputFileId,
      submitAttempts: attempts,
      submittedAt: this.now(),
      errorMessage: null,
    });
  }

  private async packShards(batchId: EntityId<number>, adapter: BatchAdapter): Promise<PlannedShard[]> {
    const shards: PlannedShard[] = [];
    let afterId = 0;
    for (;;) {
      const page = await this.items.listLayout(batchId, afterId, PLAN_PAGE);
      if (page.length === 0) return shards;
      for (const item of page) {
        this.placeItem(shards, item, adapter);
      }
      afterId = page[page.length - 1]!.id;
    }
  }

  private placeItem(shards: PlannedShard[], item: ItemLayout, adapter: BatchAdapter): void {
    const current = shards[shards.length - 1];
    const fits =
      current && current.items + 1 <= adapter.limits.maxItems && current.bytes + item.bytes <= adapter.limits.maxBytes;
    if (!fits) {
      shards.push({
        firstId: item.id,
        lastId: item.id,
        items: 1,
        bytes: item.bytes,
        segments: [{ partKey: item.partKey, offset: item.byteOffset, length: item.bytes }],
      });
      return;
    }
    current.lastId = item.id;
    current.items += 1;
    current.bytes += item.bytes;
    const segment = current.segments[current.segments.length - 1]!;
    if (segment.partKey === item.partKey && segment.offset + segment.length === item.byteOffset) {
      segment.length += item.bytes;
    } else {
      current.segments.push({ partKey: item.partKey, offset: item.byteOffset, length: item.bytes });
    }
  }

  private async pinnedBody(batch: Batch): Promise<PromptBody> {
    const promptId = new EntityId(batch.promptId, new ProjectId(batch.projectId, batch.tenantId, "batch"));
    const version = await this.prompts.getPromptVersion(new PromptVersionId(batch.version, promptId));
    const body = version ? parsePromptBody(version.body) : null;
    if (!body) throw new Error(`Prompt version ${batch.version} of batch ${batch.id} is missing`);
    return body;
  }

  private resultFiles(shard: BatchShard): ResultFileRef[] {
    try {
      return JSON.parse(shard.resultFiles) as ResultFileRef[];
    } catch {
      return [];
    }
  }

  private rawKey(batch: Batch, shard: BatchShard, file: ResultFileRef): string {
    return this.deps.files.rawKey(this.location(batch), shard.seq, file.kind);
  }

  private location(batch: Batch): BatchLocation {
    return { tenantId: batch.tenantId, batchId: batch.id };
  }

  private async requireBatch(batchId: EntityId<number>): Promise<Batch> {
    const batch = await this.batches.findById(batchId);
    if (!batch) throw new Error(`Batch ${batchId.id} not found`);
    return batch;
  }

  private async requireShard(batchId: EntityId<number>, shardId: number): Promise<BatchShard> {
    const shard = (await this.batches.listShards(batchId)).find((candidate) => candidate.id === shardId);
    if (!shard) throw new Error(`Shard ${shardId} of batch ${batchId.id} not found`);
    return shard;
  }
}
