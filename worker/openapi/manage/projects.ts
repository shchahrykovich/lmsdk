import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { HonoEnv } from "../../routes/app";
import { getUserFromContext } from "../../middleware/auth";
import { ProjectService } from "../../projects/project.service";
import { NullPromptExecutionLogger } from "../../providers/logger/null-prompt-execution-logger";
import { ProviderService } from "../../services/provider.service";
import { providerConfigFromEnv } from "../../providers/provider-factory";
import { ManageResolver } from "./resolve";
import { serializeProject } from "./serializers";
import {
  MANAGE_TAG,
  ProjectSchema,
  SlugOrId,
  conflictResponse,
  errorResponses,
  jsonBody,
  jsonContent,
  manageSecurity,
  notFoundResponse,
} from "./schemas";

export class ManageListProviders extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "List providers and models",
    description: "Use these provider ids and model ids when you create a prompt or a version.",
    security: manageSecurity,
    responses: {
      "200": jsonContent(
        z.object({
          providers: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              models: z.array(z.object({ id: z.string(), name: z.string() })),
            })
          ),
        }),
        "Providers with their models"
      ),
      ...errorResponses,
    },
  };

  handle(c: Context<HonoEnv>): Response {
    const providers = createProviderService(c).getProviders();
    return c.json({
      providers: providers.map((provider) => ({ id: provider.id, name: provider.name, models: provider.models })),
    });
  }
}

export class ManageListProjects extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "List projects",
    security: manageSecurity,
    responses: {
      "200": jsonContent(z.object({ projects: z.array(ProjectSchema) }), "Active projects of the key owner's tenant"),
      ...errorResponses,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const user = getUserFromContext(c);
    const projects = await new ProjectService(drizzle(c.env.DB)).listProjects(user.tenantId);
    return c.json({ projects: projects.filter((project) => project.isActive).map(serializeProject) });
  }
}

export class ManageCreateProject extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Create a project",
    description: "A repeat with the same name or slug returns 409, so it is safe to retry.",
    security: manageSecurity,
    request: {
      body: jsonBody(
        z.object({
          name: z.string().trim().min(1).max(200),
          slug: z
            .string()
            .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
            .refine((value) => !/^\d+$/.test(value), "A slug cannot be only digits")
            .describe("Lowercase letters, digits and dashes, for example `support-bot`"),
        })
      ),
    },
    responses: {
      "201": jsonContent(z.object({ project: ProjectSchema }), "The new project"),
      ...errorResponses,
      ...conflictResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const user = getUserFromContext(c);
    const { body } = await this.getValidatedData<typeof this.schema>();
    const project = await new ProjectService(drizzle(c.env.DB)).createProject({
      name: body.name,
      slug: body.slug,
      tenantId: user.tenantId,
    });
    return c.json({ project: serializeProject(project) }, 201);
  }
}

export class ManageGetProject extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Get a project",
    security: manageSecurity,
    request: { params: z.object({ project: SlugOrId }) },
    responses: {
      "200": jsonContent(z.object({ project: ProjectSchema }), "The project"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const { project } = await new ManageResolver(c).project(params.project);
    return c.json({ project: serializeProject(project) });
  }
}

export function createProviderService(c: Context<HonoEnv>): ProviderService {
  return new ProviderService(
    providerConfigFromEnv(c.env),
    new NullPromptExecutionLogger(),
    c.env.CACHE
  );
}
