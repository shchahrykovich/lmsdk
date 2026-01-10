import { Hono } from "hono";
import { DataSetService } from "../services/dataset.service";
import { requireAuth } from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import type { HonoEnv } from "./app";

const datasets = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
datasets.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/datasets
 * List all datasets for a project
 */
datasets.get("/:projectId/datasets", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const datasetService = new DataSetService(c.env.DB);

    const datasets = await datasetService.getDataSets({
      tenantId: user.tenantId,
      projectId,
    });

    return c.json({ datasets });
  } catch (error) {
    console.error("Error listing datasets:", error);
    return c.json({ error: "Failed to list datasets" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/datasets
 * Create a new dataset
 */
datasets.post("/:projectId/datasets", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const body = await c.req.json();
    const { name, schema } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return c.json({ error: "Name is required" }, 400);
    }

    const datasetService = new DataSetService(c.env.DB);

    const dataset = await datasetService.createDataSet(
      {
        tenantId: user.tenantId,
        projectId,
      },
      {
        name: name.trim(),
        schema: typeof schema === "string" ? schema : undefined,
      }
    );

    return c.json({ dataset }, 201);
  } catch (error) {
    console.error("Error creating dataset:", error);
    return c.json({ error: "Failed to create dataset" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/datasets/:datasetId
 * Get a specific dataset
 */
datasets.get("/:projectId/datasets/:datasetId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const datasetId = parseInt(c.req.param("datasetId"));

    if (isNaN(projectId) || isNaN(datasetId)) {
      return c.json({ error: "Invalid project ID or dataset ID" }, 400);
    }

    const datasetService = new DataSetService(c.env.DB);

    const dataset = await datasetService.getDataSetById({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    return c.json({ dataset });
  } catch (error) {
    console.error("Error fetching dataset:", error);
    return c.json({ error: "Failed to fetch dataset" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/datasets/:datasetId/records
 * List dataset records with pagination
 */
datasets.get("/:projectId/datasets/:datasetId/records", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const datasetId = parseInt(c.req.param("datasetId"));

    if (isNaN(projectId) || isNaN(datasetId)) {
      return c.json({ error: "Invalid project ID or dataset ID" }, 400);
    }

    // Parse pagination parameters
    const pageParam = c.req.query("page");
    const pageSizeParam = c.req.query("pageSize");
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    const pageSize = pageSizeParam
      ? Math.min(100, Math.max(1, parseInt(pageSizeParam, 10)))
      : 10;

    const datasetService = new DataSetService(c.env.DB);

    const dataset = await datasetService.getDataSetById({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    const result = await datasetService.listDataSetRecordsPaginated(
      {
        tenantId: user.tenantId,
        projectId,
        dataSetId: datasetId,
      },
      { page, pageSize }
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
  } catch (error) {
    console.error("Error listing dataset records:", error);
    return c.json({ error: "Failed to list dataset records" }, 500);
  }
});

/**
 * DELETE /api/projects/:projectId/datasets/:datasetId/records
 * Delete dataset records
 */
datasets.delete("/:projectId/datasets/:datasetId/records", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const datasetId = parseInt(c.req.param("datasetId"));

    if (isNaN(projectId) || isNaN(datasetId)) {
      return c.json({ error: "Invalid project ID or dataset ID" }, 400);
    }

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

    const dataset = await datasetService.getDataSetById({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    const result = await datasetService.deleteDataSetRecords(
      {
        tenantId: user.tenantId,
        projectId,
        dataSetId: datasetId,
      },
      parsedRecordIds
    );

    return c.json({ success: true, deleted: result.deleted });
  } catch (error) {
    console.error("Error deleting dataset records:", error);
    return c.json({ error: "Failed to delete dataset records" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/datasets/:datasetId/records
 * Create a new dataset record
 */
datasets.post("/:projectId/datasets/:datasetId/records", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const datasetId = parseInt(c.req.param("datasetId"));

    if (isNaN(projectId) || isNaN(datasetId)) {
      return c.json({ error: "Invalid project ID or dataset ID" }, 400);
    }

    const body = await c.req.json();
    const { variables } = body;

    if (!variables || typeof variables !== "object") {
      return c.json({ error: "Variables object is required" }, 400);
    }

    const datasetService = new DataSetService(c.env.DB);

    const dataset = await datasetService.getDataSetById({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    const record = await datasetService.createDataSetRecord(
      {
        tenantId: user.tenantId,
        projectId,
        dataSetId: datasetId,
      },
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
  } catch (error) {
    console.error("Error creating dataset record:", error);
    return c.json({ error: "Failed to create dataset record" }, 500);
  }
});

/**
 * DELETE /api/projects/:projectId/datasets/:datasetId
 * Soft delete a dataset
 */
datasets.delete("/:projectId/datasets/:datasetId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const datasetId = parseInt(c.req.param("datasetId"));

    if (isNaN(projectId) || isNaN(datasetId)) {
      return c.json({ error: "Invalid project ID or dataset ID" }, 400);
    }

    const datasetService = new DataSetService(c.env.DB);

    // Verify dataset exists and belongs to user's tenant
    const dataset = await datasetService.getDataSetById({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    await datasetService.deleteDataSet({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting dataset:", error);
    return c.json({ error: "Failed to delete dataset" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/datasets/:datasetId/logs
 * Add logs to a dataset
 */
datasets.post("/:projectId/datasets/:datasetId/logs", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const datasetId = parseInt(c.req.param("datasetId"));

    if (isNaN(projectId) || isNaN(datasetId)) {
      return c.json({ error: "Invalid project ID or dataset ID" }, 400);
    }

    const body = await c.req.json();
    const logIds = Array.isArray(body?.logIds) ? body.logIds : [];
    const parsedLogIds = logIds
      .map((logId: unknown) => Number(logId))
      .filter((logId: number) => Number.isInteger(logId));

    if (parsedLogIds.length === 0) {
      return c.json({ error: "Log IDs are required" }, 400);
    }

    const datasetService = new DataSetService(c.env.DB, c.env.PRIVATE_FILES);

    const dataset = await datasetService.getDataSetById({
      tenantId: user.tenantId,
      projectId,
      dataSetId: datasetId,
    });

    if (!dataset) {
      return c.json({ error: "Dataset not found" }, 404);
    }

    const result = await datasetService.addLogsToDataSet(
      {
        tenantId: user.tenantId,
        projectId,
        dataSetId: datasetId,
      },
      { logIds: parsedLogIds }
    );

    return c.json({ success: true, ...result });
  } catch (error) {
    console.error("Error adding logs to dataset:", error);
    return c.json({ error: "Failed to add logs to dataset" }, 500);
  }
});

export default datasets;
