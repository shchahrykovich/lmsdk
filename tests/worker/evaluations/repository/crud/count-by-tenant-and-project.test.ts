import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationRepository } from "../../../../../worker/evaluations/evaluation.repository";
import { applyMigrations } from "../../../helpers/db-setup";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { EntityId } from "../../../../../worker/shared/entity-id";

describe("EvaluationRepository - countByTenantAndProject", () => {
  let repository: EvaluationRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationRepository(env.DB);
  });

  it("should return correct count for tenant and project", async () => {
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

    // Create evaluations for different tenant/project
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

    const projectId = new ProjectId(1, 1, "user-1");
    const count = await repository.countByTenantAndProject(projectId);

    expect(count).toBe(5);
  });

  it("should return 0 for non-existent tenant/project", async () => {
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
    const count = await repository.countByTenantAndProject(projectId);

    expect(count).toBe(0);
  });

  it("should enforce cross-tenant protection", async () => {
    // Create 3 evaluations for tenant 1
    for (let i = 1; i <= 3; i++) {
      await repository.create({
        tenantId: 1,
        projectId: 1,
        name: `Tenant 1 Eval ${i}`,
        slug: `tenant-1-eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
      });
    }

    // Create 2 evaluations for tenant 2
    for (let i = 1; i <= 2; i++) {
      await repository.create({
        tenantId: 2,
        projectId: 1,
        name: `Tenant 2 Eval ${i}`,
        slug: `tenant-2-eval-${i}`,
        type: "run",
        state: "created",
        durationMs: null,
        inputSchema: "{}",
        outputSchema: "{}",
      });
    }

    const projectId1 = new ProjectId(1, 1, "user-1");
    const tenant1Count = await repository.countByTenantAndProject(projectId1);

    const projectId2 = new ProjectId(1, 2, "user-2");
    const tenant2Count = await repository.countByTenantAndProject(projectId2);

    expect(tenant1Count).toBe(3);
    expect(tenant2Count).toBe(2);
  });

  it("should count evaluations correctly after deletion", async () => {
    const eval1 = await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval 1",
      slug: "eval-1",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    await repository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval 2",
      slug: "eval-2",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const projectId = new ProjectId(1, 1, "user-1");
    let count = await repository.countByTenantAndProject(projectId);
    expect(count).toBe(2);

    // Delete one evaluation
    const entityId = new EntityId(eval1.id, projectId);
    await repository.delete(entityId);

    count = await repository.countByTenantAndProject(projectId);
    expect(count).toBe(1);
  });
});
