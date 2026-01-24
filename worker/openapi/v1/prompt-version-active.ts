import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../projects/project.service";
import { PromptService } from "../../prompts/prompt.service";
import { ErrorResponse, PromptVersionResponse } from "./schemas";
import { ProjectId } from "../../shared/project-id";
import { EntityId } from "../../shared/entity-id";

export class V1PromptVersionActive extends OpenAPIRoute {
  schema = {
    tags: ["v1"],
    summary: "Get active prompt version",
    description: "Fetch the active prompt version from the router with body, name, slug, and createdAt",
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
    },
    responses: {
      "200": {
        description: "Active prompt version",
        content: {
          "application/json": {
            schema: PromptVersionResponse,
          },
        },
      },
      "404": {
        description: "Project, prompt, or version not found",
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

  async handle(
    c: Context,
  ): Promise<
    | Response
    | {
        version: number;
        name: string;
        slug: string;
        body: unknown;
        createdAt: string;
      }
  > {
    const db = drizzle(c.env.DB);

    try {
      const user = getUserFromContext(c);
      const data = await this.getValidatedData<typeof this.schema>();
      const { projectSlugOrId, promptSlugOrId } = data.params as {
        projectSlugOrId: string;
        promptSlugOrId: string;
      };

      const projectService = new ProjectService(db);
      const promptService = new PromptService(db);

      let project;
      const parsedProjectId = parseInt(projectSlugOrId);
      if (!isNaN(parsedProjectId)) {
        const projectIdObj = new ProjectId(parsedProjectId, user.tenantId, user.id);
        project = await projectService.getProjectById(projectIdObj);
      } else {
        project = await projectService.getProjectBySlug(user.tenantId, projectSlugOrId);
      }

      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }

      const projectId = new ProjectId(project.id, user.tenantId, user.id);

      let prompt;
      const parsedPromptId = parseInt(promptSlugOrId);
      if (!isNaN(parsedPromptId)) {
        const promptEntityId = new EntityId(parsedPromptId, projectId);
        prompt = await promptService.getPromptById(promptEntityId);
      } else {
        prompt = await promptService.getPromptBySlug(projectId, promptSlugOrId);
      }

      if (!prompt) {
        return Response.json({ error: "Prompt not found" }, { status: 404 });
      }

      if (!prompt.isActive) {
        return Response.json({ error: "Prompt is not active" }, { status: 400 });
      }

      const promptEntityId = new EntityId(prompt.id, projectId);
      const activeVersion = await promptService.getActivePromptVersion(promptEntityId);

      if (!activeVersion) {
        return Response.json({ error: "Prompt version not found" }, { status: 404 });
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(activeVersion.body);
      } catch {
        return Response.json({ error: "Invalid prompt body format" }, { status: 500 });
      }

      return {
        version: activeVersion.version,
        name: activeVersion.name,
        slug: activeVersion.slug,
        body: parsedBody,
        createdAt: activeVersion.createdAt.toISOString(),
      };
    } catch (error) {
      console.error("Error getting active prompt version:", error);
      return Response.json(
        { error: "Failed to get prompt version" },
        { status: 500 }
      );
    }
  }
}
