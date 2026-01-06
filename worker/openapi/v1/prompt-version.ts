import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../services/project.service";
import { PromptService } from "../../services/prompt.service";
import { ErrorResponse, PromptVersionResponse } from "./schemas";

export class V1PromptVersion extends OpenAPIRoute {
  schema = {
    tags: ["v1"],
    summary: "Get prompt version",
    description: "Fetch a specific prompt version with body, name, slug, and createdAt",
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
        versionId: Str({
          example: "3",
          description: "Prompt version number",
        }),
      }),
    },
    responses: {
      "200": {
        description: "Prompt version",
        content: {
          "application/json": {
            schema: PromptVersionResponse,
          },
        },
      },
      "400": {
        description: "Invalid version",
        content: {
          "application/json": {
            schema: ErrorResponse,
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
      const { projectSlugOrId, promptSlugOrId, versionId } = data.params as {
        projectSlugOrId: string;
        promptSlugOrId: string;
        versionId: string;
      };

      const parsedVersion = parseInt(versionId);
      if (isNaN(parsedVersion)) {
        return Response.json({ error: "Invalid version ID" }, { status: 400 });
      }

      const projectService = new ProjectService(db);
      const promptService = new PromptService(db);

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

      if (!prompt.isActive) {
        return Response.json({ error: "Prompt is not active" }, { status: 400 });
      }

      const promptVersion = await promptService.getPromptVersion(
        user.tenantId,
        project.id,
        prompt.id,
        parsedVersion
      );

      if (!promptVersion) {
        return Response.json({ error: "Prompt version not found" }, { status: 404 });
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(promptVersion.body);
      } catch {
        return Response.json({ error: "Invalid prompt body format" }, { status: 500 });
      }

      return {
        version: promptVersion.version,
        name: promptVersion.name,
        slug: promptVersion.slug,
        body: parsedBody,
        createdAt: promptVersion.createdAt.toISOString(),
      };
    } catch (error) {
      console.error("Error getting prompt version:", error);
      return Response.json(
        { error: "Failed to get prompt version" },
        { status: 500 }
      );
    }
  }
}
