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
} from "../db/schema.ts";
import { ProjectId } from "../shared/project-id.ts";
import { EntityId } from "../shared/entity-id.ts";
import { PromptVersionId } from "./prompt-version-id.ts";

export class PromptRepository {
  private db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  async findPrompts(
    projectId: ProjectId,
    activeOnly: boolean = true
  ): Promise<Prompt[]> {
    const conditions = [
      eq(prompts.tenantId, projectId.tenantId),
      eq(prompts.projectId, projectId.id),
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

  async findPromptById(
    promptId: EntityId<number>
  ): Promise<Prompt | undefined> {
    const [prompt] = await this.db
      .select()
      .from(prompts)
      .where(promptId.toWhereClause(prompts))
      .limit(1);

    return prompt;
  }

  async findPromptBySlug(
    projectId: ProjectId,
    slug: string
  ): Promise<Prompt | undefined> {
    const [prompt] = await this.db
      .select()
      .from(prompts)
      .where(
        and(
          eq(prompts.slug, slug),
          eq(prompts.tenantId, projectId.tenantId),
          eq(prompts.projectId, projectId.id)
        )
      )
      .limit(1);

    return prompt;
  }

  async createPrompt(data: NewPrompt): Promise<Prompt> {
    const [prompt] = await this.db.insert(prompts).values(data).returning();
    return prompt;
  }

  async updatePrompt(
    promptId: EntityId<number>,
    data: Partial<Omit<Prompt, "id" | "tenantId" | "projectId" | "createdAt">>
  ): Promise<void> {
    await this.db
      .update(prompts)
      .set({ ...data, updatedAt: new Date() })
      .where(promptId.toWhereClause(prompts));
  }

  async deactivatePrompt(promptId: EntityId<number>): Promise<void> {
    await this.db
      .update(prompts)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(promptId.toWhereClause(prompts));
  }

  async renamePrompt(
    promptId: EntityId<number>,
    name: string,
    slug: string
  ): Promise<void> {
    await this.db
      .update(prompts)
      .set({
        name,
        slug,
        updatedAt: new Date(),
      })
      .where(promptId.toWhereClause(prompts));
  }

  async findPromptVersions(
    promptId: EntityId<number>
  ): Promise<PromptVersion[]> {
    return await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptId.id),
          eq(promptVersions.tenantId, promptId.tenantId),
          eq(promptVersions.projectId, promptId.projectId)
        )
      )
      .orderBy(desc(promptVersions.version));
  }

  async findPromptVersion(
    promptId: EntityId<number>,
    version: number
  ): Promise<PromptVersion | undefined>;
  async findPromptVersion(
    versionId: PromptVersionId
  ): Promise<PromptVersion | undefined>;
  async findPromptVersion(
    promptIdOrVersionId: EntityId<number> | PromptVersionId,
    version?: number
  ): Promise<PromptVersion | undefined> {
    if (promptIdOrVersionId instanceof PromptVersionId) {
      const [promptVersion] = await this.db
        .select()
        .from(promptVersions)
        .where(promptIdOrVersionId.toWhereClause(promptVersions))
        .limit(1);
      return promptVersion;
    }

    const [promptVersion] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.promptId, promptIdOrVersionId.id),
          eq(promptVersions.tenantId, promptIdOrVersionId.tenantId),
          eq(promptVersions.projectId, promptIdOrVersionId.projectId),
          eq(promptVersions.version, version!)
        )
      )
      .limit(1);

    return promptVersion;
  }

  async findPromptVersionById(
    projectId: ProjectId,
    versionId: number
  ): Promise<PromptVersion | undefined> {
    const [promptVersion] = await this.db
      .select()
      .from(promptVersions)
      .where(
        and(
          eq(promptVersions.id, versionId),
          eq(promptVersions.tenantId, projectId.tenantId),
          eq(promptVersions.projectId, projectId.id)
        )
      )
      .limit(1);
    return promptVersion;
  }

  async createPromptVersion(data: NewPromptVersion): Promise<PromptVersion> {
    const [version] = await this.db
      .insert(promptVersions)
      .values(data)
      .returning();
    return version;
  }

  async findPromptRouter(
    promptId: EntityId<number>
  ): Promise<PromptRouter | undefined> {
    const [router] = await this.db
      .select()
      .from(promptRouters)
      .where(
        and(
          eq(promptRouters.promptId, promptId.id),
          eq(promptRouters.tenantId, promptId.tenantId),
          eq(promptRouters.projectId, promptId.projectId)
        )
      )
      .limit(1);

    return router;
  }

  async createPromptRouter(data: NewPromptRouter): Promise<PromptRouter> {
    const [router] = await this.db
      .insert(promptRouters)
      .values(data)
      .returning();
    return router;
  }

  async updatePromptRouterVersion(
    promptId: EntityId<number>,
    routerId: number,
    version: number
  ): Promise<void> {
    await this.db
      .update(promptRouters)
      .set({ version, updatedAt: new Date() })
      .where(
        and(
          eq(promptRouters.id, routerId),
          eq(promptRouters.tenantId, promptId.tenantId),
          eq(promptRouters.projectId, promptId.projectId)
        )
      );
  }
}
