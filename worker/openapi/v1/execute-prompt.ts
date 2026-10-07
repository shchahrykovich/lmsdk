import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../projects/project.service";
import { PromptService } from "../../prompts/prompt.service";
import { ProviderService } from "../../services/provider.service";
import { providerConfigFromEnv } from "../../providers/provider-factory";
import type { ResponseFormat } from "../../providers/base-provider";
import { CFPromptExecutionLogger } from "../../providers/logger/c-f-prompt-execution-logger";
import { ProviderTimeoutError } from "../../providers/provider-timeout-error";
import { ExecutePromptResponse, ErrorResponse } from "./schemas";
import { ProjectId } from "../../shared/project-id";
import { EntityId } from "../../shared/entity-id";
import { PromptVersionId } from "../../prompts/prompt-version-id";
import type { ExecuteResult } from "../../providers/base-provider";
import { parsePromptBody } from "../../execution/prompt-body";
import { buildExecuteRequest } from "../../execution/prompt-renderer";
import { parseResponseContent } from "../../execution/response-content";


const finalizeLogger = async (c: Context, logger: CFPromptExecutionLogger): Promise<void> => {
  const finishPromise = logger.finish();
  try {
    c.executionCtx.waitUntil(finishPromise);
  } catch {
    await finishPromise;
  }
};

const respondWithResult = async (params: {
  c: Context;
  logger: CFPromptExecutionLogger;
  result: ExecuteResult;
  responseFormat?: ResponseFormat;
  version: { provider: string; version: number };
}): Promise<Record<string, unknown>> => {
  const { c, logger, result, responseFormat, version } = params;
  const response = { response: parseResponseContent(result.content, responseFormat) };

  await logger.logResponse({ output: response });
  const logId = await logger.waitForLogId();
  await finalizeLogger(c, logger);

  return {
    ...response,
    usage: result.usage,
    model: result.model,
    provider: version.provider,
    version: version.version,
    logId: logId ?? null,
  };
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
  requestedVersion?: number;
}) => {
  const { projectService, promptService, tenantId, userId, projectSlugOrId, promptSlugOrId, requestedVersion } = params;
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

  if (requestedVersion !== undefined) {
    const version = await promptService.getPromptVersion(new PromptVersionId(requestedVersion, promptEntityId));
    if (!version) {
      return { error: Response.json({ error: `Prompt version ${requestedVersion} not found` }, { status: 404 }) };
    }
    return { project, prompt, activeVersion: version };
  }

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
              version: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Prompt version to run. When left out, the active version runs."),
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
      "504": {
        description: "The AI provider did not answer within the time limit (240 s for OpenRouter, 60 s for OpenRouter Decisions). The body has code \"provider_timeout\". The provider may still bill the call, so do not retry it automatically.",
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
    const data = await this.getValidatedData<typeof this.schema>();

    try {
      const user = getUserFromContext(c);
      const { projectSlugOrId, promptSlugOrId } = data.params as {
        projectSlugOrId: string;
        promptSlugOrId: string;
      };
      const body = (data.body ?? {}) as { variables?: Record<string, unknown>; version?: number };

      const projectService = new ProjectService(db);
      const promptService = new PromptService(db);

      const executionContext = await resolveExecutionContext({
        projectService,
        promptService,
        tenantId: user.tenantId,
        userId: user.id,
        projectSlugOrId,
        promptSlugOrId,
        requestedVersion: body.version,
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

      const promptBody = parsePromptBody(activeVersion.body);
      if (!promptBody) {
        return Response.json({ error: "Invalid prompt body format" }, { status: 500 });
      }

      if (promptBody.messages.length === 0) {
        return Response.json({ error: "No messages found in prompt body" }, { status: 400 });
      }

      // Initialize provider service with logger
      const providerService = new ProviderService(providerConfigFromEnv(c.env), logger, c.env.CACHE);

      // Execute the prompt with variables (provider service handles variable substitution)
      // Note: Logging is now handled inside the provider's execute method
      const result = await providerService.executePrompt(
        activeVersion.provider,
        buildExecuteRequest(activeVersion, promptBody, body.variables)
      );

      return await respondWithResult({
        c,
        logger,
        result,
        responseFormat: promptBody.response_format,
        version: activeVersion,
      });
    } catch (error) {
      console.error("Error executing prompt:", error);

      await finalizeLogger(c, logger);

      // Note: Error logging is now handled inside the provider's execute method

      if (error instanceof ProviderTimeoutError) {
        return Response.json({ error: error.message, code: error.code }, { status: 504 });
      }

      return Response.json(
        { error: error instanceof Error ? error.message : "Internal server error" },
        { status: 500 }
      );
    }
  }
}
