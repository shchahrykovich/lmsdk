import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import type { HonoEnv } from "../../routes/app";
import { ManageResolver } from "../manage/resolve";
import { EntityId } from "../../shared/entity-id";
import { ClientInputValidationError, NotFoundError } from "../../shared/errors";
import { BatchService, MAX_ITEMS_PER_CALL, BATCH_RESULTS_RETENTION_DAYS } from "../../batches/batch.service";
import { BatchProviderNotConfiguredError } from "../../batches/adapters/adapter-factory";
import { batchServiceFor } from "../../batches/batch-service.factory";
import { UnprocessableEntityError } from "../../shared/errors";
import { ErrorResponse } from "./schemas";
import {
  BatchResultItemSchema,
  BatchSchema,
  ITEM_STATUSES,
  serializeBatch,
  serializeResultItem,
} from "./batch-schemas";

const TAGS = ["v1"];
const SECURITY = [{ apiKey: [] }];

const promptParams = z.object({
  projectSlugOrId: z.string().min(1).describe("Project slug or numeric ID"),
  promptSlugOrId: z.string().min(1).describe("Prompt slug or numeric ID"),
});

const batchParams = promptParams.extend({
  batchId: z.string().regex(/^\d+$/).describe("Batch id"),
});

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { "application/json": { schema } },
});

const body = <T extends z.ZodType>(schema: T) => ({ content: { "application/json": { schema } }, required: true });

const errors = {
  "400": json(ErrorResponse, "The request is invalid"),
  "401": json(ErrorResponse, "The x-api-key header is missing or the key is invalid"),
  "404": json(ErrorResponse, "The project, prompt, version or batch was not found"),
};

const conflict = { "409": json(ErrorResponse, "The batch is not in a state that allows this call") };

const RETENTION = `Results are kept for ${BATCH_RESULTS_RETENTION_DAYS} days after the batch ends, then the batch and its results are deleted.`;

export function createBatchService(c: Context<HonoEnv>): BatchService {
  return batchServiceFor(c.env);
}

async function resolvePrompt(c: Context<HonoEnv>, params: z.infer<typeof promptParams>) {
  const resolver = new ManageResolver(c);
  const { projectId } = await resolver.project(params.projectSlugOrId);
  return await resolver.prompt(projectId, params.promptSlugOrId);
}

async function resolveBatchId(c: Context<HonoEnv>, params: z.infer<typeof batchParams>): Promise<EntityId<number>> {
  const { promptId } = await resolvePrompt(c, params);
  const batchId = new EntityId(Number(params.batchId), promptId.getProjectId());
  const batch = await createBatchService(c).requireBatch(batchId);
  if (batch.promptId !== promptId.id) {
    throw new NotFoundError("Batch not found");
  }
  return batchId;
}

async function respondWithBatch(c: Context<HonoEnv>, service: BatchService, batchId: EntityId<number>, status: 200 | 201 = 200) {
  const { batch, shards } = await service.getBatch(batchId);
  return c.json({ batch: serializeBatch(batch, shards) }, status);
}

export class V1CreateBatch extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "Create a batch",
    description: [
      "Creates a draft batch for many executions of one prompt version and pins that version now.",
      "Activating another version later does not change the batch.",
      "OpenAI, Anthropic and Google run through their native batch APIs at the batch price.",
      "A provider without a batch API (OpenRouter, OpenRouter Decisions) is refused with 422 unless `fallback` is `paced`.",
      "Safe to retry when you send `idempotency_key`: a repeat with the same key returns the same batch with status 200.",
      "Without a key, a repeat creates another draft.",
    ].join(" "),
    security: SECURITY,
    request: {
      params: promptParams,
      body: body(
        z.object({
          version: z.number().int().positive().optional().describe("Version to pin. Left out, the active version is pinned."),
          idempotency_key: z.string().min(1).max(200).optional().describe("Makes the call safe to retry"),
          metadata: z.record(z.string(), z.unknown()).optional().describe("Your own data, returned as is"),
          fallback: z
            .enum(["paced"])
            .optional()
            .describe("For providers without a batch API: run the items through execute at full price with bounded concurrency"),
        })
      ),
    },
    responses: {
      "201": json(z.object({ batch: BatchSchema }), "The new draft batch"),
      "200": json(z.object({ batch: BatchSchema }), "The batch created earlier with the same idempotency_key"),
      ...errors,
      "422": json(ErrorResponse, "The provider has no batch API and no fallback was given, or its API key is not configured"),
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body: input } = await this.getValidatedData<typeof this.schema>();
    const { promptId } = await resolvePrompt(c, params);
    const service = createBatchService(c);
    try {
      const { batch, created } = await service.createBatch(promptId, {
        version: input.version,
        idempotencyKey: input.idempotency_key,
        metadata: input.metadata,
        fallback: input.fallback,
      });
      return await respondWithBatch(c, service, new EntityId(batch.id, promptId.getProjectId()), created ? 201 : 200);
    } catch (error) {
      if (error instanceof BatchProviderNotConfiguredError) {
        throw new UnprocessableEntityError(error.message);
      }
      throw error;
    }
  }
}

export class V1ListBatches extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "List batches",
    description: `Batches of the prompt, newest first. Use \`before\` with the last id of a page to get the next page. Safe to retry. ${RETENTION}`,
    security: SECURITY,
    request: {
      params: promptParams,
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        before: z.coerce.number().int().positive().optional().describe("Return batches with a smaller id"),
      }),
    },
    responses: {
      "200": json(z.object({ batches: z.array(BatchSchema) }), "Batches, newest first"),
      ...errors,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, query } = await this.getValidatedData<typeof this.schema>();
    const { promptId } = await resolvePrompt(c, params);
    const batches = await createBatchService(c).listBatches(promptId, query.limit, query.before);
    return c.json({ batches: batches.map((batch) => serializeBatch(batch)) });
  }
}

export class V1AddBatchItems extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "Add items to a draft batch",
    description: [
      `Adds 1 to ${MAX_ITEMS_PER_CALL} items. Only allowed while the batch is a draft.`,
      "Each item is rendered with the pinned version right away.",
      "A custom_id that is already in the batch is refused and listed in `duplicates`; the stored item is never overwritten.",
      "That makes the call safe to retry after a timeout: a repeat adds only the items that are missing.",
    ].join(" "),
    security: SECURITY,
    request: {
      params: batchParams,
      body: body(
        z.object({
          items: z
            .array(
              z.object({
                custom_id: z.string().min(1).max(256).describe("Your id for the item, unique in the batch"),
                variables: z.record(z.string(), z.unknown()).optional().describe("Values for the {{variable}} placeholders"),
              })
            )
            .min(1)
            .max(MAX_ITEMS_PER_CALL),
        })
      ),
    },
    responses: {
      "200": json(
        z.object({
          accepted: z.number().describe("Items added by this call"),
          duplicates: z.array(z.string()).describe("custom_ids already in the batch or repeated in this call; not added"),
          refused: z.array(z.object({ custom_id: z.string(), reason: z.string() })).describe("Items that cannot run, for example too large"),
          batch: BatchSchema,
        }),
        "What was added"
      ),
      ...errors,
      ...conflict,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body: input } = await this.getValidatedData<typeof this.schema>();
    const batchId = await resolveBatchId(c, params);
    const service = createBatchService(c);
    const result = await service.addItems(batchId, input.items);
    return c.json({
      accepted: result.accepted,
      duplicates: result.duplicates,
      refused: result.refused,
      batch: serializeBatch(result.batch),
    });
  }
}

export class V1SubmitBatch extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "Submit a batch",
    description: [
      "Starts the batch. LM SDK splits the items into as many provider batches as the provider limits need and submits them in the background.",
      "Safe to retry: a repeat returns the current batch and changes nothing.",
    ].join(" "),
    security: SECURITY,
    request: { params: batchParams, body: body(z.object({}).passthrough()) },
    responses: {
      "200": json(z.object({ batch: BatchSchema }), "The batch"),
      ...errors,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const batchId = await resolveBatchId(c, params);
    const service = createBatchService(c);
    await service.submit(batchId);
    return await respondWithBatch(c, service, batchId);
  }
}

export class V1GetBatch extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "Get a batch",
    description: `Returns the state, the counts, the pinned version, the provider batches, and usage and cost summed over the results so far. Safe to retry. ${RETENTION}`,
    security: SECURITY,
    request: { params: batchParams },
    responses: {
      "200": json(z.object({ batch: BatchSchema }), "The batch"),
      ...errors,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    return await respondWithBatch(c, createBatchService(c), await resolveBatchId(c, params));
  }
}

export class V1BatchResults extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "Read batch results",
    description: [
      "Returns the items in the order they were added, one page at a time. Pass `next_cursor` as `cursor` to get the next page.",
      "Items that are not done yet have status `pending`; read the page again later, or filter with `status`.",
      "Results are readable while the batch is still running.",
      `Safe to retry. ${RETENTION}`,
    ].join(" "),
    security: SECURITY,
    request: {
      params: batchParams,
      query: z.object({
        cursor: z.string().regex(/^\d+$/).optional().describe("next_cursor from the previous page"),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
        status: z.enum(ITEM_STATUSES).optional().describe("Return only items with this status"),
      }),
    },
    responses: {
      "200": json(
        z.object({
          items: z.array(BatchResultItemSchema),
          next_cursor: z.string().nullable().describe("null on the last page"),
        }),
        "A page of results"
      ),
      ...errors,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, query } = await this.getValidatedData<typeof this.schema>();
    const batchId = await resolveBatchId(c, params);
    const afterId = query.cursor ? Number(query.cursor) : 0;
    if (!Number.isSafeInteger(afterId)) {
      throw new ClientInputValidationError("Invalid cursor");
    }
    const { batch, items } = await createBatchService(c).listResults(batchId, afterId, query.limit, query.status);
    const last = items[items.length - 1];
    return c.json({
      items: items.map((item) => serializeResultItem(batch, item)),
      next_cursor: items.length === query.limit && last ? String(last.item.id) : null,
    });
  }
}

export class V1CancelBatch extends OpenAPIRoute {
  schema = {
    tags: TAGS,
    summary: "Cancel a batch",
    description: [
      "Cancels the provider batches. Items that already finished keep their results; the other items become `cancelled`.",
      "A draft is cancelled at once. A running batch reaches `cancelled` after the providers confirm, usually within minutes.",
      "Safe to retry: a repeat changes nothing.",
    ].join(" "),
    security: SECURITY,
    request: { params: batchParams, body: body(z.object({}).passthrough()) },
    responses: {
      "200": json(z.object({ batch: BatchSchema }), "The batch"),
      ...errors,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const batchId = await resolveBatchId(c, params);
    const service = createBatchService(c);
    await service.cancel(batchId);
    return await respondWithBatch(c, service, batchId);
  }
}
