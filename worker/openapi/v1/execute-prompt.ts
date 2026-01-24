import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../projects/project.service";
import { PromptService } from "../../prompts/prompt.service";
import { ProviderService } from "../../services/provider.service";
import type { AIMessage, GoogleSettings, OpenAISettings, ResponseFormat } from "../../providers/base-provider";
import { CFPromptExecutionLogger } from "../../providers/logger/c-f-prompt-execution-logger";
import { ExecutePromptResponse, ErrorResponse } from "./schemas";
import { ProjectId } from "../../shared/project-id";
import { EntityId } from "../../shared/entity-id";

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
  userId: string,
  projectSlugOrId: string
) => {
  const parsedProjectId = parseInt(projectSlugOrId);
  if (!Number.isNaN(parsedProjectId)) {
    const projectId = new ProjectId(parsedProjectId, tenantId, userId);
    return projectService.getProjectById(projectId);
  }
  return projectService.getProjectBySlug(tenantId, projectSlugOrId);
};

const resolvePrompt = async (
  promptService: PromptService,
  projectId: ProjectId,
  promptSlugOrId: string
) => {
  const parsedPromptId = parseInt(promptSlugOrId);
  if (!Number.isNaN(parsedPromptId)) {
    const promptEntityId = new EntityId(parsedPromptId, projectId);
    return promptService.getPromptById(promptEntityId);
  }
  return promptService.getPromptBySlug(projectId, promptSlugOrId);
};

const resolveExecutionContext = async (params: {
  projectService: ProjectService;
  promptService: PromptService;
  tenantId: number;
  userId: string;
  projectSlugOrId: string;
  promptSlugOrId: string;
}) => {
  const { projectService, promptService, tenantId, userId, projectSlugOrId, promptSlugOrId } = params;
  const project = await resolveProject(projectService, tenantId, userId, projectSlugOrId);

  if (!project) {
    return { error: Response.json({ error: "Project not found" }, { status: 404 }) };
  }

  const projectId = new ProjectId(project.id, tenantId, userId);
  const prompt = await resolvePrompt(promptService, projectId, promptSlugOrId);

  if (!prompt) {
    return { error: Response.json({ error: "Prompt not found" }, { status: 404 }) };
  }

  if (!prompt.isActive) {
    return { error: Response.json({ error: "Prompt is not active" }, { status: 400 }) };
  }

  const promptEntityId = new EntityId(prompt.id, projectId);
  const activeVersion = await promptService.getActivePromptVersion(promptEntityId);

  if (!activeVersion) {
    return { error: Response.json({ error: "No active version found for prompt" }, { status: 404 }) };
  }

  return { project, prompt, activeVersion };
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
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              variables: z.any().optional().describe("Variables to substitute in the prompt template (key-value pairs)"),
            }),
          },
        },
      },
      headers: z.object({
        traceparent: Str({
          required: false,
          description: "W3C Trace Context traceparent header for distributed tracing (format: 00-{trace-id}-{parent-id}-{trace-flags})",
          example: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
        }).nullable(),
      }),
    },
    responses: {
      "200": {
        description: "Prompt executed successfully",
        content: {
          "application/json": {
            schema: ExecutePromptResponse,
          },
        },
      },
      "400": {
        description: "Bad request - prompt not active or no messages",
        content: {
          "application/json": {
            schema: ErrorResponse,
          },
        },
      },
      "404": {
        description: "Project, prompt, or active version not found",
        content: {
          "application/json": {
            schema: ErrorResponse,
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponse,
          },
        },
      },
    },
  };

  async handle(c: Context): Promise<Response | Record<string, unknown>> {
    const db = drizzle(c.env.DB);
    const logger = new CFPromptExecutionLogger(db, c.env.PRIVATE_FILES, c.env.NEW_LOGS);

    try {
      const user = getUserFromContext(c);
      const data = await this.getValidatedData<typeof this.schema>();
      const { projectSlugOrId, promptSlugOrId } = data.params as {
        projectSlugOrId: string;
        promptSlugOrId: string;
      };
      const body = (data.body ?? {}) as { variables?: Record<string, unknown> };

      const projectService = new ProjectService(db);
      const promptService = new PromptService(db);

      const executionContext = await resolveExecutionContext({
        projectService,
        promptService,
        tenantId: user.tenantId,
        userId: user.id,
        projectSlugOrId,
        promptSlugOrId,
      });

      if ("error" in executionContext) {
				// @ts-expect-error no type
        return executionContext.error;
      }

      const { project, prompt, activeVersion } = executionContext;

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
        return promptBodyError ?? Response.json({ error: "Invalid prompt body format" }, { status: 500 });
      }

      const messages: AIMessage[] = promptBody.messages ?? [];

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
