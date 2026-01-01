import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../services/prompt.service";
import { requireAuth } from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import type { HonoEnv } from "./app";

const prompts = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
prompts.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/prompts
 * List all prompts for a project
 */
prompts.get("/:projectId/prompts", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    const prompts = await promptService.listPrompts(user.tenantId, projectId);

    return c.json({ prompts });
  } catch (error) {
    console.error("Error listing prompts:", error);
    return c.json({ error: "Failed to list prompts" }, 500);
  }
});

/**
 * POST /api/projects/:projectId/prompts
 * Create a new prompt (creates version 1)
 */
prompts.post("/:projectId/prompts", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

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

    const prompt = await promptService.createPrompt({
      tenantId: user.tenantId,
      projectId,
      name,
      slug,
      provider,
      model,
      body: promptBody || "{}",
    });

    return c.json({ prompt }, 201);
  } catch (error) {
    console.error("Error creating prompt:", error);
    return c.json({ error: "Failed to create prompt" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/prompts/:promptId
 * Get a prompt with its latest version
 */
prompts.get("/:projectId/prompts/:promptId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));

    if (isNaN(projectId) || isNaN(promptId)) {
      return c.json({ error: "Invalid project or prompt ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    const prompt = await promptService.getPromptById(
      user.tenantId,
      projectId,
      promptId
    );

    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404);
    }

    return c.json({ prompt });
  } catch (error) {
    console.error("Error getting prompt:", error);
    return c.json({ error: "Failed to get prompt" }, 500);
  }
});

/**
 * PUT /api/projects/:projectId/prompts/:promptId
 * Update a prompt (creates a new version)
 */
prompts.put("/:projectId/prompts/:promptId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));

    if (isNaN(projectId) || isNaN(promptId)) {
      return c.json({ error: "Invalid project or prompt ID" }, 400);
    }

    const body = await c.req.json();
    const { name, provider, model, body: promptBody } = body;

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    await promptService.updatePrompt(user.tenantId, projectId, promptId, {
      name,
      provider,
      model,
      body: promptBody,
    });

    // Return the updated prompt with latest version
    const updatedPrompt = await promptService.getPromptById(
      user.tenantId,
      projectId,
      promptId
    );

    return c.json({ prompt: updatedPrompt });
  } catch (error) {
    console.error("Error updating prompt:", error);
    return c.json({ error: "Failed to update prompt" }, 500);
  }
});

/**
 * DELETE /api/projects/:projectId/prompts/:promptId
 * Deactivate a prompt
 */
prompts.delete("/:projectId/prompts/:promptId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));

    if (isNaN(projectId) || isNaN(promptId)) {
      return c.json({ error: "Invalid project or prompt ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    // Check if prompt exists and belongs to user's tenant
    const existingPrompt = await promptService.getPromptById(
      user.tenantId,
      projectId,
      promptId
    );

    if (!existingPrompt) {
      return c.json({ error: "Prompt not found" }, 404);
    }

    await promptService.deactivatePrompt(user.tenantId, projectId, promptId);

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deactivating prompt:", error);
    return c.json({ error: "Failed to deactivate prompt" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/prompts/:promptId/versions
 * List all versions of a prompt
 */
prompts.get("/:projectId/prompts/:promptId/versions", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));

    if (isNaN(projectId) || isNaN(promptId)) {
      return c.json({ error: "Invalid project or prompt ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    const versions = await promptService.listPromptVersions(
      user.tenantId,
      projectId,
      promptId
    );

    return c.json({ versions });
  } catch (error) {
    console.error("Error listing prompt versions:", error);
    return c.json({ error: "Failed to list prompt versions" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/prompts/:promptId/versions/:version
 * Get a specific version of a prompt
 */
prompts.get("/:projectId/prompts/:promptId/versions/:version", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));
    const version = parseInt(c.req.param("version"));

    if (isNaN(projectId) || isNaN(promptId) || isNaN(version)) {
      return c.json({ error: "Invalid project, prompt, or version ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    const promptVersion = await promptService.getPromptVersion(
      user.tenantId,
      projectId,
      promptId,
      version
    );

    if (!promptVersion) {
      return c.json({ error: "Prompt version not found" }, 404);
    }

    return c.json({ version: promptVersion });
  } catch (error) {
    console.error("Error getting prompt version:", error);
    return c.json({ error: "Failed to get prompt version" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/prompts/:promptId/router
 * Get the active router version for a prompt
 */
prompts.get("/:projectId/prompts/:promptId/router", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));

    if (isNaN(projectId) || isNaN(promptId)) {
      return c.json({ error: "Invalid project or prompt ID" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    const routerVersion = await promptService.getActiveRouterVersion(
      user.tenantId,
      projectId,
      promptId
    );

    return c.json({ routerVersion });
  } catch (error) {
    console.error("Error getting router version:", error);
    return c.json({ error: "Failed to get router version" }, 500);
  }
});

/**
 * PUT /api/projects/:projectId/prompts/:promptId/router
 * Set the active router version for a prompt
 */
prompts.put("/:projectId/prompts/:promptId/router", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const promptId = parseInt(c.req.param("promptId"));

    if (isNaN(projectId) || isNaN(promptId)) {
      return c.json({ error: "Invalid project or prompt ID" }, 400);
    }

    const body = await c.req.json();
    const { version } = body;

    if (typeof version !== "number" || version < 1) {
      return c.json({ error: "Valid version number is required" }, 400);
    }

    const db = drizzle(c.env.DB);
    const promptService = new PromptService(db);

    // Verify prompt exists and belongs to user's tenant
    const existingPrompt = await promptService.getPromptById(
      user.tenantId,
      projectId,
      promptId
    );

    if (!existingPrompt) {
      return c.json({ error: "Prompt not found" }, 404);
    }

    await promptService.setRouterVersion(
      user.tenantId,
      projectId,
      promptId,
      version
    );

    return c.json({ success: true, routerVersion: version });
  } catch (error) {
    console.error("Error setting router version:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to set router version";
    return c.json({ error: errorMessage }, 500);
  }
});

export default prompts;
