import { Hono } from "hono";
import type { HonoEnv } from "./app";
import { requireApiKey } from "../middleware/apikey.middleware";
import { getUserFromContext } from "../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../services/project.service";
import { PromptService } from "../services/prompt.service";
import { ProviderService } from "../services/provider.service";
import type { AIMessage } from "../providers/base-provider";

import {CFPromptExecutionLogger} from "../providers/logger/c-f-prompt-execution-logger";

const v1 = new Hono<HonoEnv>();

// Apply API key authentication to all routes
v1.use("/*", requireApiKey);

// GET /api/v1/whoami - Returns user information when authenticated with API key
v1.get("/whoami", async (c) => {
  return c.json({
    ok: true,
  });
});

// POST /api/v1/projects/{projectSlugOrId}/prompts/{promptSlugOrId}/execute
// Execute a prompt with variable substitution
v1.post("/projects/:projectSlugOrId/prompts/:promptSlugOrId/execute", async (c) => {
  const db = drizzle(c.env.DB);
  const logger = new CFPromptExecutionLogger(db, c.env.PRIVATE_FILES, c.env.NEW_LOGS);

  try {
    const user = getUserFromContext(c);
    const { projectSlugOrId, promptSlugOrId } = c.req.param();
    const body = await c.req.json();

    const projectService = new ProjectService(db);
    const promptService = new PromptService(db);

    // Find project by slug or ID
    let project;
    const parsedProjectId = parseInt(projectSlugOrId);
    if (!isNaN(parsedProjectId)) {
      project = await projectService.getProjectById(user.tenantId, parsedProjectId);
    } else {
      project = await projectService.getProjectBySlug(user.tenantId, projectSlugOrId);
    }

    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Find prompt by slug or ID
    let prompt;
    const parsedPromptId = parseInt(promptSlugOrId);
    if (!isNaN(parsedPromptId)) {
      prompt = await promptService.getPromptById(user.tenantId, project.id, parsedPromptId);
    } else {
      prompt = await promptService.getPromptBySlug(user.tenantId, project.id, promptSlugOrId);
    }

    if (!prompt) {
      return c.json({ error: "Prompt not found" }, 404);
    }

    // Check if prompt is active
    if (!prompt.isActive) {
      return c.json({ error: "Prompt is not active" }, 400);
    }

    // Get the active version from the router
    const activeVersion = await promptService.getActivePromptVersion(
      user.tenantId,
      project.id,
      prompt.id
    );

    if (!activeVersion) {
      return c.json({ error: "No active version found for prompt" }, 404);
    }

    // Extract traceparent header for distributed tracing
    const traceparent = c.req.header("traceparent");

    // Set logging context now that we have all required information
    logger.setContext({
      tenantId: user.tenantId,
      projectId: project.id,
      promptId: prompt.id,
      version: activeVersion.version,
      rawTraceId: traceparent,
    });

    // Parse the body (which contains messages and other config)
    let promptBody;
    try {
      promptBody = JSON.parse(activeVersion.body);
    } catch (error) {
      return c.json({ error: "Invalid prompt body format" }, 500);
    }

    const messages: AIMessage[] = promptBody.messages || [];

    if (messages.length === 0) {
      return c.json({ error: "No messages found in prompt body" }, 400);
    }

    // Initialize provider service with logger
    const providerService = new ProviderService({
      openAIKey: c.env.OPEN_AI_API_KEY,
      geminiKey: c.env.GEMINI_API_KEY,
    }, logger);

    // Execute the prompt with variables (provider service handles variable substitution)
    // Note: Logging is now handled inside the provider's execute method
    const result = await providerService.executePrompt(activeVersion.provider, {
      model: activeVersion.model,
      messages,
      variables: body.variables,
      response_format: promptBody.response_format,
      openai_settings: promptBody.openai_settings,
    });

    // If there's a JSON schema, try to parse the response
    if (promptBody.response_format?.type === "json_schema" ||
        promptBody.response_format?.type === "json") {
      try {
        const jsonResponse = JSON.parse(result.content);
        const response = {
          response: jsonResponse,
        };
        await logger.logResponse({ output: response });
        // Defer logging operations to improve response latency
        // Only use waitUntil if execution context is available (not in tests)
        try {
          c.executionCtx.waitUntil(
            (async () => {
              await logger.finish();
            })()
          );
        } catch {
          // In test environment, execute synchronously
          await logger.finish();
        }
        return c.json(response);
      } catch (error) {
        // If parsing fails, return as text
        const response = {
          response: result.content,
        };
        await logger.logResponse({ output: response });
        // Defer logging operations to improve response latency
        // Only use waitUntil if execution context is available (not in tests)
        try {
          c.executionCtx.waitUntil(
            (async () => {
              await logger.finish();
            })()
          );
        } catch {
          // In test environment, execute synchronously
          await logger.finish();
        }
        return c.json(response);
      }
    }

    // Return text response
    const response = {
      response: result.content
    };
    await logger.logResponse({ output: response });
    // Defer logging operations to improve response latency
    // Only use waitUntil if execution context is available (not in tests)
    try {
      c.executionCtx.waitUntil(
        (async () => {
          await logger.finish();
        })()
      );
    } catch {
      // In test environment, execute synchronously
      await logger.finish();
    }
    return c.json(response);

  } catch (error) {
    console.error("Error executing prompt:", error);

    // Defer logging operations even on error
    // Only use waitUntil if execution context is available (not in tests)
    try {
      c.executionCtx.waitUntil(
        (async () => {
          await logger.finish();
        })()
      );
    } catch {
      // In test environment, execute synchronously
      await logger.finish();
    }

    // Note: Error logging is now handled inside the provider's execute method

    return c.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      500
    );
  }
});

export default v1;
