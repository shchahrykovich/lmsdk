import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/services/project.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Project } from "../../../../worker/db/schema";

describe("ProjectService - Cross-tenant protection comprehensive tests", () => {
  let projectService: ProjectService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    projectService = new ProjectService(db);
  });

  it("should prevent any cross-tenant data leakage across all operations", async () => {
    // Setup: Create projects for multiple tenants
    const tenant1Projects = [
      await projectService.createProject({
        name: "T1 Project A",
        slug: "t1-a",
        tenantId: 1,
      }),
      await projectService.createProject({
        name: "T1 Project B",
        slug: "t1-b",
        tenantId: 1,
      }),
    ];

    const tenant2Projects = [
      await projectService.createProject({
        name: "T2 Project A",
        slug: "t2-a",
        tenantId: 2,
      }),
      await projectService.createProject({
        name: "T2 Project B",
        slug: "t2-b",
        tenantId: 2,
      }),
    ];

    // Test 1: List operation isolates tenants
    const tenant1List = await projectService.listProjects(1);
    const tenant2List = await projectService.listProjects(2);

    expect(tenant1List).toHaveLength(2);
    expect(tenant2List).toHaveLength(2);
    expect(tenant1List.every(p => p.tenantId === 1)).toBe(true);
    expect(tenant2List.every(p => p.tenantId === 2)).toBe(true);

    // Test 2: Get by ID prevents cross-tenant access
    for (const t1Project of tenant1Projects) {
      expect(await projectService.getProjectById(1, t1Project.id)).toBeDefined();
      expect(await projectService.getProjectById(2, t1Project.id)).toBeUndefined();
    }

    for (const t2Project of tenant2Projects) {
      expect(await projectService.getProjectById(2, t2Project.id)).toBeDefined();
      expect(await projectService.getProjectById(1, t2Project.id)).toBeUndefined();
    }

    // Test 3: Get by slug prevents cross-tenant access
    expect(await projectService.getProjectBySlug(1, "t1-a")).toBeDefined();
    expect(await projectService.getProjectBySlug(2, "t1-a")).toBeUndefined();
    expect(await projectService.getProjectBySlug(2, "t2-a")).toBeDefined();
    expect(await projectService.getProjectBySlug(1, "t2-a")).toBeUndefined();

    // Test 4: Deactivate prevents cross-tenant modification
    await projectService.deactivateProject(1, tenant2Projects[0].id); // Wrong tenant

    const stillActive = await env.DB.prepare(
      "SELECT isActive FROM Projects WHERE id = ?"
    ).bind(tenant2Projects[0].id).first<{ isActive: number }>();

    expect(stillActive?.isActive).toBe(1); // Still active

    // Test 5: Verify database integrity using direct SQL
    const allProjects = await env.DB.prepare(
      "SELECT * FROM Projects ORDER BY tenantId, id"
    ).all<Project>();

    expect(allProjects.results).toHaveLength(4);
    expect(allProjects.results.filter(p => p.tenantId === 1)).toHaveLength(2);
    expect(allProjects.results.filter(p => p.tenantId === 2)).toHaveLength(2);
    expect(allProjects.results.every(p => p.isActive === 1)).toBe(true);
  });

  it("should handle edge cases with tenantId values", async () => {
    // Test with edge case tenant IDs
    const edgeTenants = [0, -1, 999999];

    for (const tenantId of edgeTenants) {
      const project = await projectService.createProject({
        name: `Tenant ${tenantId} Project`,
        slug: `t${tenantId}-project`,
        tenantId,
      });

      // Verify isolation
      const retrieved = await projectService.getProjectById(tenantId, project.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.tenantId).toBe(tenantId);

      // Verify other tenants can't access
      for (const otherTenantId of edgeTenants) {
        if (otherTenantId !== tenantId) {
          const shouldBeUndefined = await projectService.getProjectById(
            otherTenantId,
            project.id
          );
          expect(shouldBeUndefined).toBeUndefined();
        }
      }
    }
  });
});
