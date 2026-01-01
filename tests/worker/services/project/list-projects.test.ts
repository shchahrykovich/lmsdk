import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/services/project.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Project } from "../../../../worker/db/schema";

describe("ProjectService - listProjects", () => {
  let projectService: ProjectService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    projectService = new ProjectService(db);
  });

  it("should return empty array when no projects exist for tenant", async () => {
    const projects = await projectService.listProjects(1);

    expect(projects).toEqual([]);
  });

  it("should list all projects for a specific tenant", async () => {
    // Create projects for tenant 1
    await projectService.createProject({
      name: "Project A",
      slug: "project-a",
      tenantId: 1,
    });
    await projectService.createProject({
      name: "Project B",
      slug: "project-b",
      tenantId: 1,
    });

    // Create projects for tenant 2 (should not be returned)
    await projectService.createProject({
      name: "Project C",
      slug: "project-c",
      tenantId: 2,
    });

    const projects = await projectService.listProjects(1);

    expect(projects).toHaveLength(2);
    expect(projects.every(p => p.tenantId === 1)).toBe(true);
    expect(projects.map(p => p.name).sort()).toEqual(["Project A", "Project B"]);

    // Verify cross-tenant protection using direct SQL
    const allProjects = await env.DB.prepare(
      "SELECT * FROM Projects"
    ).all<Project>();

    expect(allProjects.results).toHaveLength(3);

    // Verify none of tenant 2's projects were returned
    const hasTenant2Projects = projects.some(p => p.tenantId === 2);
    expect(hasTenant2Projects).toBe(false);
  });

  it("should return projects ordered by updatedAt DESC", async () => {
    // Create projects with sufficient delay to ensure different timestamps
    const project1 = await projectService.createProject({
      name: "First",
      slug: "first",
      tenantId: 1,
    });

    // Wait to ensure different timestamp (SQLite unixepoch() has 1-second resolution)
    await new Promise(resolve => setTimeout(resolve, 1100));

    const project2 = await projectService.createProject({
      name: "Second",
      slug: "second",
      tenantId: 1,
    });

    await new Promise(resolve => setTimeout(resolve, 1100));

    const project3 = await projectService.createProject({
      name: "Third",
      slug: "third",
      tenantId: 1,
    });

    const projects = await projectService.listProjects(1);

    // Most recently updated should be first
    expect(projects[0].id).toBe(project3.id);
    expect(projects[1].id).toBe(project2.id);
    expect(projects[2].id).toBe(project1.id);
  });

  it("should only return projects for the specified tenant (cross-tenant protection)", async () => {
    // Create projects for multiple tenants
    await projectService.createProject({
      name: "Tenant 1 Project 1",
      slug: "t1-p1",
      tenantId: 1,
    });
    await projectService.createProject({
      name: "Tenant 1 Project 2",
      slug: "t1-p2",
      tenantId: 1,
    });
    await projectService.createProject({
      name: "Tenant 2 Project 1",
      slug: "t2-p1",
      tenantId: 2,
    });
    await projectService.createProject({
      name: "Tenant 3 Project 1",
      slug: "t3-p1",
      tenantId: 3,
    });

    // Test tenant 1
    const tenant1Projects = await projectService.listProjects(1);
    expect(tenant1Projects).toHaveLength(2);
    expect(tenant1Projects.every(p => p.tenantId === 1)).toBe(true);

    // Test tenant 2
    const tenant2Projects = await projectService.listProjects(2);
    expect(tenant2Projects).toHaveLength(1);
    expect(tenant2Projects.every(p => p.tenantId === 2)).toBe(true);

    // Test tenant 3
    const tenant3Projects = await projectService.listProjects(3);
    expect(tenant3Projects).toHaveLength(1);
    expect(tenant3Projects.every(p => p.tenantId === 3)).toBe(true);

    // Test non-existent tenant
    const tenant99Projects = await projectService.listProjects(99);
    expect(tenant99Projects).toHaveLength(0);

    // Verify using direct SQL that cross-tenant data is not leaked
    const tenant1SqlResult = await env.DB.prepare(
      "SELECT * FROM Projects WHERE tenantId = ?"
    ).bind(1).all<Project>();

    expect(tenant1SqlResult.results).toHaveLength(2);
    expect(tenant1SqlResult.results.every(p => p.tenantId === 1)).toBe(true);
  });
});
