import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../services/project.service";
import { PromptService } from "../../services/prompt.service";
import { ProviderService } from "../../services/provider.service";
import type { AIMessage, GoogleSettings, OpenAISettings, ResponseFormat } from "../../providers/base-provider";
import { CFPromptExecutionLogger } from "../../providers/logger/c-f-prompt-execution-logger";
import { ExecutePromptResponse, ErrorResponse } from "./schemas";

type PromptBody = {
  messages?: AIMessage[];
  response_format?: ResponseFormat;
  openai_settings?: OpenAISettings;
  google_settings?: GoogleSettings;
  proxy?: "none" | "cloudflare";
};

const parsePromptBody = (rawBody: string): { body?: PromptBody; error?: Response } => {
  try {
    return { body: JSON.parse(rawBody) as PromptBody };
  } catch {
    return {
      error: Response.json({ error: "Invalid prompt body format" }, { status: 500 }),
    };
  }
};

const finalizeLogger = async (c: Context, logger: CFPromptExecutionLogger): Promise<void> => {
  const finishPromise = logger.finish();
  try {
    c.executionCtx.waitUntil(finishPromise);
  } catch {
    await finishPromise;
  }
};

const respondWithResult = async (
  c: Context,
  logger: CFPromptExecutionLogger,
  result: { content: string },
  responseFormat?: PromptBody["response_format"]
): Promise<Record<string, unknown>> => {
  const shouldParseJson =
    responseFormat?.type === "json_schema" || responseFormat?.type === "json";
  let response: Record<string, unknown>;

  if (shouldParseJson) {
    try {
      response = { response: JSON.parse(result.content) };
    } catch {
      response = { response: result.content };
    }
  } else {
    response = { response: result.content };
  }

  await logger.logResponse({ output: response });
  await finalizeLogger(c, logger);
  return response;
};

const resolveProject = async (
  projectService: ProjectService,
  tenantId: number,
  projectSlugOrId: string
) => {
  const parsedProjectId = parseInt(projectSlugOrId);
  if (!Number.isNaN(parsedProjectId)) {
    return projectService.getProjectById(tenantId, parsedProjectId);
  }
  return projectService.getProjectBySlug(tenantId, projectSlugOrId);
};

const resolvePrompt = async (
  promptService: PromptService,
  tenantId: number,
  projectId: number,
  promptSlugOrId: string
) => {
  const parsedPromptId = parseInt(promptSlugOrId);
  if (!Number.isNaN(parsedPromptId)) {
    return promptService.getPromptById(tenantId, projectId, parsedPromptId);
  }
  return promptService.getPromptBySlug(tenantId, projectId, promptSlugOrId);
};

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

      const project = await resolveProject(projectService, user.tenantId, projectSlugOrId);

      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }

      const prompt = await resolvePrompt(
        promptService,
        user.tenantId,
        project.id,
        promptSlugOrId
      );

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

      const { body: promptBody, error: promptBodyError } = parsePromptBody(activeVersion.body);
      if (promptBodyError || !promptBody) {
        return promptBodyError || Response.json({ error: "Invalid prompt body format" }, { status: 500 });
      }

      const messages: AIMessage[] = promptBody.messages || [];

      if (messages.length === 0) {
        return Response.json({ error: "No messages found in prompt body" }, { status: 400 });
      }

      // Initialize provider service with logger
      const providerService = new ProviderService({
        openAIKey: c.env.OPEN_AI_API_KEY,
        geminiKey: c.env.GEMINI_API_KEY,
        cloudflareAiGatewayToken: c.env.CLOUDFLARE_AI_GATEWAY_TOKEN,
        cloudflareAiGatewayBaseUrl: c.env.CLOUDFLARE_AI_GATEWAY_BASE_URL,
      }, logger, c.env.CACHE);

      // Execute the prompt with variables (provider service handles variable substitution)
      // Note: Logging is now handled inside the provider's execute method
      const result = await providerService.executePrompt(activeVersion.provider, {
        model: activeVersion.model,
        messages,
        variables: body.variables,
        response_format: promptBody.response_format,
        openai_settings: promptBody.openai_settings,
        google_settings: promptBody.google_settings,
        proxy: promptBody.proxy,
        projectId: activeVersion.projectId,
        promptSlug: activeVersion.slug,
      });

      return await respondWithResult(c, logger, result, promptBody.response_format);
    } catch (error) {
      console.error("Error executing prompt:", error);

      await finalizeLogger(c, logger);

      // Note: Error logging is now handled inside the provider's execute method

      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  }
}
