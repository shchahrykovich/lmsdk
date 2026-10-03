import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Batch, BatchItem, BatchShard, NewBatchItem, PromptVersion } from "../db/schema";
import { PromptService } from "../prompts/prompt.service";
import { PromptVersionId } from "../prompts/prompt-version-id";
import { EntityId } from "../shared/entity-id";
import {
  ClientInputValidationError,
  ConflictError,
  NotFoundError,
  UnprocessableEntityError,
  isUniqueConstraintError,
} from "../shared/errors";
import { parsePromptBody } from "../execution/prompt-body";
import type { ExecuteRequest } from "../providers/base-provider";
import { ProjectId } from "../shared/project-id";
import { buildExecuteRequest } from "../execution/prompt-renderer";
import { errorText, type BatchAdapter } from "./adapters/batch-adapter";
import { hasNativeBatch, PACED_ITEM_MAX_BYTES, type BatchAdapterFactory } from "./adapters/adapter-factory";
import { BatchRepository, TERMINAL_BATCH_STATES, type BatchState } from "./batch.repository";
import { BatchItemRepository, type BatchItemStatus } from "./batch-item.repository";
import { BatchFilesRepository } from "./batch-files.repository";
import { itemKey, newPartKey } from "./batch-item-key";
import { utf8Length } from "./streams";
import type { StoredItemResult } from "./batch-outcome";

export const BATCH_RESULTS_RETENTION_DAYS = 30;
export const MAX_ITEMS_PER_CALL = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BatchMode = "native" | "paced";

export interface BatchWorkflowParams {
  tenantId: number;
  projectId: number;
  userId: string;
  batchId: number;
}

export type StartBatchWorkflow = (instanceId: string, params: BatchWorkflowParams) => Promise<void>;

export interface BatchServiceDeps {
  db: DrizzleD1Database;
  files: BatchFilesRepository;
  adapters: BatchAdapterFactory;
  startWorkflow: StartBatchWorkflow;
  now?: () => Date;
}

export interface CreateBatchInput {
  version?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  fallback?: "paced";
}

export interface NewItemInput {
  custom_id: string;
  variables?: Record<string, unknown>;
}

export interface AddItemsResult {
  accepted: number;
  duplicates: string[];
  refused: { custom_id: string; reason: string }[];
  batch: Batch;
}

interface RenderedPart {
  partKey: string;
  lines: string[];
  rows: NewBatchItem[];
  bytes: number;
}

export interface ResultItem {
  item: BatchItem;
  stored: StoredItemResult | null;
}

export const workflowInstanceId = (batch: Pick<Batch, "tenantId" | "id">): string => `batch-${batch.tenantId}-${batch.id}`;

export const resultsExpireAt = (from: Date): Date => new Date(from.getTime() + BATCH_RESULTS_RETENTION_DAYS * DAY_MS);

export class BatchService {
  private readonly batches: BatchRepository;
  private readonly items: BatchItemRepository;
  private readonly prompts: PromptService;
  private readonly now: () => Date;
  private readonly deps: BatchServiceDeps;

  constructor(deps: BatchServiceDeps) {
    this.deps = deps;
    this.batches = new BatchRepository(deps.db);
    this.items = new BatchItemRepository(deps.db);
    this.prompts = new PromptService(deps.db);
    this.now = deps.now ?? (() => new Date());
  }

  async createBatch(
    promptId: EntityId<number>,
    input: CreateBatchInput
  ): Promise<{ batch: Batch; created: boolean }> {
    if (input.idempotencyKey) {
      const existing = await this.batches.findByIdempotencyKey(promptId, input.idempotencyKey);
      if (existing) return { batch: existing, created: false };
    }

    const version = await this.pinVersion(promptId, input.version);
    const mode = this.chooseMode(version.provider, input.fallback);
    if (mode === "native") {
      this.deps.adapters(version.provider);
    }

    try {
      const batch = await this.batches.create({
        tenantId: promptId.tenantId,
        projectId: promptId.projectId,
        promptId: promptId.id,
        version: version.version,
        provider: version.provider,
        model: version.model,
        mode,
        state: "draft",
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
        resultsExpireAt: resultsExpireAt(this.now()),
      });
      return { batch, created: true };
    } catch (error) {
      if (input.idempotencyKey && isUniqueConstraintError(error)) {
        const existing = await this.batches.findByIdempotencyKey(promptId, input.idempotencyKey);
        if (existing) return { batch: existing, created: false };
      }
      throw error;
    }
  }

  async addItems(batchId: EntityId<number>, items: NewItemInput[]): Promise<AddItemsResult> {
    const batch = await this.requireBatch(batchId);
    this.requireDraft(batch);

    const { fresh, duplicates } = await this.splitDuplicates(batchId, items);
    const request = await this.loadPinnedRequest(batch);
    const adapter = batch.mode === "native" ? this.deps.adapters(batch.provider) : null;
    const maxItemBytes = adapter ? adapter.limits.maxBytes : PACED_ITEM_MAX_BYTES;

    const partKey = newPartKey();
    const refused: AddItemsResult["refused"] = [];
    const lines: string[] = [];
    const rows: NewBatchItem[] = [];
    let byteOffset = 0;

    for (const item of fresh) {
      const key = itemKey({ partKey, lineIndex: lines.length });
      const line = this.encodeLine(adapter, key, { ...request, variables: item.variables ?? {} });
      const bytes = utf8Length(line) + 1;
      if (bytes > maxItemBytes) {
        refused.push({ custom_id: item.custom_id, reason: `The rendered request is ${bytes} bytes; the limit is ${maxItemBytes}` });
        continue;
      }
      rows.push({
        batchId: batch.id,
        tenantId: batch.tenantId,
        projectId: batch.projectId,
        customId: item.custom_id,
        partKey,
        lineIndex: lines.length,
        byteOffset,
        bytes,
      });
      lines.push(line);
      byteOffset += bytes;
    }

    if (rows.length > 0) {
      await this.storeItems(batchId, { partKey, lines, rows, bytes: byteOffset });
    }

    return { accepted: rows.length, duplicates, refused, batch: await this.requireBatch(batchId) };
  }

  async submit(batchId: EntityId<number>): Promise<Batch> {
    const batch = await this.requireBatch(batchId);
    if (batch.state === "draft") {
      if (batch.totalItems === 0) {
        throw new ClientInputValidationError("The batch has no items. Add items before you submit it.");
      }
      await this.batches.transitionState(batchId, "draft", "submitting", { submittedAt: this.now() });
    }
    const current = await this.requireBatch(batchId);
    if (current.state === "submitting" && !current.workflowId) {
      await this.launchWorkflow(batchId, current);
    }
    return await this.requireBatch(batchId);
  }

  async cancel(batchId: EntityId<number>, adapterFor: (provider: string) => BatchAdapter = this.deps.adapters): Promise<Batch> {
    const batch = await this.requireBatch(batchId);
    const now = this.now();
    if (batch.state === "draft") {
      if (await this.batches.transitionState(batchId, "draft", "cancelled", { finishedAt: now, resultsExpireAt: resultsExpireAt(now) })) {
        await this.items.markPending(batchId, { status: "cancelled", error: null, at: now });
        await this.batches.refreshTotals(batchId);
      }
      return await this.requireBatch(batchId);
    }
    if ((TERMINAL_BATCH_STATES as readonly string[]).includes(batch.state)) {
      return batch;
    }
    await this.batches.requestCancel(batchId, now);
    if (batch.mode === "native") {
      await this.cancelSubmittedShards(batchId, batch, adapterFor);
    }
    return await this.requireBatch(batchId);
  }

  async getBatch(batchId: EntityId<number>): Promise<{ batch: Batch; shards: BatchShard[] }> {
    const batch = await this.requireBatch(batchId);
    return { batch, shards: await this.batches.listShards(batchId) };
  }

  async listBatches(promptId: EntityId<number>, limit: number, beforeId?: number): Promise<Batch[]> {
    return await this.batches.listByPrompt(promptId, limit, beforeId);
  }

  async listResults(
    batchId: EntityId<number>,
    afterId: number,
    limit: number,
    status?: BatchItemStatus
  ): Promise<{ batch: Batch; items: ResultItem[] }> {
    const batch = await this.requireBatch(batchId);
    const page = await this.items.listPage(batchId, afterId, limit, status);
    const location = { tenantId: batch.tenantId, batchId: batch.id };
    const items = await Promise.all(
      page.map(async (item) => ({
        item,
        stored: item.hasResult ? ((await this.deps.files.getResult(location, item.id)) as StoredItemResult | null) : null,
      }))
    );
    return { batch, items };
  }

  async requireBatch(batchId: EntityId<number>): Promise<Batch> {
    const batch = await this.batches.findById(batchId);
    if (!batch) {
      throw new NotFoundError("Batch not found");
    }
    return batch;
  }

  private async pinVersion(promptId: EntityId<number>, requested?: number): Promise<PromptVersion> {
    if (requested !== undefined) {
      const version = await this.prompts.getPromptVersion(new PromptVersionId(requested, promptId));
      if (!version) throw new NotFoundError(`Prompt version ${requested} not found`);
      return version;
    }
    const active = await this.prompts.getActivePromptVersion(promptId);
    if (!active) throw new NotFoundError("No active version found for prompt");
    return active;
  }

  private chooseMode(provider: string, fallback?: "paced"): BatchMode {
    if (hasNativeBatch(provider)) return "native";
    if (fallback === "paced") return "paced";
    throw new UnprocessableEntityError(
      `Provider "${provider}" has no native batch API, so a batch would not get the batch discount. ` +
        `Send "fallback": "paced" to run the items through execute at full price with bounded concurrency.`
    );
  }

  private requireDraft(batch: Batch): void {
    if (batch.state !== "draft") {
      throw new ConflictError(`Items can be added only while the batch is a draft. The batch is "${batch.state}".`);
    }
  }

  private async splitDuplicates(batchId: EntityId<number>, items: NewItemInput[]) {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    const unique: NewItemInput[] = [];
    for (const item of items) {
      if (seen.has(item.custom_id)) {
        duplicates.push(item.custom_id);
      } else {
        seen.add(item.custom_id);
        unique.push(item);
      }
    }
    const existing = await this.items.findExistingCustomIds(batchId, unique.map((item) => item.custom_id));
    const fresh = unique.filter((item) => !existing.has(item.custom_id));
    duplicates.push(...unique.filter((item) => existing.has(item.custom_id)).map((item) => item.custom_id));
    return { fresh, duplicates };
  }

  private async loadPinnedRequest(batch: Batch) {
    const promptId = new EntityId(batch.promptId, new ProjectId(batch.projectId, batch.tenantId, "batch"));
    const version = await this.prompts.getPromptVersion(new PromptVersionId(batch.version, promptId));
    const body = version ? parsePromptBody(version.body) : null;
    if (!version || !body || body.messages.length === 0) {
      throw new UnprocessableEntityError(`Prompt version ${batch.version} has no messages`);
    }
    return buildExecuteRequest(version, body);
  }

  private encodeLine(adapter: BatchAdapter | null, key: string, request: ExecuteRequest): string {
    if (adapter) {
      return adapter.encodeLine(key, request);
    }
    return JSON.stringify({ key, variables: request.variables ?? {} });
  }

  private async storeItems(batchId: EntityId<number>, part: RenderedPart): Promise<void> {
    const { partKey, lines, rows, bytes } = part;
    const location = { tenantId: batchId.tenantId, batchId: batchId.id };
    await this.deps.files.putPart(location, partKey, lines.map((line) => line + "\n").join(""));
    try {
      const [first, ...rest] = this.items.buildInsertStatements(rows);
      const totals = this.batches.buildAddTotalsStatement(batchId, rows.length, bytes);
      const results = await this.deps.db.batch([first!, ...rest, totals]);
      const totalsResult = results[results.length - 1] as { id: number }[];
      if (totalsResult.length === 0) {
        await this.items.deleteByPartKey(batchId, partKey);
        throw new ConflictError("The batch was submitted while these items were being added. They were not added.");
      }
    } catch (error) {
      await this.deps.files.deletePart(location, partKey).catch(() => undefined);
      if (isUniqueConstraintError(error)) {
        throw new ConflictError("Another call added some of these custom_ids at the same time. Retry this call.");
      }
      throw error;
    }
  }

  private async launchWorkflow(batchId: EntityId<number>, batch: Batch): Promise<void> {
    const instanceId = workflowInstanceId(batch);
    try {
      await this.deps.startWorkflow(instanceId, {
        tenantId: batch.tenantId,
        projectId: batch.projectId,
        userId: batchId.userId,
        batchId: batch.id,
      });
    } catch (error) {
      if (!/already exists/i.test(errorText(error))) throw error;
    }
    await this.batches.update(batchId, { workflowId: instanceId });
  }

  private async cancelSubmittedShards(
    batchId: EntityId<number>,
    batch: Batch,
    adapterFor: (provider: string) => BatchAdapter
  ): Promise<void> {
    const shards = await this.batches.listShards(batchId);
    const submitted = shards.filter((shard) => shard.state === "submitted" && shard.providerBatchId);
    if (submitted.length === 0) return;
    const adapter = adapterFor(batch.provider);
    await Promise.all(
      submitted.map(async (shard) => {
        try {
          await adapter.cancel(shard.providerBatchId!);
        } catch (error) {
          console.error("[BatchService] Provider cancel failed", { batchId: batch.id, shardId: shard.id, error: errorText(error) });
        }
      })
    );
  }
}

export const isTerminalState = (state: string): boolean => (TERMINAL_BATCH_STATES as readonly string[]).includes(state as BatchState);
