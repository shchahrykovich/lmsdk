import { Hono } from "hono";
import { DataSetService } from "./dataset.service.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";
import type { HonoEnv } from "../routes/app.ts";
import {ProjectId} from "../shared/project-id";
import {EntityId} from "../shared/entity-id";
import {Pagination} from "../shared/pagination";

const datasets = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
datasets.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/datasets
 * List all datasets for a project
 */
datasets.get("/:projectId/datasets", async (c) => {
	const projectId = ProjectId.parse(c);

	const datasetService = new DataSetService(c.env.DB);

	const datasets = await datasetService.getDataSets(projectId);

	return c.json({ datasets });
});

/**
 * POST /api/projects/:projectId/datasets
 * Create a new dataset
 */
datasets.post("/:projectId/datasets", async (c) => {
	const projectId = ProjectId.parse(c);

	const body = await c.req.json();
	const { name, schema } = body;

	if (!name || typeof name !== "string" || !name.trim()) {
		return c.json({ error: "Name is required" }, 400);
	}

	const datasetService = new DataSetService(c.env.DB);

	const dataset = await datasetService.createDataSet(
		{
			tenantId: projectId.tenantId,
			projectId: projectId.id,
		},
		{
			name: name.trim(),
			schema: typeof schema === "string" ? schema : undefined,
		}
	);

	return c.json({ dataset }, 201);
});

/**
 * GET /api/projects/:projectId/datasets/:datasetId
 * Get a specific dataset
 */
datasets.get("/:projectId/datasets/:datasetId", async (c) => {
	const dataSetId = EntityId.parse(c, "datasetId");

	const datasetService = new DataSetService(c.env.DB);

	const dataset = await datasetService.getDataSetById(dataSetId);

	if (!dataset) {
		return c.json({ error: "Dataset not found" }, 404);
	}

	return c.json({ dataset });
});

/**
 * GET /api/projects/:projectId/datasets/:datasetId/records
 * List dataset records with pagination
 */
datasets.get("/:projectId/datasets/:datasetId/records", async (c) => {
	const dataSetId = EntityId.parse(c, "datasetId");

	// Parse pagination parameters
	const pagination = Pagination.parse(c);

	const datasetService = new DataSetService(c.env.DB);

	const dataset = await datasetService.getDataSetById(dataSetId);

	if (!dataset) {
		return c.json({ error: "Dataset not found" }, 404);
	}

	const result = await datasetService.listDataSetRecordsPaginated(
		dataSetId,
		{ page: pagination.page, pageSize: pagination.size }
	);

	const parsedRecords = result.records.map((record) => ({
		...record,
		variables: (() => {
			try {
				return JSON.parse(record.variables ?? "{}");
			} catch {
				return {};
			}
		})(),
	}));

	return c.json({
		records: parsedRecords,
		total: result.total,
		page: result.page,
		pageSize: result.pageSize,
		totalPages: result.totalPages,
	});
});

/**
 * DELETE /api/projects/:projectId/datasets/:datasetId/records
 * Delete dataset records
 */
datasets.delete("/:projectId/datasets/:datasetId/records", async (c) => {
	const dataSetId = EntityId.parse(c, "datasetId");

	const body = await c.req.json();
	const recordIds = Array.isArray(body?.recordIds) ? body.recordIds : [];
	const parsedRecordIds = recordIds
		.filter((id: unknown) => id != null && id !== "")
		.map((id: unknown) => Number(id))
		.filter((id: number) => Number.isInteger(id) && id > 0);

	if (parsedRecordIds.length === 0) {
		return c.json({ error: "Record IDs are required" }, 400);
	}

	const datasetService = new DataSetService(c.env.DB);

	const dataset = await datasetService.getDataSetById(dataSetId);

	if (!dataset) {
		return c.json({ error: "Dataset not found" }, 404);
	}

	const result = await datasetService.deleteDataSetRecords(
		dataSetId,
		parsedRecordIds
	);

	return c.json({ success: true, deleted: result.deleted });
});

/**
 * POST /api/projects/:projectId/datasets/:datasetId/records
 * Create a new dataset record
 */
datasets.post("/:projectId/datasets/:datasetId/records", async (c) => {
	const dataSetId = EntityId.parse(c, "datasetId");

	const body = await c.req.json();
	const { variables } = body;

	if (!variables || typeof variables !== "object") {
		return c.json({ error: "Variables object is required" }, 400);
	}

	const datasetService = new DataSetService(c.env.DB);

	const dataset = await datasetService.getDataSetById(dataSetId);

	if (!dataset) {
		return c.json({ error: "Dataset not found" }, 404);
	}

	const record = await datasetService.createDataSetRecord(
		dataSetId,
		variables
	);

	const parsedRecord = {
		...record,
		variables: (() => {
			try {
				return JSON.parse(record.variables ?? "{}");
			} catch {
				return {};
			}
		})(),
	};

	return c.json({ record: parsedRecord }, 201);
});

/**
 * DELETE /api/projects/:projectId/datasets/:datasetId
 * Soft delete a dataset
 */
datasets.delete("/:projectId/datasets/:datasetId", async (c) => {
	const dataSetId = EntityId.parse(c, "datasetId");

	const datasetService = new DataSetService(c.env.DB);

	// Verify dataset exists and belongs to user's tenant
	const dataset = await datasetService.getDataSetById(dataSetId);

	if (!dataset) {
		return c.json({ error: "Dataset not found" }, 404);
	}

	await datasetService.deleteDataSet(dataSetId);

	return c.json({ success: true });
});

/**
 * POST /api/projects/:projectId/datasets/:datasetId/logs
 * Add logs to a dataset
 */
datasets.post("/:projectId/datasets/:datasetId/logs", async (c) => {
	const dataSetId = EntityId.parse(c, "datasetId");

	const body = await c.req.json();
	const logIds = Array.isArray(body?.logIds) ? body.logIds : [];
	const parsedLogIds = logIds
		.map((logId: unknown) => Number(logId))
		.filter((logId: number) => Number.isInteger(logId));

	if (parsedLogIds.length === 0) {
		return c.json({ error: "Log IDs are required" }, 400);
	}

	const datasetService = new DataSetService(c.env.DB, c.env.PRIVATE_FILES);

	const dataset = await datasetService.getDataSetById(dataSetId);

	if (!dataset) {
		return c.json({ error: "Dataset not found" }, 404);
	}

	const result = await datasetService.addLogsToDataSet(
		dataSetId,
		{ logIds: parsedLogIds }
	);

	return c.json({ success: true, ...result });
});

export default datasets;
