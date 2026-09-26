import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { HonoEnv } from "../../routes/app";
import { PromptService } from "../../prompts/prompt.service";
import { PromptVersionId } from "../../prompts/prompt-version-id";
import { EntityId } from "../../shared/entity-id";
import { ClientInputValidationError, NotFoundError } from "../../shared/errors";
import { createProviderService } from "./projects";
import { ManageResolver } from "./resolve";
import { serializePrompt, serializePromptVersion } from "./serializers";
import {
  MANAGE_TAG,
  PromptBodySchema,
  PromptSchema,
  PromptVersionSchema,
  SlugOrId,
  conflictResponse,
  errorResponses,
  jsonBody,
  jsonContent,
  manageSecurity,
  notFoundResponse,
  type PromptBody,
  type PromptDto,
} from "./schemas";

const projectParams = z.object({ project: SlugOrId });
const promptParams = z.object({ project: SlugOrId, prompt: SlugOrId });

const promptService = (c: Context<HonoEnv>): PromptService => new PromptService(drizzle(c.env.DB));

const ensureProviderAndModel = (c: Context<HonoEnv>, provider: string, model: string): void => {
  const providers = createProviderService(c).getProviders();
  const match = providers.find((item) => item.id === provider);
  if (!match) {
    throw new ClientInputValidationError(
      `Unknown provider "${provider}". Use one of: ${providers.map((item) => item.id).join(", ")}`
    );
  }
  if (!match.models.some((item) => item.id === model)) {
    throw new ClientInputValidationError(`Unknown model "${model}" for provider "${provider}". See GET /api/v1/manage/providers`);
  }
};

const storedBody = (provider: string, model: string, body: PromptBody | Record<string, unknown>): string =>
  JSON.stringify({ ...body, provider, model });

const parseStoredBody = (value: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const promptResponse = async (c: Context<HonoEnv>, promptId: EntityId<number>): Promise<PromptDto> => {
  const service = promptService(c);
  const prompt = await service.getPromptById(promptId);
  if (!prompt) {
    throw new NotFoundError("Prompt not found");
  }
  return serializePrompt(prompt, await service.getActiveRouterVersion(promptId));
};

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .refine((value) => !/^\d+$/.test(value), "A slug cannot be only digits")
  .describe("Lowercase letters, digits and dashes, for example `ticket-classifier`");

export class ManageListPrompts extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "List prompts in a project",
    security: manageSecurity,
    request: { params: projectParams },
    responses: {
      "200": jsonContent(z.object({ prompts: z.array(PromptSchema) }), "Active prompts"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const { projectId } = await new ManageResolver(c).project(params.project);
    const service = promptService(c);
    const [prompts, activeVersions] = await Promise.all([
      service.listPrompts(projectId),
      service.getActiveRouterVersions(projectId),
    ]);
    return c.json({
      prompts: prompts.map((prompt) => serializePrompt(prompt, activeVersions.get(prompt.id) ?? null)),
    });
  }
}

export class ManageCreatePrompt extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Create a prompt",
    description:
      "Creates the prompt with version 1 and makes version 1 active. A repeat with the same name or slug returns 409, so it is safe to retry.",
    security: manageSecurity,
    request: {
      params: projectParams,
      body: jsonBody(
        z.object({
          name: z.string().trim().min(1).max(200),
          slug: slugSchema,
          provider: z.string().describe("A provider id from GET /providers"),
          model: z.string().describe("A model id of that provider"),
          body: PromptBodySchema,
        })
      ),
    },
    responses: {
      "201": jsonContent(z.object({ prompt: PromptSchema, version: PromptVersionSchema }), "The new prompt and its version 1"),
      ...errorResponses,
      ...notFoundResponse,
      ...conflictResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const { projectId } = await new ManageResolver(c).project(params.project);
    ensureProviderAndModel(c, body.provider, body.model);

    const service = promptService(c);
    const prompt = await service.createPrompt(projectId, {
      name: body.name,
      slug: body.slug,
      provider: body.provider,
      model: body.model,
      body: storedBody(body.provider, body.model, body.body),
    });
    const promptId = new EntityId(prompt.id, projectId);
    const version = await service.getPromptVersion(new PromptVersionId(1, promptId));

    return c.json({ prompt: await promptResponse(c, promptId), version: serializePromptVersion(version!) }, 201);
  }
}

export class ManageGetPrompt extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Get a prompt",
    description: "Returns the prompt, its latest version number, and the active version that /execute runs.",
    security: manageSecurity,
    request: { params: promptParams },
    responses: {
      "200": jsonContent(z.object({ prompt: PromptSchema }), "The prompt"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { promptId } = await resolver.prompt(projectId, params.prompt);
    return c.json({ prompt: await promptResponse(c, promptId) });
  }
}

export class ManageListPromptVersions extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "List prompt versions",
    description: "Newest first. Use this before retrying POST .../versions after a lost response.",
    security: manageSecurity,
    request: { params: promptParams },
    responses: {
      "200": jsonContent(z.object({ versions: z.array(PromptVersionSchema) }), "All versions"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { promptId } = await resolver.prompt(projectId, params.prompt);
    const versions = await promptService(c).listPromptVersions(promptId);
    return c.json({ versions: versions.map(serializePromptVersion) });
  }
}

export class ManageCreatePromptVersion extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Add a prompt version",
    description: [
      "Creates the next version. Fields you leave out are copied from the latest version.",
      "The new version is NOT active unless `activate` is true, so production callers of /execute keep the current version.",
      "NOT safe to retry blindly: a repeat creates one more version. After a timeout, list the versions first and retry only if yours is missing.",
    ].join(" "),
    security: manageSecurity,
    request: {
      params: promptParams,
      body: jsonBody(
        z.object({
          name: z.string().trim().min(1).max(200).optional(),
          provider: z.string().optional(),
          model: z.string().optional(),
          body: PromptBodySchema.optional(),
          activate: z.boolean().default(false).describe("Make this version the one /execute runs. Default false."),
        })
      ),
    },
    responses: {
      "201": jsonContent(z.object({ prompt: PromptSchema, version: PromptVersionSchema }), "The prompt and the new version"),
      ...errorResponses,
      ...notFoundResponse,
      ...conflictResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { prompt, promptId } = await resolver.prompt(projectId, params.prompt);

    const provider = body.provider ?? prompt.provider;
    const model = body.model ?? prompt.model;
    ensureProviderAndModel(c, provider, model);

    const service = promptService(c);
    const { version } = await service.updatePrompt(
      promptId,
      {
        name: body.name,
        provider,
        model,
        body: storedBody(provider, model, body.body ?? parseStoredBody(prompt.body)),
      },
      { activate: body.activate }
    );
    const created = await service.getPromptVersion(new PromptVersionId(version, promptId));

    return c.json({ prompt: await promptResponse(c, promptId), version: serializePromptVersion(created!) }, 201);
  }
}

export class ManageSetActiveVersion extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Set the active version",
    description: "Changes the version that production callers of /execute receive. Safe to repeat.",
    security: manageSecurity,
    request: {
      params: promptParams,
      body: jsonBody(z.object({ version: z.number().int().min(1) })),
    },
    responses: {
      "200": jsonContent(z.object({ prompt: PromptSchema }), "The prompt with its new active version"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { promptId } = await resolver.prompt(projectId, params.prompt);
    await promptService(c).setRouterVersion(promptId, body.version);
    return c.json({ prompt: await promptResponse(c, promptId) });
  }
}
