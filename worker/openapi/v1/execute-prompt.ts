import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../services/project.service";
import { PromptService } from "../../services/prompt.service";
import { ProviderService } from "../../services/provider.service";
import type { AIMessage } from "../../providers/base-provider";
import { CFPromptExecutionLogger } from "../../providers/logger/c-f-prompt-execution-logger";
import { ExecutePromptResponse, ErrorResponse } from "./schemas";

export class V1ExecutePrompt extends OpenAPIRoute {
  schema = {
    tags: ["v1"],
    summary: "Execute Prompt",
    description: "Execute a prompt with variable substitution and get AI-generated response. Supports W3C Trace Context via traceparent header for distributed tracing.",
    security: [{ apiKey: [] }],
    request: {
      params: z.object({
        projectSlugOrId: Str({
          example: "my-project",
          description: "Project slug or numeric ID",
        }),
        promptSlugOrId: Str({
          example: "my-prompt",
          description: "Prompt slug or numeric ID",
        }),
      }) as any,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              variables: z.any().optional().describe("Variables to substitute in the prompt template (key-value pairs)"),
            }) as any,
          },
        },
      },
      headers: z.object({
        traceparent: Str({
          required: false,
          description: "W3C Trace Context traceparent header for distributed tracing (format: 00-{trace-id}-{parent-id}-{trace-flags})",
          example: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        }).nullable(),
      }) as any,
    },
    responses: {
      "200": {
        description: "Prompt executed successfully",
        content: {
          "application/json": {
            schema: ExecutePromptResponse as any,
          },
        },
      },
      "400": {
        description: "Bad request - prompt not active or no messages",
        content: {
          "application/json": {
            schema: ErrorResponse as any,
          },
        },
      },
      "404": {
        description: "Project, prompt, or active version not found",
        content: {
          "application/json": {
            schema: ErrorResponse as any,
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponse as any,
          },
        },
      },
    },
  };

  async handle(c: Context) {
    const db = drizzle(c.env.DB);
    const logger = new CFPromptExecutionLogger(db, c.env.PRIVATE_FILES, c.env.NEW_LOGS);

    try {
      const user = getUserFromContext(c);
      const data = await this.getValidatedData<typeof this.schema>();
      const { projectSlugOrId, promptSlugOrId } = data.params as any;
      const body = (data.body || {}) as any;

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
        return Response.json({ error: "Project not found" }, { status: 404 });
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
        return Response.json({ error: "Prompt not found" }, { status: 404 });
      }

      // Check if prompt is active
      if (!prompt.isActive) {
        return Response.json({ error: "Prompt is not active" }, { status: 400 });
      }

      // Get the active version from the router
      const activeVersion = await promptService.getActivePromptVersion(
        user.tenantId,
        project.id,
        prompt.id
      );

      if (!activeVersion) {
        return Response.json({ error: "No active version found for prompt" }, { status: 404 });
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
        return Response.json({ error: "Invalid prompt body format" }, { status: 500 });
      }

      const messages: AIMessage[] = promptBody.messages || [];

      if (messages.length === 0) {
        return Response.json({ error: "No messages found in prompt body" }, { status: 400 });
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
        google_settings: promptBody.google_settings,
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
          return response;
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
          return response;
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
      return response;

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

      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  }
}
