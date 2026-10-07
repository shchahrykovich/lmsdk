import { z } from "zod";
import type { Batch, BatchShard } from "../../db/schema";
import type { ResultItem } from "../../batches/batch.service";
import { ACTIVE_BATCH_STATES, type BatchState, type BatchWithPrompt } from "../../batches/batch.repository";

export const BATCH_STATES = ["draft", "submitting", "running", "finished", "failed", "cancelled"] as const;
export const ITEM_STATUSES = ["pending", "succeeded", "errored", "expired", "cancelled"] as const;
export const BATCH_STATE_FILTERS = [...BATCH_STATES, "active"] as const;

export type BatchStateFilter = (typeof BATCH_STATE_FILTERS)[number];

export const statesFor = (filter?: BatchStateFilter): readonly BatchState[] | undefined => {
  if (!filter) return undefined;
  return filter === "active" ? ACTIVE_BATCH_STATES : [filter];
};

export const isBatchStateFilter = (value: string): value is BatchStateFilter =>
  (BATCH_STATE_FILTERS as readonly string[]).includes(value);

const UsageSchema = z
  .object({
    prompt_tokens: z.number(),
    completion_tokens: z.number(),
    total_tokens: z.number(),
    cost: z.number().nullable().describe("Cost in USD at the price the item ran at. null when the model has no price."),
  })
  .passthrough();

export const BatchSchema = z.object({
  id: z.number(),
  state: z.enum(BATCH_STATES),
  mode: z.enum(["native", "paced"]).describe("native: the provider batch API. paced: execute calls with bounded concurrency."),
  discount: z.enum(["batch", "none"]).describe("batch: the provider batch price. none: the full price."),
  provider: z.string(),
  model: z.string(),
  version: z.number().describe("The prompt version pinned when the batch was created"),
  prompt_id: z.number(),
  idempotency_key: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  counts: z.object({
    total: z.number(),
    pending: z.number(),
    succeeded: z.number(),
    errored: z.number(),
    expired: z.number(),
    cancelled: z.number(),
  }),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number(), total_tokens: z.number() }),
  cost: z.number().describe("Sum of the item costs so far, in USD"),
  cost_complete: z.boolean().describe("false when some succeeded items have no price, so cost is too low"),
  provider_batches: z.array(
    z.object({
      id: z.string().nullable(),
      state: z.string(),
      provider_status: z.string().nullable(),
      items: z.number(),
      error: z.string().nullable(),
    })
  ),
  cancel_requested: z.boolean(),
  error: z.string().nullable(),
  created_at: z.string(),
  submitted_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  results_expire_at: z.string().nullable().describe("After this time the batch and its results are deleted"),
});

export const ProjectBatchSchema = BatchSchema.extend({
  prompt: z.object({
    id: z.number(),
    name: z.string().nullable(),
    slug: z.string().nullable(),
  }),
});

export const WorkflowStatusSchema = z
  .string()
  .nullable()
  .describe(
    "Status of the background run: queued, running, waiting, paused, errored, terminated, complete, unknown. Null when the batch was never submitted. A batch in submitting or running whose run is errored, terminated or complete is stuck: finish it."
  );

export const BatchResultItemSchema = z.object({
  custom_id: z.string(),
  version: z.number(),
  status: z.enum(ITEM_STATUSES),
  result: z.unknown().describe("Exactly what /execute returns in `response`. null unless the status is succeeded."),
  model: z.string().nullable(),
  usage: UsageSchema.nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export function serializeBatch(batch: Batch, shards: BatchShard[] = []): z.infer<typeof BatchSchema> {
  const done = batch.succeededCount + batch.erroredCount + batch.expiredCount + batch.cancelledCount;
  return {
    id: batch.id,
    state: batch.state as z.infer<typeof BatchSchema>["state"],
    mode: batch.mode as "native" | "paced",
    discount: batch.mode === "native" ? "batch" : "none",
    provider: batch.provider,
    model: batch.model,
    version: batch.version,
    prompt_id: batch.promptId,
    idempotency_key: batch.idempotencyKey,
    metadata: parseJson(batch.metadata, {}),
    counts: {
      total: batch.totalItems,
      pending: Math.max(0, batch.totalItems - done),
      succeeded: batch.succeededCount,
      errored: batch.erroredCount,
      expired: batch.expiredCount,
      cancelled: batch.cancelledCount,
    },
    usage: {
      prompt_tokens: batch.promptTokens,
      completion_tokens: batch.completionTokens,
      total_tokens: batch.totalTokens,
    },
    cost: batch.costUsd,
    cost_complete: batch.unpricedCount === 0,
    provider_batches: shards.map((shard) => ({
      id: shard.providerBatchId,
      state: shard.state,
      provider_status: shard.providerStatus,
      items: shard.itemCount,
      error: shard.errorMessage,
    })),
    cancel_requested: batch.cancelRequestedAt !== null,
    error: batch.errorMessage,
    created_at: batch.createdAt.toISOString(),
    submitted_at: iso(batch.submittedAt),
    finished_at: iso(batch.finishedAt),
    results_expire_at: iso(batch.resultsExpireAt),
  };
}

export function serializeProjectBatch(row: BatchWithPrompt, shards: BatchShard[] = []): z.infer<typeof ProjectBatchSchema> {
  return {
    ...serializeBatch(row, shards),
    prompt: { id: row.promptId, name: row.promptName, slug: row.promptSlug },
  };
}

export function serializeResultItem(batch: Batch, { item, stored }: ResultItem): z.infer<typeof BatchResultItemSchema> {
  const usage = parseJson<Record<string, unknown> | null>(item.usage, null);
  return {
    custom_id: item.customId,
    version: batch.version,
    status: item.status as z.infer<typeof BatchResultItemSchema>["status"],
    result: stored?.result ?? null,
    model: stored?.model ?? null,
    usage: usage
      ? ({ ...usage, cost: item.costUsd ?? null } as z.infer<typeof UsageSchema>)
      : null,
    error: parseJson(item.error, null),
  };
}
