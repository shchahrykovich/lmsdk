import {Hono} from "hono";
import {drizzle} from "drizzle-orm/d1";
import {ProjectService} from "./project.service.ts";
import {requireAuth} from "../middleware/auth.middleware.ts";
import {getUserFromContext} from "../middleware/auth.ts";
import type {HonoEnv} from "../routes/app.ts";
import {ProjectId} from "../shared/project-id";

const projects = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
projects.use("/*", requireAuth);

/**
 * GET /api/projects
 * List all projects for the authenticated user's tenant
 */
projects.get("/", async (c) => {
	const user = getUserFromContext(c);

	const db = drizzle(c.env.DB);
	const projectService = new ProjectService(db);

	const projects = await projectService.listProjects(user.tenantId);

	return c.json({projects});
});

/**
 * POST /api/projects
 * Create a new project for the authenticated user's tenant
 */
projects.post("/", async (c) => {
	const user = getUserFromContext(c);

	const body = await c.req.json();
	const {name, slug} = body;

	if (!name || !slug) {
		return c.json({error: "Name and slug are required"}, 400);
	}

	const db = drizzle(c.env.DB);
	const projectService = new ProjectService(db);

	const project = await projectService.createProject({
		name,
		slug,
		tenantId: user.tenantId,
	});

	return c.json({project}, 201);
});

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
projects.get("/:id", async (c) => {
	const projectId = ProjectId.parse(c, "id");

	const db = drizzle(c.env.DB);
	const projectService = new ProjectService(db);

	const project = await projectService.getProjectById(projectId);

	if (!project) {
		return c.json({error: "Project not found"}, 404);
	}

	return c.json({project});
});

/**
 * DELETE /api/projects/:id
 * Deactivate a project
 */
projects.delete("/:id", async (c) => {
	const projectId = ProjectId.parse(c, "id");

	const db = drizzle(c.env.DB);
	const projectService = new ProjectService(db);

	// Check if project exists and belongs to user's tenant
	const existingProject = await projectService.getProjectById(projectId);

	if (!existingProject) {
		return c.json({error: "Project not found"}, 404);
	}

	await projectService.deactivateProject(projectId);

	return c.json({success: true});
});

export default projects;
