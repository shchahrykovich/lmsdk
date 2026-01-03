import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { getUserFromContext } from "../../middleware/auth";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../services/project.service";
import { PromptService } from "../../services/prompt.service";
import { ErrorResponse, PromptVersionsResponse } from "./schemas";

export class V1PromptVersions extends OpenAPIRoute {
  schema = {
    tags: ["v1"],
    summary: "List prompt versions",
    description: "List all versions for a prompt, returning version number and creation date",
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
    },
    responses: {
      "200": {
        description: "Prompt versions",
        content: {
          "application/json": {
            schema: PromptVersionsResponse as any,
          },
        },
      },
      "404": {
        description: "Project or prompt not found",
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

    try {
      const user = getUserFromContext(c);
      const data = await this.getValidatedData<typeof this.schema>();
      const { projectSlugOrId, promptSlugOrId } = data.params as any;

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

      const versions = await promptService.listPromptVersions(
        user.tenantId,
        project.id,
        prompt.id
      );

      return versions.map((version) => ({
        version: version.version,
        createdAt: version.createdAt.toISOString(),
      }));
    } catch (error) {
      console.error("Error listing prompt versions:", error);
      return Response.json(
        { error: "Failed to list prompt versions" },
        { status: 500 }
      );
    }
  }
}
