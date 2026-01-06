import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import {requireAuth} from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import { TraceService } from "../services/traces.service";
import type { HonoEnv } from "./app";

const tracesRouter = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
tracesRouter.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/traces
 * List traces for a project with pagination and sorting
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 10, max: 100)
 * - sortField: Field to sort by (createdAt, updatedAt, totalLogs, totalDurationMs, firstLogAt, lastLogAt)
 * - sortDirection: Sort direction (asc, desc)
 */
tracesRouter.get("/:projectId/traces", async (c) => {
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
    const sortField = c.req.query("sortField") as
      | "createdAt"
      | "updatedAt"
      | "totalLogs"
      | "totalDurationMs"
      | "firstLogAt"
      | "lastLogAt"
      | undefined;
    const sortDirection = c.req.query("sortDirection") as "asc" | "desc" | undefined;

    const sort = sortField ? {
      field: sortField,
      direction: sortDirection ?? "desc",
    } : undefined;

    const db = drizzle(c.env.DB);
    const traceService = new TraceService(db);

    const result = await traceService.listProjectTraces({
      tenantId: user.tenantId,
      projectId,
      page,
      pageSize,
      sort,
    });

    return c.json(result);
  } catch (error) {
    console.error("Error listing traces:", error);
    return c.json({ error: "Failed to list traces" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/traces/:traceId
 * Get trace details including all associated logs
 */
tracesRouter.get("/:projectId/traces/:traceId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const traceId = c.req.param("traceId");

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    if (!traceId) {
      return c.json({ error: "Trace ID is required" }, 400);
    }

    const db = drizzle(c.env.DB);
    const traceService = new TraceService(db);

    const result = await traceService.getTraceDetails(
      user.tenantId,
      projectId,
      traceId
    );

    if (!result.trace) {
      return c.json({ error: "Trace not found" }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error("Error getting trace details:", error);
    return c.json({ error: "Failed to get trace details" }, 500);
  }
});

export default tracesRouter;
