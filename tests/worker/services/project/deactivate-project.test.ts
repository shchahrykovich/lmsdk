import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/services/project.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Project } from "../../../../worker/db/schema";

describe("ProjectService - deactivateProject", () => {
  let projectService: ProjectService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    projectService = new ProjectService(db);
  });

  it("should deactivate project when ID and tenantId match", async () => {
    const created = await projectService.createProject({
      name: "Test Project",
      slug: "test-project",
      tenantId: 1,
    });

    expect(created.isActive).toBe(true);

    await projectService.deactivateProject(1, created.id);

    // Verify using service method
    const project = await projectService.getProjectById(1, created.id);
    expect(project?.isActive).toBe(false);

    // Verify using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT isActive FROM Projects WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbResult?.isActive).toBe(0); // SQLite stores false as 0
  });

  it("should not deactivate project when tenantId does not match (cross-tenant protection)", async () => {
    // Create project for tenant 1
    const created = await projectService.createProject({
      name: "Tenant 1 Project",
      slug: "t1-project",
      tenantId: 1,
    });

    expect(created.isActive).toBe(true);

    // Try to deactivate with tenant 2 (should fail silently)
    await projectService.deactivateProject(2, created.id);

    // Verify project is still active using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT isActive FROM Projects WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbResult?.isActive).toBe(1); // Still active (1 = true in SQLite)

    // Verify via service that project is still active
    const project = await projectService.getProjectById(1, created.id);
    expect(project?.isActive).toBe(true);
  });

  it("should not affect other tenants' projects when deactivating", async () => {
    // Create projects for multiple tenants
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

    const tenant1Project2 = await projectService.createProject({
      name: "Tenant 1 Project 2",
      slug: "t1-project-2",
      tenantId: 1,
    });

    // Deactivate tenant 1's first project
    await projectService.deactivateProject(1, tenant1Project.id);

    // Verify only the specific project was deactivated
    const result1 = await env.DB.prepare(
      "SELECT isActive FROM Projects WHERE id = ?"
    ).bind(tenant1Project.id).first<{ isActive: number }>();
    expect(result1?.isActive).toBe(0);

    const result2 = await env.DB.prepare(
      "SELECT isActive FROM Projects WHERE id = ?"
    ).bind(tenant2Project.id).first<{ isActive: number }>();
    expect(result2?.isActive).toBe(1);

    const result3 = await env.DB.prepare(
      "SELECT isActive FROM Projects WHERE id = ?"
    ).bind(tenant1Project2.id).first<{ isActive: number }>();
    expect(result3?.isActive).toBe(1);

    // Count active projects per tenant
    const tenant1Active = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects WHERE tenantId = ? AND isActive = 1"
    ).bind(1).first<{ count: number }>();
    expect(tenant1Active?.count).toBe(1);

    const tenant2Active = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects WHERE tenantId = ? AND isActive = 1"
    ).bind(2).first<{ count: number }>();
    expect(tenant2Active?.count).toBe(1);
  });

  it("should handle deactivating non-existent project gracefully", async () => {
    // Should not throw error when project doesn't exist
    await expect(
      projectService.deactivateProject(1, 99999)
    ).resolves.not.toThrow();

    // Verify no projects were affected
    const allProjects = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects WHERE isActive = 0"
    ).first<{ count: number }>();

    expect(allProjects?.count).toBe(0);
  });

  it("should enforce tenant isolation when deactivating by ID", async () => {
    // Create projects with sequential IDs for different tenants
    const projects = [];
    for (let tenantId = 1; tenantId <= 5; tenantId++) {
      const project = await projectService.createProject({
        name: `Tenant ${tenantId} Project`,
        slug: `t${tenantId}-project`,
        tenantId,
      });
      projects.push(project);
    }

    // Try to deactivate each project from wrong tenant
    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      const wrongTenantId = project.tenantId === 1 ? 2 : 1;

      // Attempt deactivation with wrong tenant
      await projectService.deactivateProject(wrongTenantId, project.id);

      // Verify project is still active
      const dbResult = await env.DB.prepare(
        "SELECT isActive FROM Projects WHERE id = ?"
      ).bind(project.id).first<{ isActive: number }>();

      expect(dbResult?.isActive).toBe(1);
    }

    // Now deactivate each with correct tenant
    for (const project of projects) {
      await projectService.deactivateProject(project.tenantId, project.id);

      // Verify project is now inactive
      const dbResult = await env.DB.prepare(
        "SELECT isActive FROM Projects WHERE id = ?"
      ).bind(project.id).first<{ isActive: number }>();

      expect(dbResult?.isActive).toBe(0);
    }

    // Verify all projects are now inactive
    const activeCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects WHERE isActive = 1"
    ).first<{ count: number }>();

    expect(activeCount?.count).toBe(0);
  });
});
