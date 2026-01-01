import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { SearchRepository } from "../../../../worker/repositories/search.repository";
import { applyMigrations } from "../../helpers/db-setup";

describe("SearchRepository - insert", () => {
  let repository: SearchRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new SearchRepository(env.DB);
  });

  it("should insert a search record", async () => {
    await repository.insert({
      variableValue: "user.name: Alice",
      logId: 1,
      variablePath: "user.name",
      tenantId: 1,
      projectId: 10,
      promptId: 5,
      createdAt: 1000,
    });

    // Verify using direct SQL (not ORM) per testing guidelines
    const result = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogsForSearch WHERE logId = ? AND tenantId = ?"
    )
      .bind(1, 1)
      .all();

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      variableValue: "user.name: Alice",
      logId: 1,
      variablePath: "user.name",
      tenantId: 1,
      projectId: 10,
      promptId: 5,
      createdAt: 1000,
    });
  });

  it("should insert multiple records for different variables", async () => {
    await repository.insert({
      variableValue: "user.name: Alice",
      logId: 1,
      variablePath: "user.name",
      tenantId: 1,
      projectId: 10,
      promptId: 5,
      createdAt: 1000,
    });

    await repository.insert({
      variableValue: "user.age: 30",
      logId: 1,
      variablePath: "user.age",
      tenantId: 1,
      projectId: 10,
      promptId: 5,
      createdAt: 1000,
    });

    const result = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogsForSearch WHERE logId = ? AND tenantId = ?"
    )
      .bind(1, 1)
      .all();

    expect(result.results).toHaveLength(2);
  });
});
