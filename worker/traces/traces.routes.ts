import { Hono } from "hono";
import {requireAuth} from "../middleware/auth.middleware.ts";
import { TraceService } from "./traces.service.ts";
import type { HonoEnv } from "../routes/app.ts";
import {ProjectId} from "../shared/project-id";
import {Pagination} from "../shared/pagination";
import {EntityId} from "../shared/entity-id";

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
	const projectId = ProjectId.parse(c);
	const pagination = Pagination.parse(c);

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

	const traceService = new TraceService(c.env.DB);

	const result = await traceService.listProjectTraces({
		projectId,
		page: pagination.page,
		pageSize: pagination.size,
		sort,
	});

	return c.json(result);
});

/**
 * GET /api/projects/:projectId/traces/:traceId
 * Get trace details including all associated logs
 */
tracesRouter.get("/:projectId/traces/:traceId", async (c) => {
	const traceId = EntityId.parseAsString(c, "traceId");

	const traceService = new TraceService(c.env.DB);

	const result = await traceService.getTraceDetails(traceId);

	if (!result.trace) {
		return c.json({ error: "Trace not found" }, 404);
	}

	return c.json(result);
});

export default tracesRouter;
