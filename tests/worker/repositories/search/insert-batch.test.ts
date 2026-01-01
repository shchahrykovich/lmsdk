import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { SearchRepository } from "../../../../worker/repositories/search.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("SearchRepository - insertBatch", () => {
  let repository: SearchRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new SearchRepository(env.DB);
  });

  it("should insert multiple records in a batch", async () => {
    const records = [
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
        variableValue: "user.email: alice@example.com",
        logId: 1,
        variablePath: "user.email",
        tenantId: 1,
        projectId: 10,
        promptId: 5,
        createdAt: 1000,
      },
    ];

    await repository.insertBatch(records);

    // Verify using direct SQL
    const result = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogsForSearch WHERE logId = ? AND tenantId = ?"
    )
      .bind(1, 1)
      .all();

    expect(result.results).toHaveLength(3);
    expect(result.results.map((r: any) => r.variablePath)).toEqual([
      "user.name",
      "user.age",
      "user.email",
    ]);
  });

  it("should handle empty array gracefully", async () => {
    await repository.insertBatch([]);

    const result = await env.DB.prepare("SELECT COUNT(*) as count FROM PromptExecutionLogsForSearch").first<{
      count: number;
    }>();

    expect(result?.count).toBe(0);
  });
});
