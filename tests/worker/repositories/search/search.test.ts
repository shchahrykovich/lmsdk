import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { SearchRepository } from "../../../../worker/repositories/search.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("SearchRepository - search", () => {
  let repository: SearchRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new SearchRepository(env.DB);
  });

  it("should search records by text query", async () => {
    // Insert test data
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

    const results = await repository.search(1, 10, "Alice", 10);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.variablePath)).toContain("user.name");
    expect(results.map((r) => r.variablePath)).toContain("user.email");
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

    const results = await repository.search(1, 10, "Alice", 10);

    expect(results).toHaveLength(1);
    expect(results[0].tenantId).toBe(1);
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

    const results = await repository.search(1, 10, "Alice", 10);

    expect(results).toHaveLength(1);
    expect(results[0].projectId).toBe(10);
  });

  it("should respect limit parameter", async () => {
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
      {
        variableValue: "user.city: Alice Springs",
        logId: 2,
        variablePath: "user.city",
        tenantId: 1,
        projectId: 10,
        promptId: 5,
        createdAt: 2000,
      },
    ]);

    const results = await repository.search(1, 10, "Alice", 2);

    expect(results).toHaveLength(2);
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

    const results = await repository.search(1, 10, "Alice", 10);

    expect(results).toHaveLength(0);
  });
});
