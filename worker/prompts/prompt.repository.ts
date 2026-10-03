import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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

export interface NewPromptWithFirstVersion {
  tenantId: number;
  projectId: number;
  name: string;
  slug: string;
  provider: string;
  model: string;
  body: string;
}

export interface PromptVersionValues {
  name: string;
  provider: string;
  model: string;
  body: string;
}

type BatchStatements = [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]];

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

  async updatePromptName(promptId: EntityId<number>, name: string): Promise<void> {
    await this.db
      .update(prompts)
      .set({ name, updatedAt: new Date() })
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

  async findPromptRoutersByProject(projectId: ProjectId): Promise<PromptRouter[]> {
    return await this.db
      .select()
      .from(promptRouters)
      .where(and(eq(promptRouters.tenantId, projectId.tenantId), eq(promptRouters.projectId, projectId.id)));
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

  async createPromptWithFirstVersion(data: NewPromptWithFirstVersion): Promise<Prompt> {
    const promptBySlug = and(
      eq(prompts.tenantId, data.tenantId),
      eq(prompts.projectId, data.projectId),
      eq(prompts.slug, data.slug)
    );

    const [createdPrompts] = await this.db.batch([
      this.db
        .insert(prompts)
        .values({ ...data, latestVersion: 1, isActive: true })
        .returning(),
      this.db.insert(promptVersions).select(
        this.db
          .select({
            id: sql<number>`NULL`.as("id"),
            promptId: prompts.id,
            tenantId: prompts.tenantId,
            projectId: prompts.projectId,
            version: sql<number>`1`.as("version"),
            name: prompts.name,
            provider: prompts.provider,
            model: prompts.model,
            body: prompts.body,
            slug: prompts.slug,
            createdAt: sql<Date>`(unixepoch())`.as("createdAt"),
          })
          .from(prompts)
          .where(promptBySlug)
      ),
      this.db.insert(promptRouters).select(
        this.db
          .select({
            id: sql<number>`NULL`.as("id"),
            tenantId: prompts.tenantId,
            projectId: prompts.projectId,
            promptId: prompts.id,
            version: sql<number>`1`.as("version"),
            createdAt: sql<Date>`(unixepoch())`.as("createdAt"),
            updatedAt: sql<Date>`(unixepoch())`.as("updatedAt"),
          })
          .from(prompts)
          .where(promptBySlug)
      ),
    ]);

    return createdPrompts[0];
  }

  async addPromptVersion(
    promptId: EntityId<number>,
    current: Prompt,
    values: PromptVersionValues,
    activate: boolean
  ): Promise<number> {
    const newVersion = current.latestVersion + 1;

    const statements: BatchStatements = [
      this.db
        .update(prompts)
        .set({ ...values, latestVersion: newVersion, updatedAt: new Date() })
        .where(and(promptId.toWhereClause(prompts), eq(prompts.latestVersion, current.latestVersion))),
      this.db.insert(promptVersions).values({
        ...values,
        promptId: promptId.id,
        tenantId: promptId.tenantId,
        projectId: promptId.projectId,
        version: newVersion,
        slug: current.slug,
      }),
    ];

    if (activate) {
      const router = await this.findPromptRouter(promptId);
      statements.push(this.buildSetRouterStatement(promptId, router, newVersion));
    }

    await this.db.batch(statements);
    return newVersion;
  }

  private buildSetRouterStatement(
    promptId: EntityId<number>,
    router: PromptRouter | undefined,
    version: number
  ): BatchItem<"sqlite"> {
    if (router) {
      return this.db
        .update(promptRouters)
        .set({ version, updatedAt: new Date() })
        .where(
          and(
            eq(promptRouters.id, router.id),
            eq(promptRouters.tenantId, promptId.tenantId),
            eq(promptRouters.projectId, promptId.projectId)
          )
        );
    }

    return this.db.insert(promptRouters).values({
      promptId: promptId.id,
      tenantId: promptId.tenantId,
      projectId: promptId.projectId,
      version,
    });
  }
}
