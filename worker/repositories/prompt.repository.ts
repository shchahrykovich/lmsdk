import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";
import {
  prompts,
  promptVersions,
  promptRouters,
  type Prompt,
  type PromptVersion,
  type PromptRouter,
  type NewPrompt,
  type NewPromptVersion,
  type NewPromptRouter,
} from "../db/schema";

/**
 * Repository for prompt-related database operations
 * Handles direct interaction with D1 database using Drizzle ORM
 */
export class PromptRepository {
  private db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  // ========== Prompts Table Operations ==========

  /**
   * Find all prompts for a project
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID to filter by
   * @param activeOnly - If true, only return active prompts (default: true)
   */
  async findPrompts(
    tenantId: number,
    projectId: number,
    activeOnly: boolean = true
  ): Promise<Prompt[]> {
    const conditions = [
      eq(prompts.tenantId, tenantId),
      eq(prompts.projectId, projectId),
    ];

    if (activeOnly) {
      conditions.push(eq(prompts.isActive, true));
    }

    return await this.db
      .select()
      .from(prompts)
      .where(and(...conditions))
      .orderBy(desc(prompts.updatedAt));
  }

  /**
   * Find a prompt by ID
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param promptId - Prompt ID to find
   */
  async findPromptById(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<Prompt | undefined> {
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

    return prompt;
  }

  /**
   * Find a prompt by slug
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param slug - Prompt slug to find
   */
  async findPromptBySlug(
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
   * Create a new prompt
   * @param data - Prompt data to insert
   */
  async createPrompt(data: NewPrompt): Promise<Prompt> {
    const [prompt] = await this.db.insert(prompts).values(data).returning();
    return prompt;
  }

  /**
   * Update a prompt
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param promptId - Prompt ID to update
   * @param data - Partial prompt data to update
   */
  async updatePrompt(
    tenantId: number,
    projectId: number,
    promptId: number,
    data: Partial<Omit<Prompt, "id" | "tenantId" | "projectId" | "createdAt">>
  ): Promise<void> {
    await this.db
      .update(prompts)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(prompts.id, promptId),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      );
  }

  /**
   * Deactivate a prompt (soft delete)
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param promptId - Prompt ID to deactivate
   */
  async deactivatePrompt(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<void> {
    await this.db
      .update(prompts)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(prompts.id, promptId),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      );
  }

  /**
   * Rename a prompt
   * @param params - Object containing tenantId, projectId, promptId, name, and slug
   */
  async renamePrompt(params: {
    tenantId: number;
    projectId: number;
    promptId: number;
    name: string;
    slug: string;
  }): Promise<void> {
    await this.db
      .update(prompts)
      .set({
        name: params.name,
        slug: params.slug,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(prompts.id, params.promptId),
          eq(prompts.tenantId, params.tenantId),
          eq(prompts.projectId, params.projectId)
        )
      );
  }

  // ========== PromptVersions Table Operations ==========

  /**
   * Find all versions of a prompt
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param promptId - Prompt ID to find versions for
   */
  async findPromptVersions(
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
   * Find a specific version of a prompt
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param promptId - Prompt ID to find version for
   * @param version - Version number to find
   */
  async findPromptVersion(
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

  async findPromptVersionById(
    tenantId: number,
    projectId: number,
    versionId: number
  ): Promise<PromptVersion | undefined> {
    const [promptVersion] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.id, versionId),
          eq(promptVersions.tenantId, tenantId),
          eq(promptVersions.projectId, projectId)
        )
      )
      .limit(1);
    return promptVersion;
  }

  /**
   * Create a new prompt version
   * @param data - Prompt version data to insert
   */
  async createPromptVersion(data: NewPromptVersion): Promise<PromptVersion> {
    const [version] = await this.db
      .insert(promptVersions)
      .values(data)
      .returning();
    return version;
  }

  // ========== PromptRouters Table Operations ==========

  /**
   * Find the router for a prompt
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param promptId - Prompt ID to find router for
   */
  async findPromptRouter(
    tenantId: number,
    projectId: number,
    promptId: number
  ): Promise<PromptRouter | undefined> {
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

    return router;
  }

  /**
   * Create a new prompt router
   * @param data - Prompt router data to insert
   */
  async createPromptRouter(data: NewPromptRouter): Promise<PromptRouter> {
    const [router] = await this.db
      .insert(promptRouters)
      .values(data)
      .returning();
    return router;
  }

  /**
   * Update a prompt router version
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID for additional validation
   * @param routerId - Router ID to update
   * @param version - New version number
   */
  async updatePromptRouterVersion(
    tenantId: number,
    projectId: number,
    routerId: number,
    version: number
  ): Promise<void> {
    await this.db
      .update(promptRouters)
      .set({ version, updatedAt: new Date() })
      .where(
        and(
          eq(promptRouters.id, routerId),
          eq(promptRouters.tenantId, tenantId),
          eq(promptRouters.projectId, projectId)
        )
      );
  }
}
