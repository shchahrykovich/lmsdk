import { DrizzleD1Database } from "drizzle-orm/d1";
import { type Prompt, type PromptVersion } from "../db/schema.ts";
import { PromptRepository } from "./prompt.repository.ts";
import { ProjectId } from "../shared/project-id.ts";
import { EntityId } from "../shared/entity-id.ts";
import { PromptVersionId } from "./prompt-version-id.ts";

export interface CreatePromptInput {
  name: string;
  slug: string;
  provider: string;
  model: string;
  body: string;
}

export interface UpdatePromptInput {
  name?: string;
  provider?: string;
  model?: string;
  body?: string;
}

export class PromptService {
  private repository: PromptRepository;

  constructor(db: DrizzleD1Database) {
    this.repository = new PromptRepository(db);
  }

  async createPrompt(
    projectId: ProjectId,
    input: CreatePromptInput
  ): Promise<Prompt> {
    const version = 1;

    const prompt = await this.repository.createPrompt({
      tenantId: projectId.tenantId,
      projectId: projectId.id,
      name: input.name,
      slug: input.slug,
      provider: input.provider,
      model: input.model,
      body: input.body,
      latestVersion: version,
      isActive: true,
    });

    await this.repository.createPromptVersion({
      promptId: prompt.id,
      tenantId: projectId.tenantId,
      projectId: projectId.id,
      version: version,
      name: input.name,
      provider: input.provider,
      model: input.model,
      body: input.body,
      slug: input.slug,
    });

    await this.repository.createPromptRouter({
      promptId: prompt.id,
      tenantId: projectId.tenantId,
      projectId: projectId.id,
      version: version,
    });

    return prompt;
  }

  async updatePrompt(
    promptId: EntityId<number>,
    input: UpdatePromptInput
  ): Promise<{ count: number }> {
    const currentPrompt = await this.repository.findPromptById(promptId);

    if (!currentPrompt) {
      throw new Error("Prompt not found");
    }

    const newVersion = currentPrompt.latestVersion + 1;

    await this.repository.updatePrompt(promptId, {
      name: input.name ?? currentPrompt.name,
      provider: input.provider ?? currentPrompt.provider,
      model: input.model ?? currentPrompt.model,
      body: input.body ?? currentPrompt.body,
      latestVersion: newVersion,
    });

    await this.repository.createPromptVersion({
      promptId: promptId.id,
      tenantId: promptId.tenantId,
      projectId: promptId.projectId,
      version: newVersion,
      name: input.name ?? currentPrompt.name,
      provider: input.provider ?? currentPrompt.provider,
      model: input.model ?? currentPrompt.model,
      body: input.body ?? currentPrompt.body,
      slug: currentPrompt.slug,
    });

    const existingRouter = await this.repository.findPromptRouter(promptId);

    if (existingRouter) {
      await this.repository.updatePromptRouterVersion(
        promptId,
        existingRouter.id,
        newVersion
      );
    } else {
      await this.repository.createPromptRouter({
        promptId: promptId.id,
        tenantId: promptId.tenantId,
        projectId: promptId.projectId,
        version: newVersion,
      });
    }

    return { count: 1 };
  }

  async getPromptById(
    promptId: EntityId<number>
  ): Promise<(Prompt & { currentVersion: PromptVersion | null }) | null> {
    const prompt = await this.repository.findPromptById(promptId);

    if (!prompt) {
      return null;
    }

    const latestVersion = await this.repository.findPromptVersion(
      promptId,
      prompt.latestVersion
    );

    return {
      ...prompt,
      currentVersion: latestVersion ?? null,
    };
  }

  async getPromptVersion(
    versionId: PromptVersionId
  ): Promise<PromptVersion | undefined> {
    return await this.repository.findPromptVersion(versionId);
  }

  async getPromptVersionById(
    projectId: ProjectId,
    versionId: number
  ): Promise<PromptVersion | undefined> {
    return await this.repository.findPromptVersionById(projectId, versionId);
  }

  async listPromptVersions(
    promptId: EntityId<number>
  ): Promise<PromptVersion[]> {
    return await this.repository.findPromptVersions(promptId);
  }

  async listPrompts(projectId: ProjectId): Promise<Prompt[]> {
    return await this.repository.findPrompts(projectId, true);
  }

  async deactivatePrompt(promptId: EntityId<number>): Promise<void> {
    await this.repository.deactivatePrompt(promptId);
  }

  async getPromptBySlug(
    projectId: ProjectId,
    slug: string
  ): Promise<Prompt | undefined> {
    return await this.repository.findPromptBySlug(projectId, slug);
  }

  async getActivePromptVersion(
    promptId: EntityId<number>
  ): Promise<PromptVersion | null> {
    const router = await this.repository.findPromptRouter(promptId);

    if (!router) {
      return null;
    }

    const version = await this.repository.findPromptVersion(promptId, router.version);
    return version ?? null;
  }

  async getActiveRouterVersion(
    promptId: EntityId<number>
  ): Promise<number | null> {
    const router = await this.repository.findPromptRouter(promptId);
    return router?.version ?? null;
  }

  async setRouterVersion(
    promptId: EntityId<number>,
    version: number
  ): Promise<void> {
    const versionExists = await this.repository.findPromptVersion(
      promptId,
      version
    );

    if (!versionExists) {
      throw new Error("Version not found");
    }

    const existingRouter = await this.repository.findPromptRouter(promptId);

    if (existingRouter) {
      await this.repository.updatePromptRouterVersion(
        promptId,
        existingRouter.id,
        version
      );
    } else {
      await this.repository.createPromptRouter({
        promptId: promptId.id,
        tenantId: promptId.tenantId,
        projectId: promptId.projectId,
        version,
      });
    }
  }

  async copyPrompt(promptId: EntityId<number>): Promise<Prompt> {
    const sourcePrompt = await this.repository.findPromptById(promptId);

    if (!sourcePrompt) {
      throw new Error("Source prompt not found");
    }

    const projectId = promptId.getProjectId();
    let newName = `${sourcePrompt.name} Copy`;
    let newSlug = `${sourcePrompt.slug}-copy`;
    let copyNumber = 1;

    while (true) {
      const existingPrompt = await this.repository.findPromptBySlug(
        projectId,
        newSlug
      );

      if (!existingPrompt) {
        break;
      }

      copyNumber++;
      newName = `${sourcePrompt.name} Copy ${copyNumber}`;
      newSlug = `${sourcePrompt.slug}-copy-${copyNumber}`;
    }

    const newPrompt = await this.repository.createPrompt({
      tenantId: promptId.tenantId,
      projectId: promptId.projectId,
      name: newName,
      slug: newSlug,
      provider: sourcePrompt.provider,
      model: sourcePrompt.model,
      body: sourcePrompt.body,
      latestVersion: 1,
      isActive: true,
    });

    await this.repository.createPromptVersion({
      promptId: newPrompt.id,
      tenantId: promptId.tenantId,
      projectId: promptId.projectId,
      version: 1,
      name: newName,
      provider: sourcePrompt.provider,
      model: sourcePrompt.model,
      body: sourcePrompt.body,
      slug: newSlug,
    });

    await this.repository.createPromptRouter({
      promptId: newPrompt.id,
      tenantId: promptId.tenantId,
      projectId: promptId.projectId,
      version: 1,
    });

    return newPrompt;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .split(/[^a-z0-9]/)
      .filter(Boolean)
      .join("-");
  }

  async renamePrompt(promptId: EntityId<number>, name: string): Promise<Prompt> {
    const existingPrompt = await this.repository.findPromptById(promptId);

    if (!existingPrompt) {
      throw new Error("Prompt not found");
    }

    const generatedSlug = this.generateSlug(name);
    const projectId = promptId.getProjectId();

    const slugConflict = await this.repository.findPromptBySlug(
      projectId,
      generatedSlug
    );

    if (slugConflict && slugConflict.id !== promptId.id) {
      throw new Error("Slug already in use");
    }

    await this.repository.renamePrompt(promptId, name, generatedSlug);

    const updatedPrompt = await this.repository.findPromptById(promptId);

    if (!updatedPrompt) {
      throw new Error("Failed to retrieve updated prompt");
    }

    return updatedPrompt;
  }
}
