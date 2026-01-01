import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/services/project.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Project } from "../../../../worker/db/schema";

describe("ProjectService - getProjectBySlug", () => {
  let projectService: ProjectService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    projectService = new ProjectService(db);
  });

  it("should return project when slug and tenantId match", async () => {
    await projectService.createProject({
      name: "Test Project",
      slug: "test-project",
      tenantId: 1,
    });

    const project = await projectService.getProjectBySlug(1, "test-project");

    expect(project).toBeDefined();
    expect(project?.slug).toBe("test-project");
    expect(project?.name).toBe("Test Project");
    expect(project?.tenantId).toBe(1);

    // Verify using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Projects WHERE slug = ? AND tenantId = ?"
    ).bind("test-project", 1).first<Project>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.slug).toBe("test-project");
  });

  it("should return undefined when slug does not exist", async () => {
    const project = await projectService.getProjectBySlug(1, "non-existent");

    expect(project).toBeUndefined();
  });

  it("should return undefined when slug exists but tenantId does not match (cross-tenant protection)", async () => {
    // Create project for tenant 1
    await projectService.createProject({
      name: "Tenant 1 Project",
      slug: "shared-slug",
      tenantId: 1,
    });

    // Try to access with tenant 2
    const project = await projectService.getProjectBySlug(2, "shared-slug");

    expect(project).toBeUndefined();

    // Verify project exists in database but was correctly filtered
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Projects WHERE slug = ?"
    ).bind("shared-slug").first<Project>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.tenantId).toBe(1);

    // Verify the service correctly filtered by tenantId
    const correctResult = await projectService.getProjectBySlug(1, "shared-slug");
    expect(correctResult).toBeDefined();
    expect(correctResult?.slug).toBe("shared-slug");
  });

  it("should handle same slug across different tenants correctly", async () => {
    // Create projects with same slug for different tenants
    await projectService.createProject({
      name: "Tenant 1 Project",
      slug: "same-slug",
      tenantId: 1,
    });

    await projectService.createProject({
      name: "Tenant 2 Project",
      slug: "same-slug",
      tenantId: 2,
    });

    await projectService.createProject({
      name: "Tenant 3 Project",
      slug: "same-slug",
      tenantId: 3,
    });

    // Each tenant should get their own project
    const tenant1Project = await projectService.getProjectBySlug(1, "same-slug");
    const tenant2Project = await projectService.getProjectBySlug(2, "same-slug");
    const tenant3Project = await projectService.getProjectBySlug(3, "same-slug");

    expect(tenant1Project?.tenantId).toBe(1);
    expect(tenant1Project?.name).toBe("Tenant 1 Project");

    expect(tenant2Project?.tenantId).toBe(2);
    expect(tenant2Project?.name).toBe("Tenant 2 Project");

    expect(tenant3Project?.tenantId).toBe(3);
    expect(tenant3Project?.name).toBe("Tenant 3 Project");

    // Verify using direct SQL that all three projects exist
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects WHERE slug = ?"
    ).bind("same-slug").first<{ count: number }>();

    expect(countResult?.count).toBe(3);

    // Verify each has correct tenantId
    const allSameSlugs = await env.DB.prepare(
      "SELECT * FROM Projects WHERE slug = ? ORDER BY tenantId"
    ).bind("same-slug").all<Project>();

    expect(allSameSlugs.results).toHaveLength(3);
    expect(allSameSlugs.results[0].tenantId).toBe(1);
    expect(allSameSlugs.results[1].tenantId).toBe(2);
    expect(allSameSlugs.results[2].tenantId).toBe(3);
  });
});
