import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { ProjectId } from "../../../../../worker/shared/project-id";

describe("EvaluationRepository - findByTenantAndProjectPaginated", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should return paginated evaluations for tenant and project", async () => {
    // Create 5 evaluations for tenant 1, project 1
    for (let i = 1; i <= 5; i++) {
      await repository.create({
        tenantId: 1,
        projectId: 1,
        name: `Eval ${i}`,
        slug: `eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
      });
    }

    // Create evaluations for different tenant/project (should not be included)
    await repository.create({
      tenantId: 2,
      projectId: 1,
      name: "Other Tenant Eval",
      slug: "other-tenant",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.create({
      tenantId: 1,
      projectId: 2,
      name: "Other Project Eval",
      slug: "other-project",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    // Test first page with pageSize 2
    const projectId = new ProjectId(1, 1, "user-1");
    const page1 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 1, pageSize: 2 }
    );

    expect(page1).toHaveLength(2);
    // Should be ordered by createdAt desc (most recent first)
    // Verify all results are from correct tenant/project
    expect(page1.every((e) => e.tenantId === 1 && e.projectId === 1)).toBe(true);

    // Test second page
    const page2 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 2, pageSize: 2 }
    );

    expect(page2).toHaveLength(2);
    expect(page2.every((e) => e.tenantId === 1 && e.projectId === 1)).toBe(true);

    // Test third page
    const page3 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 3, pageSize: 2 }
    );

    expect(page3).toHaveLength(1);
    expect(page3.every((e) => e.tenantId === 1 && e.projectId === 1)).toBe(true);

    // Test page beyond available data
    const page4 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 4, pageSize: 2 }
    );

    expect(page4).toHaveLength(0);
  });

  it("should respect pageSize parameter", async () => {
    // Create 10 evaluations
    for (let i = 1; i <= 10; i++) {
      await repository.create({
        tenantId: 1,
        projectId: 1,
        name: `Eval ${i}`,
        slug: `eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
      });
    }

    // Test different page sizes
    const projectId = new ProjectId(1, 1, "user-1");
    const pageSize5 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 1, pageSize: 5 }
    );
    expect(pageSize5).toHaveLength(5);

    const pageSize3 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 1, pageSize: 3 }
    );
    expect(pageSize3).toHaveLength(3);

    const pageSize100 = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 1, pageSize: 100 }
    );
    expect(pageSize100).toHaveLength(10);
  });

  it("should enforce cross-tenant protection", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Eval",
      slug: "tenant-1",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.create({
      tenantId: 2,
      projectId: 1,
      name: "Tenant 2 Eval",
      slug: "tenant-2",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const projectId1 = new ProjectId(1, 1, "user-1");
    const tenant1Results = await repository.findByTenantAndProjectPaginated(
      projectId1,
      { page: 1, pageSize: 10 }
    );

    expect(tenant1Results).toHaveLength(1);
    expect(tenant1Results[0].name).toBe("Tenant 1 Eval");

    const projectId2 = new ProjectId(1, 2, "user-2");
    const tenant2Results = await repository.findByTenantAndProjectPaginated(
      projectId2,
      { page: 1, pageSize: 10 }
    );

    expect(tenant2Results).toHaveLength(1);
    expect(tenant2Results[0].name).toBe("Tenant 2 Eval");
  });

  it("should return empty array for non-existent tenant/project", async () => {
    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval",
      slug: "eval",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const projectId = new ProjectId(999, 999, "user-999");
    const results = await repository.findByTenantAndProjectPaginated(
      projectId,
      { page: 1, pageSize: 10 }
    );

    expect(results).toHaveLength(0);
  });
});
