import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../services/project.service";
import { requireAuth } from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import type { HonoEnv } from "./app";

const projects = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
projects.use("/*", requireAuth);

/**
 * GET /api/projects
 * List all projects for the authenticated user's tenant
 */
projects.get("/", async (c) => {
  try {
    const user = getUserFromContext(c);

    const db = drizzle(c.env.DB);
    const projectService = new ProjectService(db);

    const projects = await projectService.listProjects(user.tenantId);

    return c.json({ projects });
  } catch (error) {
    console.error("Error listing projects:", error);
    return c.json({ error: "Failed to list projects" }, 500);
  }
});

/**
 * POST /api/projects
 * Create a new project for the authenticated user's tenant
 */
projects.post("/", async (c) => {
  try {
    const user = getUserFromContext(c);

    const body = await c.req.json();
    const { name, slug } = body;

    if (!name || !slug) {
      return c.json({ error: "Name and slug are required" }, 400);
    }

    const db = drizzle(c.env.DB);
    const projectService = new ProjectService(db);

    const project = await projectService.createProject({
      name,
      slug,
      tenantId: user.tenantId,
    });

    return c.json({ project }, 201);
  } catch (error) {
    console.error("Error creating project:", error);
    return c.json({ error: "Failed to create project" }, 500);
  }
});

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
projects.get("/:id", async (c) => {
  try {
    const user = getUserFromContext(c);
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const projectService = new ProjectService(db);

    const project = await projectService.getProjectById(user.tenantId, id);

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    return c.json({ project });
  } catch (error) {
    console.error("Error getting project:", error);
    return c.json({ error: "Failed to get project" }, 500);
  }
});

/**
 * DELETE /api/projects/:id
 * Deactivate a project
 */
projects.delete("/:id", async (c) => {
  try {
    const user = getUserFromContext(c);
    const id = parseInt(c.req.param("id"));

    if (isNaN(id)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const projectService = new ProjectService(db);

    // Check if project exists and belongs to user's tenant
    const existingProject = await projectService.getProjectById(user.tenantId, id);

    if (!existingProject) {
      return c.json({ error: "Project not found" }, 404);
    }

    await projectService.deactivateProject(user.tenantId, id);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deactivating project:", error);
    return c.json({ error: "Failed to deactivate project" }, 500);
  }
});

export default projects;
