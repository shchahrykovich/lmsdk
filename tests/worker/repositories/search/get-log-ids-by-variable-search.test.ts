import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { SearchRepository } from "../../../../worker/repositories/search.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("SearchRepository - getLogIdsByVariableSearch", () => {
  let repository: SearchRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new SearchRepository(env.DB);
  });

  describe("contains operator", () => {
    it("should find logs with matching variable value using FTS5 MATCH", async () => {
      // Insert test data
      await repository.insertBatch([
        {
          variableValue: "user.name: Alice Johnson",
          logId: 1,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "user.name: Bob Smith",
          logId: 2,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
        {
          variableValue: "user.email: alice@example.com",
          logId: 1,
          variablePath: "user.email",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
    });

    it("should match partial words in variable value", async () => {
      await repository.insertBatch([
        {
          variableValue: "config.apiUrl: https://api.example.com",
          logId: 1,
          variablePath: "config.apiUrl",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
        {
          variableValue: "config.apiUrl: https://production.com",
          logId: 2,
          variablePath: "config.apiUrl",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "config.apiUrl",
        searchValue: "example",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
    });

    it("should filter by exact variablePath", async () => {
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
          variableValue: "user.email: alice@example.com",
          logId: 1,
          variablePath: "user.email",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "alice",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
    });

    it("should filter by tenantId", async () => {
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
          variableValue: "user.name: Alice",
          logId: 2,
          variablePath: "user.name",
          tenantId: 2,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
      expect(logIds).not.toContain(2);
    });

    it("should filter by projectId", async () => {
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
          variableValue: "user.name: Alice",
          logId: 2,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 20,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
      expect(logIds).not.toContain(2);
    });

    it("should return empty array when no matches found", async () => {
      await repository.insert({
        variableValue: "user.name: Bob",
        logId: 1,
        variablePath: "user.name",
        tenantId: 1,
        projectId: 10,
        promptId: 5,
        createdAt: 1000,
      });

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice",
        operator: "contains",
      });

      expect(logIds).toHaveLength(0);
    });

    it("should return distinct log IDs", async () => {
      // Same log has multiple variables matching the search
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
          variableValue: "user.email: alice@example.com",
          logId: 1,
          variablePath: "user.email",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
    });

    it("should handle numeric values", async () => {
      await repository.insertBatch([
        {
          variableValue: "user.age: 25",
          logId: 1,
          variablePath: "user.age",
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
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.age",
        searchValue: "25",
        operator: "contains",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
    });
  });

  describe("notEmpty operator", () => {
    it("should find all logs with the variable path regardless of value", async () => {
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
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
        {
          variableValue: "user.email: alice@example.com",
          logId: 1,
          variablePath: "user.email",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 1000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "",
        operator: // Value is ignored for notEmpty
        "notEmpty",
      });

      expect(logIds).toHaveLength(2);
      expect(logIds).toContain(1);
      expect(logIds).toContain(2);
    });

    it("should filter by tenantId", async () => {
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

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "",
        operator: "notEmpty",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
      expect(logIds).not.toContain(2);
    });

    it("should filter by projectId", async () => {
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
          tenantId: 1,
          projectId: 20,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "",
        operator: "notEmpty",
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
      expect(logIds).not.toContain(2);
    });

    it("should return empty array when variable path does not exist", async () => {
      await repository.insert({
        variableValue: "user.name: Alice",
        logId: 1,
        variablePath: "user.name",
        tenantId: 1,
        projectId: 10,
        promptId: 5,
        createdAt: 1000,
      });

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.email",
        searchValue: "",
        operator: "notEmpty",
      });

      expect(logIds).toHaveLength(0);
    });

    it("should return distinct log IDs", async () => {
      // In theory shouldn't happen (same path stored twice for same log),
      // but testing DISTINCT works
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
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "",
        operator: "notEmpty",
      });

      expect(logIds).toHaveLength(2);
      expect(logIds[0]).not.toBe(logIds[1]);
    });
  });

  describe("default operator", () => {
    it("should default to contains when operator not specified", async () => {
      await repository.insert({
        variableValue: "user.name: Alice",
        logId: 1,
        variablePath: "user.name",
        tenantId: 1,
        projectId: 10,
        promptId: 5,
        createdAt: 1000,
      });

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice"
        // operator not specified,
      });

      expect(logIds).toHaveLength(1);
      expect(logIds).toContain(1);
    });
  });

  describe("ordering", () => {
    it("should return log IDs in descending order", async () => {
      await repository.insertBatch([
        {
          variableValue: "user.name: Alice",
          logId: 3,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 3000,
        },
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
          variableValue: "user.name: Alice",
          logId: 2,
          variablePath: "user.name",
          tenantId: 1,
          projectId: 10,
          promptId: 5,
          createdAt: 2000,
        },
      ]);

      const logIds = await repository.getLogIdsByVariableSearch({
        tenantId: 1,
        projectId: 10,
        variablePath: "user.name",
        searchValue: "Alice",
        operator: "contains",
      });

      expect(logIds).toEqual([3, 2, 1]); // DESC order
    });
  });
});
