import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { ProjectService } from "../../../../worker/services/project.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Project } from "../../../../worker/db/schema";

describe("ProjectService - createProject", () => {
  let projectService: ProjectService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    projectService = new ProjectService(db);
  });

  it("should create a project with valid input", async () => {
    const input = {
      name: "Test Project",
      slug: "test-project",
      tenantId: 1,
    };

    const project = await projectService.createProject(input);

    expect(project).toBeDefined();
    expect(project.id).toBeGreaterThan(0);
    expect(project.name).toBe(input.name);
    expect(project.slug).toBe(input.slug);
    expect(project.tenantId).toBe(input.tenantId);
    expect(project.isActive).toBe(true);
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();

    // Verify in database using direct SQL
    const dbResult = await env.DB.prepare(
      "SELECT * FROM Projects WHERE id = ?"
    ).bind(project.id).first<Project>();

    expect(dbResult).toBeDefined();
    expect(dbResult?.name).toBe(input.name);
    expect(dbResult?.slug).toBe(input.slug);
    expect(dbResult?.tenantId).toBe(input.tenantId);
    expect(dbResult?.isActive).toBe(1); // SQLite stores boolean as 0/1
  });

  it("should create projects for different tenants with same name/slug", async () => {
    const input1 = {
      name: "Shared Project",
      slug: "shared-project",
      tenantId: 1,
    };

    const input2 = {
      name: "Shared Project",
      slug: "shared-project",
      tenantId: 2,
    };

    const project1 = await projectService.createProject(input1);
    const project2 = await projectService.createProject(input2);

    expect(project1.id).not.toBe(project2.id);
    expect(project1.tenantId).toBe(1);
    expect(project2.tenantId).toBe(2);

    // Verify both exist in database
    const countResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Projects WHERE name = ? AND slug = ?"
    ).bind("Shared Project", "shared-project").first<{ count: number }>();

    expect(countResult?.count).toBe(2);
  });

  it("should fail when creating duplicate name for same tenant", async () => {
    const input = {
      name: "Duplicate Project",
      slug: "unique-slug-1",
      tenantId: 1,
    };

    await projectService.createProject(input);

    // Try to create another project with same name but different slug
    const duplicateInput = {
      name: "Duplicate Project",
      slug: "unique-slug-2",
      tenantId: 1,
    };

    await expect(projectService.createProject(duplicateInput)).rejects.toThrow();
  });

  it("should fail when creating duplicate slug for same tenant", async () => {
    const input = {
      name: "Unique Project 1",
      slug: "duplicate-slug",
      tenantId: 1,
    };

    await projectService.createProject(input);

    // Try to create another project with same slug but different name
    const duplicateInput = {
      name: "Unique Project 2",
      slug: "duplicate-slug",
      tenantId: 1,
    };

    await expect(projectService.createProject(duplicateInput)).rejects.toThrow();
  });
});
