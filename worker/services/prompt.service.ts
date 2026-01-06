import { DrizzleD1Database } from "drizzle-orm/d1";
import { type Prompt, type PromptVersion } from "../db/schema";
import { PromptRepository } from "../repositories/prompt.repository";

export interface CreatePromptInput {
  tenantId: number;
  projectId: number;
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

  /**
   * Create a new prompt with version 1 and initial router
   */
  async createPrompt(input: CreatePromptInput): Promise<Prompt> {
    const version = 1;

    // Create the main prompt record
    const prompt = await this.repository.createPrompt({
      tenantId: input.tenantId,
      projectId: input.projectId,
      name: input.name,
      slug: input.slug,
      provider: input.provider,
      model: input.model,
      body: input.body,
      latestVersion: version,
      isActive: true,
    });

    // Create the first version record
    await this.repository.createPromptVersion({
      promptId: prompt.id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      version: version,
      name: input.name,
      provider: input.provider,
      model: input.model,
      body: input.body,
      slug: input.slug,
    });

    // Create the initial router entry pointing to version 1
    await this.repository.createPromptRouter({
      promptId: prompt.id,
      tenantId: input.tenantId,
      projectId: input.projectId,
      version: version,
    });

    return prompt;
  }

  /**
   * Update a prompt - creates a new version and updates router
   */
  async updatePrompt(
    tenantId: number,
    projectId: number,
    promptId: number,
    input: UpdatePromptInput
  ): Promise<{ count: number }> {
    // Get the current prompt to access current values and latest version
    const currentPrompt = await this.repository.findPromptById(
      tenantId,
      projectId,
      promptId
    );

    if (!currentPrompt) {
      throw new Error("Prompt not found");
    }

    const newVersion = currentPrompt.latestVersion + 1;

    // Update the main prompt record
    await this.repository.updatePrompt(tenantId, projectId, promptId, {
      name: input.name ?? currentPrompt.name,
      provider: input.provider ?? currentPrompt.provider,
      model: input.model ?? currentPrompt.model,
      body: input.body ?? currentPrompt.body,
      latestVersion: newVersion,
    });

    // Create a new version record with updated values
    await this.repository.createPromptVersion({
      promptId: promptId,
      tenantId: tenantId,
      projectId: projectId,
      version: newVersion,
      name: input.name ?? currentPrompt.name,
      provider: input.provider ?? currentPrompt.provider,
      model: input.model ?? currentPrompt.model,
      body: input.body ?? currentPrompt.body,
      slug: currentPrompt.slug,
    });

    // Update or create the prompt router to point to the new version
    const existingRouter = await this.repository.findPromptRouter(
      tenantId,
      projectId,
      promptId
    );

    if (existingRouter) {
      // Update existing router to new version
      await this.repository.updatePromptRouterVersion(
        tenantId,
        projectId,
        existingRouter.id,
        newVersion
      );
    } else {
      // Create new router entry
      await this.repository.createPromptRouter({
        promptId: promptId,
        tenantId: tenantId,
        projectId: projectId,
        version: newVersion,
      });
    }

    return { count: 1 };
  }

  /**
   * Get a prompt by ID with its latest version data
   */
  async getPromptById(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<(Prompt & { currentVersion: PromptVersion | null }) | null> {
    const prompt = await this.repository.findPromptById(
      tenantId,
      projectId,
      promptId
    );

    if (!prompt) {
      return null;
    }

    // Get the latest version
    const latestVersion = await this.repository.findPromptVersion(
      tenantId,
      projectId,
      prompt.id,
      prompt.latestVersion
    );

    return {
      ...prompt,
      currentVersion: latestVersion ?? null,
    };
  }

  /**
   * Get a specific version of a prompt
   */
  async getPromptVersion(
    tenantId: number,
    projectId: number,
    promptId: number,
    version: number
  ): Promise<PromptVersion | undefined> {
    return await this.repository.findPromptVersion(
      tenantId,
      projectId,
      promptId,
      version
    );
  }

  async getPromptVersionById(
    tenantId: number,
    projectId: number,
    versionId: number
  ): Promise<PromptVersion | undefined> {
    return await this.repository.findPromptVersionById(
      tenantId,
      projectId,
      versionId
    );
  }

  /**
   * List all versions of a prompt
   */
  async listPromptVersions(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<PromptVersion[]> {
    return await this.repository.findPromptVersions(
      tenantId,
      projectId,
      promptId
    );
  }

  /**
   * List all prompts for a project (active only by default)
   */
  async listPrompts(tenantId: number, projectId: number): Promise<Prompt[]> {
    return await this.repository.findPrompts(tenantId, projectId, true);
  }

  /**
   * Deactivate a prompt (soft delete)
   */
  async deactivatePrompt(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<void> {
    await this.repository.deactivatePrompt(tenantId, projectId, promptId);
  }

  /**
   * Get a prompt by slug
   */
  async getPromptBySlug(
    tenantId: number,
    projectId: number,
    slug: string
  ): Promise<Prompt | undefined> {
    return await this.repository.findPromptBySlug(tenantId, projectId, slug);
  }

  /**
   * Get the active version for a prompt from the router
   */
  async getActivePromptVersion(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<PromptVersion | null> {
    // Get the router to find which version is active
    const router = await this.repository.findPromptRouter(
      tenantId,
      projectId,
      promptId
    );

    if (!router) {
      return null;
    }

    // Get the version specified by the router
    const version = await this.repository.findPromptVersion(
      tenantId,
      projectId,
      promptId,
      router.version
    );

    return version ?? null;
  }

  /**
   * Get the active router version number for a prompt
   */
  async getActiveRouterVersion(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<number | null> {
    const router = await this.repository.findPromptRouter(
      tenantId,
      projectId,
      promptId
    );

    return router?.version ?? null;
  }

  /**
   * Set the active router version for a prompt
   */
  async setRouterVersion(
    tenantId: number,
    projectId: number,
    promptId: number,
    version: number
  ): Promise<void> {
    // First check if the version exists
    const versionExists = await this.repository.findPromptVersion(
      tenantId,
      projectId,
      promptId,
      version
    );

    if (!versionExists) {
      throw new Error("Version not found");
    }

    // Check if router exists
    const existingRouter = await this.repository.findPromptRouter(
      tenantId,
      projectId,
      promptId
    );

    if (existingRouter) {
      // Update existing router
      await this.repository.updatePromptRouterVersion(
        tenantId,
        projectId,
        existingRouter.id,
        version
      );
    } else {
      // Create new router entry
      await this.repository.createPromptRouter({
        promptId,
        tenantId,
        projectId,
        version,
      });
    }
  }

  /**
   * Copy a prompt - creates a new prompt with the same configuration as the original
   * Automatically generates a unique name and slug by appending " Copy" or " Copy N"
   */
  async copyPrompt(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<Prompt> {
    // Get the source prompt
    const sourcePrompt = await this.repository.findPromptById(
      tenantId,
      projectId,
      promptId
    );

    if (!sourcePrompt) {
      throw new Error("Source prompt not found");
    }

    // Generate a unique name and slug
    let newName = `${sourcePrompt.name} Copy`;
    let newSlug = `${sourcePrompt.slug}-copy`;
    let copyNumber = 1;

    // Keep trying until we find a unique name/slug combination
    while (true) {
      const existingPrompt = await this.repository.findPromptBySlug(
        tenantId,
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

    // Create the new prompt with the same configuration
    const newPrompt = await this.repository.createPrompt({
      tenantId: tenantId,
      projectId: projectId,
      name: newName,
      slug: newSlug,
      provider: sourcePrompt.provider,
      model: sourcePrompt.model,
      body: sourcePrompt.body,
      latestVersion: 1,
      isActive: true,
    });

    // Create the first version for the new prompt
    await this.repository.createPromptVersion({
      promptId: newPrompt.id,
      tenantId: tenantId,
      projectId: projectId,
      version: 1,
      name: newName,
      provider: sourcePrompt.provider,
      model: sourcePrompt.model,
      body: sourcePrompt.body,
      slug: newSlug,
    });

    // Create the initial router entry pointing to version 1
    await this.repository.createPromptRouter({
      promptId: newPrompt.id,
      tenantId: tenantId,
      projectId: projectId,
      version: 1,
    });

    return newPrompt;
  }

  /**
   * Generate a slug from a name
   * Converts to lowercase and replaces non-alphanumeric characters with hyphens
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .split(/[^a-z0-9]/)
      .filter(Boolean)
      .join("-");
  }

  /**
   * Rename a prompt - updates the name and auto-generates slug from the name
   * Validates that the new slug is unique within the project
   */
  async renamePrompt(params: {
    tenantId: number;
    projectId: number;
    promptId: number;
    name: string;
    slug: string;
  }): Promise<Prompt> {
    // Check if prompt exists
    const existingPrompt = await this.repository.findPromptById(
      params.tenantId,
      params.projectId,
      params.promptId
    );

    if (!existingPrompt) {
      throw new Error("Prompt not found");
    }

    // Generate slug from name (ignore the provided slug)
    const generatedSlug = this.generateSlug(params.name);

    // Check if new slug is already in use by another prompt
    const slugConflict = await this.repository.findPromptBySlug(
      params.tenantId,
      params.projectId,
      generatedSlug
    );

    if (slugConflict && slugConflict.id !== params.promptId) {
      throw new Error("Slug already in use");
    }

    // Update the prompt with the generated slug
    await this.repository.renamePrompt({
      ...params,
      slug: generatedSlug,
    });

    // Return the updated prompt
    const updatedPrompt = await this.repository.findPromptById(
      params.tenantId,
      params.projectId,
      params.promptId
    );

    if (!updatedPrompt) {
      throw new Error("Failed to retrieve updated prompt");
    }

    return updatedPrompt;
  }
}
