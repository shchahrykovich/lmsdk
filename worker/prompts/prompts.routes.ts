import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "./prompt.service.ts";
import { requireAuth } from "../middleware/auth.middleware.ts";
import type { HonoEnv } from "../routes/app.ts";
import { ProjectId } from "../shared/project-id.ts";
import { EntityId } from "../shared/entity-id.ts";
import { PromptVersionId } from "./prompt-version-id.ts";

const prompts = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
prompts.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/prompts
 * List all prompts for a project
 */
prompts.get("/:projectId/prompts", async (c) => {
  const projectId = ProjectId.parse(c);
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);
  const prompts = await promptService.listPrompts(projectId);
  return c.json({ prompts });
});

/**
 * POST /api/projects/:projectId/prompts
 * Create a new prompt (creates version 1)
 */
prompts.post("/:projectId/prompts", async (c) => {
  const projectId = ProjectId.parse(c);
  const body = await c.req.json();
  const { name, slug, provider, model, body: promptBody } = body;

  if (!name || !slug || !provider || !model) {
    return c.json(
      { error: "Name, slug, provider, and model are required" },
      400
    );
  }

  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const prompt = await promptService.createPrompt(projectId, {
    name,
    slug,
    provider,
    model,
    body: promptBody ?? "{}",
  });

  return c.json({ prompt }, 201);
});

/**
 * GET /api/projects/:projectId/prompts/:promptId
 * Get a prompt with its latest version
 */
prompts.get("/:projectId/prompts/:promptId", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const prompt = await promptService.getPromptById(promptId);

  if (!prompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  return c.json({ prompt });
});

/**
 * PUT /api/projects/:projectId/prompts/:promptId
 * Update a prompt (creates a new version)
 */
prompts.put("/:projectId/prompts/:promptId", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const body = await c.req.json();
  const { name, provider, model, body: promptBody } = body;

  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  await promptService.updatePrompt(promptId, {
    name,
    provider,
    model,
    body: promptBody,
  });

  const updatedPrompt = await promptService.getPromptById(promptId);
  return c.json({ prompt: updatedPrompt });
});

/**
 * DELETE /api/projects/:projectId/prompts/:promptId
 * Deactivate a prompt
 */
prompts.delete("/:projectId/prompts/:promptId", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const existingPrompt = await promptService.getPromptById(promptId);

  if (!existingPrompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  await promptService.deactivatePrompt(promptId);
  return c.json({ success: true });
});

/**
 * GET /api/projects/:projectId/prompts/:promptId/versions
 * List all versions of a prompt
 */
prompts.get("/:projectId/prompts/:promptId/versions", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);
  const versions = await promptService.listPromptVersions(promptId);
  return c.json({ versions });
});

/**
 * GET /api/projects/:projectId/prompts/:promptId/versions/:version
 * Get a specific version of a prompt
 */
prompts.get("/:projectId/prompts/:promptId/versions/:version", async (c) => {
  const versionId = PromptVersionId.parse(c);
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const promptVersion = await promptService.getPromptVersion(versionId);

  if (!promptVersion) {
    return c.json({ error: "Prompt version not found" }, 404);
  }

  return c.json({ version: promptVersion });
});

/**
 * GET /api/projects/:projectId/prompts/:promptId/router
 * Get the active router version for a prompt
 */
prompts.get("/:projectId/prompts/:promptId/router", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);
  const routerVersion = await promptService.getActiveRouterVersion(promptId);
  return c.json({ routerVersion });
});

/**
 * PUT /api/projects/:projectId/prompts/:promptId/router
 * Set the active router version for a prompt
 */
prompts.put("/:projectId/prompts/:promptId/router", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const body = await c.req.json();
  const { version } = body;

  if (typeof version !== "number" || version < 1) {
    return c.json({ error: "Valid version number is required" }, 400);
  }

  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const existingPrompt = await promptService.getPromptById(promptId);

  if (!existingPrompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  await promptService.setRouterVersion(promptId, version);
  return c.json({ success: true, routerVersion: version });
});

/**
 * POST /api/projects/:projectId/prompts/:promptId/copy
 * Copy a prompt - automatically generates a unique name and slug
 */
prompts.post("/:projectId/prompts/:promptId/copy", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const sourcePrompt = await promptService.getPromptById(promptId);

  if (!sourcePrompt) {
    return c.json({ error: "Source prompt not found" }, 404);
  }

  const copiedPrompt = await promptService.copyPrompt(promptId);
  return c.json({ prompt: copiedPrompt }, 201);
});

/**
 * PATCH /api/projects/:projectId/prompts/:promptId/rename
 * Rename a prompt - updates name and slug
 */
prompts.patch("/:projectId/prompts/:promptId/rename", async (c) => {
  const promptId = EntityId.parse(c, "promptId");
  const body = await c.req.json();
  const { name } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const db = drizzle(c.env.DB);
  const promptService = new PromptService(db);

  const existingPrompt = await promptService.getPromptById(promptId);

  if (!existingPrompt) {
    return c.json({ error: "Prompt not found" }, 404);
  }

  const renamedPrompt = await promptService.renamePrompt(promptId, name.trim());
  return c.json({ prompt: renamedPrompt });
});

export default prompts;
