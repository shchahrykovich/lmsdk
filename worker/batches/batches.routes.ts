import { Hono, type Context } from "hono";
import { requireAuth } from "../middleware/auth.middleware";
import type { HonoEnv } from "../routes/app";
import { Pagination } from "../shared/pagination";
import { ProjectId } from "../shared/project-id";
import { EntityId } from "../shared/entity-id";
import { ClientInputValidationError } from "../shared/errors";
import { batchServiceFor } from "./batch-service.factory";
import type { BatchItemStatus } from "./batch-item.repository";
import {
  ITEM_STATUSES,
  isBatchStateFilter,
  serializeProjectBatch,
  serializeResultItem,
  statesFor,
} from "../openapi/v1/batch-schemas";

const ITEMS_PAGE_MAX = 200;

const batchesRouter = new Hono<HonoEnv>();

batchesRouter.use("/*", requireAuth);

const parseStateFilter = (value: string | undefined) => {
  if (!value) return undefined;
  if (!isBatchStateFilter(value)) {
    throw new ClientInputValidationError(`Invalid state filter "${value}"`);
  }
  return statesFor(value);
};

const parseItemStatus = (value: string | undefined): BatchItemStatus | undefined => {
  if (!value) return undefined;
  if (!(ITEM_STATUSES as readonly string[]).includes(value)) {
    throw new ClientInputValidationError(`Invalid item status "${value}"`);
  }
  return value as BatchItemStatus;
};

const parseNonNegativeInt = (value: string | undefined, fallback: number, name: string): number => {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ClientInputValidationError(`Invalid ${name}`);
  }
  return parsed;
};

const respondWithBatch = async (c: Context<HonoEnv>, batchId: EntityId<number>) => {
  const service = batchServiceFor(c.env);
  const { batch, shards } = await service.getProjectBatch(batchId);
  return c.json({ batch: serializeProjectBatch(batch, shards), workflowStatus: await service.workflowStatus(batch) });
};

batchesRouter.get("/:projectId/batches", async (c) => {
  const projectId = ProjectId.parse(c);
  const pagination = Pagination.parse(c, { defaultPageSize: 20, maxPageSize: 100 });
  const states = parseStateFilter(c.req.query("state"));
  const result = await batchServiceFor(c.env).listProjectBatches(projectId, pagination.page, pagination.size, states);
  return c.json({ ...result, batches: result.batches.map((batch) => serializeProjectBatch(batch)) });
});

batchesRouter.get("/:projectId/batches/:batchId", async (c) => {
  return await respondWithBatch(c, EntityId.parse(c, "batchId"));
});

batchesRouter.get("/:projectId/batches/:batchId/items", async (c) => {
  const batchId = EntityId.parse(c, "batchId");
  const afterId = parseNonNegativeInt(c.req.query("cursor"), 0, "cursor");
  const limit = Math.min(Math.max(parseNonNegativeInt(c.req.query("limit"), 50, "limit"), 1), ITEMS_PAGE_MAX);
  const status = parseItemStatus(c.req.query("status"));
  const { batch, items } = await batchServiceFor(c.env).listResults(batchId, afterId, limit, status);
  const last = items[items.length - 1];
  return c.json({
    items: items.map((item) => ({ id: item.item.id, ...serializeResultItem(batch, item) })),
    nextCursor: items.length === limit && last ? String(last.item.id) : null,
  });
});

batchesRouter.post("/:projectId/batches/:batchId/cancel", async (c) => {
  const batchId = EntityId.parse(c, "batchId");
  await batchServiceFor(c.env).cancel(batchId);
  return await respondWithBatch(c, batchId);
});

batchesRouter.post("/:projectId/batches/:batchId/finish", async (c) => {
  const batchId = EntityId.parse(c, "batchId");
  await batchServiceFor(c.env).finish(batchId);
  return await respondWithBatch(c, batchId);
});

export default batchesRouter;
