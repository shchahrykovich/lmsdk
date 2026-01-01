import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { requireAuth } from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import { LogService } from "../services/logs.service";
import type { HonoEnv } from "./app";

const logs = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
logs.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/logs/prompts
 * Get unique prompts that have been logged for filtering
 */
logs.get("/:projectId/logs/prompts", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const logService = new LogService(db, c.env.PRIVATE_FILES, c.env.DB);

    const prompts = await logService.getUniquePromptsForProject(
      user.tenantId,
      projectId
    );

    return c.json({ prompts });
  } catch (error) {
    console.error("Error fetching unique prompts:", error);
    return c.json({ error: "Failed to fetch prompts" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/logs/variables
 * Get unique variable paths that have been indexed for filtering
 */
logs.get("/:projectId/logs/variables", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const logService = new LogService(db, c.env.PRIVATE_FILES, c.env.DB);

    const variablePaths = await logService.getUniqueVariablePathsForProject(
      user.tenantId,
      projectId
    );

    return c.json({ variablePaths });
  } catch (error) {
    console.error("Error fetching variable paths:", error);
    return c.json({ error: "Failed to fetch variable paths" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/logs
 * List prompt execution logs for a project with pagination, sorting, and filtering
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 10, max: 100)
 * - sortField: Field to sort by (createdAt, durationMs, promptName, isSuccess, provider)
 * - sortDirection: Sort direction (asc, desc)
 * - isSuccess: Filter by success status (true, false)
 * - promptId: Filter by prompt ID
 * - version: Filter by prompt version
 * - variablePath: Filter by variable path
 * - variableValue: Filter by variable value (partial match)
 * - variableOperator: Operator for variable filtering (contains, notEmpty)
 */
logs.get("/:projectId/logs", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    // Parse pagination parameters
    const pageParam = c.req.query("page");
    const pageSizeParam = c.req.query("pageSize");
    const page = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;
    const pageSize = pageSizeParam
      ? Math.min(100, Math.max(1, parseInt(pageSizeParam, 10)))
      : 10;

    // Parse sort parameters
    const sortField = c.req.query("sortField") as "createdAt" | "durationMs" | "promptName" | "isSuccess" | "provider" | undefined;
    const sortDirection = c.req.query("sortDirection") as "asc" | "desc" | undefined;

    const sort = sortField ? {
      field: sortField,
      direction: sortDirection || "desc",
    } : undefined;

    // Parse filter parameters
    const filters: any = {};

    const isSuccess = c.req.query("isSuccess");
    if (isSuccess !== undefined) {
      filters.isSuccess = isSuccess === "true";
    }

    const promptId = c.req.query("promptId");
    if (promptId) {
      filters.promptId = parseInt(promptId, 10);
    }

    const version = c.req.query("version");
    if (version) {
      filters.version = parseInt(version, 10);
    }

    const variablePath = c.req.query("variablePath");
    if (variablePath) {
      filters.variablePath = variablePath;
    }

    const variableValue = c.req.query("variableValue");
    if (variableValue) {
      filters.variableValue = variableValue;
    }

    const variableOperator = c.req.query("variableOperator") as "contains" | "notEmpty" | undefined;
    if (variableOperator) {
      filters.variableOperator = variableOperator;
    }

    console.log("Filters being applied:", filters); // Debug log

    const db = drizzle(c.env.DB);
    const logService = new LogService(db, c.env.PRIVATE_FILES, c.env.DB);

    const result = await logService.listProjectLogs(
      user.tenantId,
      projectId,
      page,
      pageSize,
      Object.keys(filters).length > 0 ? filters : undefined,
      sort
    );

    return c.json(result);
  } catch (error) {
    console.error("Error listing logs:", error);
    return c.json({ error: "Failed to list logs" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/logs/:logId
 * Get a single prompt execution log with stored payloads
 */
logs.get("/:projectId/logs/:logId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const logId = parseInt(c.req.param("logId"));

    if (isNaN(projectId) || isNaN(logId)) {
      return c.json({ error: "Invalid project or log ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const logService = new LogService(db, c.env.PRIVATE_FILES, c.env.DB);
    const result = await logService.getProjectLogDetails(
      user.tenantId,
      projectId,
      logId
    );

    if (!result.log) {
      return c.json({ error: "Log not found" }, 404);
    }
    return c.json({ log: result.log, files: result.files });
  } catch (error) {
    console.error("Error getting log:", error);
    return c.json({ error: "Failed to get log" }, 500);
  }
});

export default logs;
