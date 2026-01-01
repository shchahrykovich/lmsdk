import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";
import {
  prompts,
  promptVersions,
  promptRouters,
  type Prompt,
  type PromptVersion
} from "../db/schema";

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
  private db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  /**
   * Create a new prompt with version 1 and initial router
   */
  async createPrompt(input: CreatePromptInput): Promise<Prompt> {
    const version = 1;

    // Create the main prompt record
    const [prompt] = await this.db
      .insert(prompts)
      .values({
        tenantId: input.tenantId,
        projectId: input.projectId,
        name: input.name,
        slug: input.slug,
        provider: input.provider,
        model: input.model,
        body: input.body,
        latestVersion: version,
        isActive: true,
      })
      .returning();

    // Create the first version record
    await this.db.insert(promptVersions).values({
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
    await this.db.insert(promptRouters).values({
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
  ) {
    // Get the current prompt to access current values and latest version
    const [currentPrompt] = await this.db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.id, promptId),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .limit(1);

    if (!currentPrompt) {
      throw new Error("Prompt not found");
    }

    const newVersion = currentPrompt.latestVersion + 1;

    // Update the main prompt record
    await this.db
      .update(prompts)
      .set({
        name: input.name ?? currentPrompt.name,
        provider: input.provider ?? currentPrompt.provider,
        model: input.model ?? currentPrompt.model,
        body: input.body ?? currentPrompt.body,
        latestVersion: newVersion,
      })
      .where(
        and(
          eq(prompts.id, promptId),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      );

    // Create a new version record with updated values
    await this.db.insert(promptVersions).values({
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
    // First, check if a router entry exists for this prompt
    const [existingRouter] = await this.db
      .select()
      .from(promptRouters)
      .where(
        and(
          eq(promptRouters.promptId, promptId),
          eq(promptRouters.tenantId, tenantId),
          eq(promptRouters.projectId, projectId)
        )
      )
      .limit(1);

    if (existingRouter) {
      // Update existing router to new version
      await this.db
        .update(promptRouters)
        .set({ version: newVersion })
        .where(
          and(
            eq(promptRouters.id, existingRouter.id),
            eq(promptRouters.tenantId, tenantId),
            eq(promptRouters.projectId, projectId)
          )
        );
    } else {
      // Create new router entry
      await this.db.insert(promptRouters).values({
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
    const [prompt] = await this.db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.id, promptId),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .limit(1);

    if (!prompt) {
      return null;
    }

    // Get the latest version
    const [latestVersion] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, prompt.id),
          eq(promptVersions.tenantId, tenantId),
          eq(promptVersions.projectId, projectId),
          eq(promptVersions.version, prompt.latestVersion)
        )
      )
      .limit(1);

    return {
      ...prompt,
      currentVersion: latestVersion || null,
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
    const [promptVersion] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptId),
          eq(promptVersions.tenantId, tenantId),
          eq(promptVersions.projectId, projectId),
          eq(promptVersions.version, version)
        )
      )
      .limit(1);

    return promptVersion;
  }

  /**
   * List all versions of a prompt
   */
  async listPromptVersions(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<PromptVersion[]> {
    return await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptId),
          eq(promptVersions.tenantId, tenantId),
          eq(promptVersions.projectId, projectId)
        )
      )
      .orderBy(desc(promptVersions.version));
  }

  /**
   * List all prompts for a project
   */
  async listPrompts(tenantId: number, projectId: number): Promise<Prompt[]> {
    return await this.db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .orderBy(desc(prompts.updatedAt));
  }

  /**
   * Deactivate a prompt
   */
  async deactivatePrompt(
    tenantId: number,
    projectId: number,
    promptId: number
  ) {
    return await this.db
      .update(prompts)
      .set({ isActive: false })
      .where(
        and(
          eq(prompts.id, promptId),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      );
  }

  /**
   * Get a prompt by slug
   */
  async getPromptBySlug(
    tenantId: number,
    projectId: number,
    slug: string
  ): Promise<Prompt | undefined> {
    const [prompt] = await this.db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.slug, slug),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .limit(1);

    return prompt;
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
    const [router] = await this.db
      .select()
      .from(promptRouters)
      .where(
        and(
          eq(promptRouters.promptId, promptId),
          eq(promptRouters.tenantId, tenantId),
          eq(promptRouters.projectId, projectId)
        )
      )
      .limit(1);

    if (!router) {
      return null;
    }

    // Get the version specified by the router
    const [version] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptId),
          eq(promptVersions.tenantId, tenantId),
          eq(promptVersions.projectId, projectId),
          eq(promptVersions.version, router.version)
        )
      )
      .limit(1);

    return version || null;
  }

  /**
   * Get the active router version number for a prompt
   */
  async getActiveRouterVersion(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<number | null> {
    const [router] = await this.db
      .select()
      .from(promptRouters)
      .where(
        and(
          eq(promptRouters.promptId, promptId),
          eq(promptRouters.tenantId, tenantId),
          eq(promptRouters.projectId, projectId)
        )
      )
      .limit(1);

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
    const [versionExists] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptId),
          eq(promptVersions.tenantId, tenantId),
          eq(promptVersions.projectId, projectId),
          eq(promptVersions.version, version)
        )
      )
      .limit(1);

    if (!versionExists) {
      throw new Error("Version not found");
    }

    // Check if router exists
    const [existingRouter] = await this.db
      .select()
      .from(promptRouters)
      .where(
        and(
          eq(promptRouters.promptId, promptId),
          eq(promptRouters.tenantId, tenantId),
          eq(promptRouters.projectId, projectId)
        )
      )
      .limit(1);

    if (existingRouter) {
      // Update existing router
      await this.db
        .update(promptRouters)
        .set({ version })
        .where(
          and(
            eq(promptRouters.id, existingRouter.id),
            eq(promptRouters.tenantId, tenantId),
            eq(promptRouters.projectId, projectId)
          )
        );
    } else {
      // Create new router entry
      await this.db.insert(promptRouters).values({
        promptId,
        tenantId,
        projectId,
        version,
      });
    }
  }
}
