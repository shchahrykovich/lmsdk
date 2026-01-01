import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { SearchRepository } from "../../../../worker/repositories/search.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("SearchRepository - delete", () => {
  let repository: SearchRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new SearchRepository(env.DB);
  });

  describe("deleteByLogId", () => {
    it("should delete all records for a specific logId", async () => {
      await repository.insertBatch([
        {
          variableValue: "user.name: Alice",
          logId: 1,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "user.age: 30",
          logId: 1,
          variablePath: "user.age",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "user.name: Bob",
          logId: 2,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      await repository.deleteByLogId(1, 1);

      // Verify using direct SQL
      const result = await env.DB.prepare(
        "SELECT * FROM PromptExecutionLogsForSearch WHERE tenantId = ?"
      )
        .bind(1)
        .all();

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        logId: 2,
        variableValue: "user.name: Bob",
      });
    });

    it("should only delete records matching tenantId", async () => {
      await repository.insertBatch([
        {
          variableValue: "user.name: Alice",
          logId: 1,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "user.name: Bob",
          logId: 1,
          variablePath: "user.name",
          tenantId: 2,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      await repository.deleteByLogId(1, 1);

      const result = await env.DB.prepare("SELECT * FROM PromptExecutionLogsForSearch").all();

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        logId: 1,
        tenantId: 2,
      });
    });
  });

  describe("deleteByProject", () => {
    it("should delete all records for a specific project", async () => {
      await repository.insertBatch([
        {
          variableValue: "user.name: Alice",
          logId: 1,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "user.age: 30",
          logId: 2,
          variablePath: "user.age",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
        {
          variableValue: "user.name: Bob",
          logId: 3,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 20,
          promptId: 6,
          createdAt: 3000,
        },
      ]);

      await repository.deleteByProject(1, 10);

      const result = await env.DB.prepare("SELECT * FROM PromptExecutionLogsForSearch").all();

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        projectId: 20,
        logId: 3,
      });
    });

    it("should only delete records matching tenantId and projectId", async () => {
      await repository.insertBatch([
        {
          variableValue: "user.name: Alice",
          logId: 1,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "user.name: Bob",
          logId: 2,
          variablePath: "user.name",
          tenantId: 2,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      await repository.deleteByProject(1, 10);

      const result = await env.DB.prepare("SELECT * FROM PromptExecutionLogsForSearch").all();

      expect(result.results).toHaveLength(1);
      expect(result.results[0]).toMatchObject({
        tenantId: 2,
        projectId: 10,
      });
    });
  });
});
