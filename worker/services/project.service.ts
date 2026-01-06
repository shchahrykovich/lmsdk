import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and, desc } from "drizzle-orm";
import { projects, type Project } from "../db/schema";

export interface CreateProjectInput {
  name: string;
  slug: string;
  tenantId: number;
}

export class ProjectService {
  private db: DrizzleD1Database;

  constructor(db: DrizzleD1Database) {
    this.db = db;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const [project] = await this.db
      .insert(projects)
      .values({
        name: input.name,
        slug: input.slug,
        tenantId: input.tenantId,
        isActive: true,
      })
      .returning();

    return project;
  }

  async listProjects(tenantId: number): Promise<Project[]> {
    return await this.db
      .select()
      .from(projects)
      .where(eq(projects.tenantId, tenantId))
      .orderBy(desc(projects.updatedAt));
  }

  async getProjectById(tenantId: number, id: number): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
      .limit(1);

    return project;
  }

  async getProjectBySlug(tenantId: number, slug: string): Promise<Project | undefined> {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.slug, slug)))
      .limit(1);

    return project;
  }

  async deactivateProject(tenantId: number, id: number): Promise<unknown> {
    return await this.db
      .update(projects)
      .set({ isActive: false })
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));
  }
}
