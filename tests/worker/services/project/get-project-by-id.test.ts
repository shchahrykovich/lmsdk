import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/services/project.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Project } from "../../../../worker/db/schema";

describe("ProjectService - getProjectById", () => {
  let projectService: ProjectService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    projectService = new ProjectService(db);
  });

  it("should return project when ID and tenantId match", async () => {
    const created = await projectService.createProject({
      name: "Test Project",
      slug: "test-project",
      tenantId: 1,
    });

    const project = await projectService.getProjectById(1, created.id);

    expect(project).toBeDefined();
    expect(project?.id).toBe(created.id);
    expect(project?.name).toBe("Test Project");
    expect(project?.tenantId).toBe(1);

    // Verify using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Projects WHERE id = ? AND tenantId = ?"
    ).bind(created.id, 1).first<Project>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.id).toBe(created.id);
  });

  it("should return undefined when project does not exist", async () => {
    const project = await projectService.getProjectById(1, 99999);

    expect(project).toBeUndefined();
  });

  it("should return undefined when project exists but tenantId does not match (cross-tenant protection)", async () => {
    // Create project for tenant 1
    const created = await projectService.createProject({
      name: "Tenant 1 Project",
      slug: "t1-project",
      tenantId: 1,
    });

    // Try to access with tenant 2
    const project = await projectService.getProjectById(2, created.id);

    expect(project).toBeUndefined();

    // Verify project exists in database but was correctly filtered
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Projects WHERE id = ?"
    ).bind(created.id).first<Project>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.tenantId).toBe(1);

    // Verify the service correctly filtered by tenantId
    const correctResult = await projectService.getProjectById(1, created.id);
    expect(correctResult).toBeDefined();
    expect(correctResult?.id).toBe(created.id);
  });

  it("should enforce strict tenant isolation across multiple scenarios", async () => {
    // Create projects for different tenants with sequential IDs
    const tenant1Project = await projectService.createProject({
      name: "Tenant 1 Project",
      slug: "t1-project",
      tenantId: 1,
    });

    const tenant2Project = await projectService.createProject({
      name: "Tenant 2 Project",
      slug: "t2-project",
      tenantId: 2,
    });

    const tenant3Project = await projectService.createProject({
      name: "Tenant 3 Project",
      slug: "t3-project",
      tenantId: 3,
    });

    // Each tenant can only access their own projects
    expect(await projectService.getProjectById(1, tenant1Project.id)).toBeDefined();
    expect(await projectService.getProjectById(1, tenant2Project.id)).toBeUndefined();
    expect(await projectService.getProjectById(1, tenant3Project.id)).toBeUndefined();

    expect(await projectService.getProjectById(2, tenant1Project.id)).toBeUndefined();
    expect(await projectService.getProjectById(2, tenant2Project.id)).toBeDefined();
    expect(await projectService.getProjectById(2, tenant3Project.id)).toBeUndefined();

    expect(await projectService.getProjectById(3, tenant1Project.id)).toBeUndefined();
    expect(await projectService.getProjectById(3, tenant2Project.id)).toBeUndefined();
    expect(await projectService.getProjectById(3, tenant3Project.id)).toBeDefined();

    // Verify using direct SQL that all projects exist
    const allProjects = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects"
    ).first<{ count: number }>();

    expect(allProjects?.count).toBe(3);
  });
});
