import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import type { HonoEnv } from "../../routes/app";
import { batchServiceFor } from "../../batches/batch-service.factory";
import { BATCH_RESULTS_RETENTION_DAYS } from "../../batches/batch.service";
import type { EntityId } from "../../shared/entity-id";
import { ManageResolver } from "./resolve";
import {
  BATCH_STATE_FILTERS,
  ProjectBatchSchema,
  WorkflowStatusSchema,
  serializeProjectBatch,
  statesFor,
} from "../v1/batch-schemas";
import {
  MANAGE_TAG,
  SlugOrId,
  conflictResponse,
  errorResponses,
  jsonBody,
  jsonContent,
  manageSecurity,
  notFoundResponse,
} from "./schemas";

const BatchIdParam = z.string().min(1).describe("Numeric batch id, for example `42`");

const batchParams = z.object({ project: SlugOrId, batch: BatchIdParam });

const BatchResponse = z.object({ batch: ProjectBatchSchema, workflowStatus: WorkflowStatusSchema });

async function resolveBatch(c: Context<HonoEnv>, params: z.infer<typeof batchParams>): Promise<EntityId<number>> {
  const resolver = new ManageResolver(c);
  const { projectId } = await resolver.project(params.project);
  return (await resolver.batch(projectId, params.batch)).batchId;
}

async function respondWithBatch(c: Context<HonoEnv>, batchId: EntityId<number>): Promise<Response> {
  const service = batchServiceFor(c.env);
  const { batch, shards } = await service.getProjectBatch(batchId);
  return c.json({ batch: serializeProjectBatch(batch, shards), workflowStatus: await service.workflowStatus(batch) });
}

export class ManageListBatches extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "List batches",
    description: [
      "Batches of every prompt in the project, newest first.",
      "`state=active` returns batches that are submitting or running.",
      `A batch and its results are deleted ${BATCH_RESULTS_RETENTION_DAYS} days after it ends.`,
    ].join(" "),
    security: manageSecurity,
    request: {
      params: z.object({ project: SlugOrId }),
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        state: z.enum(BATCH_STATE_FILTERS).optional().describe("Return only batches in this state. `active`: submitting or running"),
      }),
    },
    responses: {
      "200": jsonContent(
        z.object({
          batches: z.array(ProjectBatchSchema),
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
          totalPages: z.number(),
        }),
        "Batches, newest first"
      ),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, query } = await this.getValidatedData<typeof this.schema>();
    const { projectId } = await new ManageResolver(c).project(params.project);
    const result = await batchServiceFor(c.env).listProjectBatches(projectId, query.page, query.pageSize, statesFor(query.state));
    return c.json({ ...result, batches: result.batches.map((batch) => serializeProjectBatch(batch)) });
  }
}

export class ManageGetBatch extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Get a batch",
    description: [
      "Returns the state, the item counts, the provider batches, usage, cost, and the status of the background run.",
      "Poll this until `state` is finished, failed or cancelled.",
      "If `state` is submitting or running but `workflowStatus` is errored, terminated or complete, the batch is stuck: call finish.",
    ].join(" "),
    security: manageSecurity,
    request: { params: batchParams },
    responses: {
      "200": jsonContent(BatchResponse, "The batch"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    return await respondWithBatch(c, await resolveBatch(c, params));
  }
}

export class ManageCancelBatch extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Cancel a batch",
    description: [
      "Asks the providers to cancel. Items that already finished keep their results; the other items become `cancelled`.",
      "A draft is cancelled at once. A running batch reaches `cancelled` after the background run sees the providers confirm, usually within minutes.",
      "If the background run has stopped, the batch stays running: call finish instead.",
      "Safe to retry: a repeat changes nothing.",
    ].join(" "),
    security: manageSecurity,
    request: { params: batchParams, body: jsonBody(z.looseObject({})) },
    responses: {
      "200": jsonContent(BatchResponse, "The batch"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const batchId = await resolveBatch(c, params);
    await batchServiceFor(c.env).cancel(batchId);
    return await respondWithBatch(c, batchId);
  }
}

export class ManageFinishBatch extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Finish a batch now",
    description: [
      "Ends a submitting or running batch at once, for example when its background run stopped and it is stuck.",
      "Stops the background run, cancels the provider batches that are still open, and marks every item without a result as `cancelled` with error code `finished_by_hand`.",
      "Results that arrived before keep their status. Results a provider has finished but LM SDK has not imported yet are not imported.",
      "The batch becomes `finished`, or `cancelled` when a cancel was requested before.",
      "A draft returns 409: cancel it instead. A batch that already ended is returned unchanged, so a repeat is safe.",
    ].join(" "),
    security: manageSecurity,
    request: { params: batchParams, body: jsonBody(z.looseObject({})) },
    responses: {
      "200": jsonContent(BatchResponse, "The batch"),
      ...errorResponses,
      ...notFoundResponse,
      "409": { ...conflictResponse["409"], description: "The batch is a draft; cancel it instead" },
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const batchId = await resolveBatch(c, params);
    await batchServiceFor(c.env).finish(batchId);
    return await respondWithBatch(c, batchId);
  }
}
