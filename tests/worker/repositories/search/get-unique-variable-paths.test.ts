import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { SearchRepository, type SearchRecord } from "../../../../worker/repositories/search.repository";
import { applyMigrations } from "../../helpers/db-setup";

const record = (overrides: Partial<SearchRecord> = {}): SearchRecord => ({
  variableValue: "value",
  logId: 1,
  variablePath: "user.name",
  tenantId: 1,
  projectId: 10,
  promptId: 5,
  createdAt: 1000,
  ...overrides,
});

const storedPaths = async () => {
  const { results } = await env.DB.prepare(
    "SELECT tenantId, projectId, variablePath FROM PromptExecutionLogVariablePaths ORDER BY tenantId, projectId, variablePath"
  ).all();
  return results;
};

describe("SearchRepository - variable paths", () => {
  let repository: SearchRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new SearchRepository(env.DB);
  });

  it("stores each path once when a batch and later batches repeat it", async () => {
    await repository.insertBatch([
      record({ logId: 1, variablePath: "user.name" }),
      record({ logId: 2, variablePath: "user.name" }),
      record({ logId: 2, variablePath: "user.age" }),
    ]);
    await repository.insertBatch([record({ logId: 3, variablePath: "user.name" })]);

    expect(await storedPaths()).toEqual([
      { tenantId: 1, projectId: 10, variablePath: "user.age" },
      { tenantId: 1, projectId: 10, variablePath: "user.name" },
    ]);
  });

  it("stores the path when a single record is inserted", async () => {
    await repository.insert(record({ variablePath: "user.email" }));

    expect(await storedPaths()).toEqual([{ tenantId: 1, projectId: 10, variablePath: "user.email" }]);
  });

  it("returns sorted paths from the path table without reading the search table", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO PromptExecutionLogVariablePaths (tenantId, projectId, variablePath) VALUES (1, 10, 'b.path'), (1, 10, 'a.path')"
      ),
      env.DB.prepare(
        "INSERT INTO PromptExecutionLogsForSearch (variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt) VALUES ('x', 1, 'only.in.search', 1, 10, 5, 1000)"
      ),
    ]);

    expect(await repository.getUniqueVariablePaths(1, 10)).toEqual(["a.path", "b.path"]);
  });

  it("returns an empty list for a project without paths", async () => {
    expect(await repository.getUniqueVariablePaths(1, 999)).toEqual([]);
  });

  it("does not return the paths of another tenant or another project", async () => {
    await repository.insertBatch([
      record({ tenantId: 1, projectId: 10, variablePath: "mine" }),
      record({ tenantId: 2, projectId: 10, variablePath: "other.tenant" }),
      record({ tenantId: 1, projectId: 11, variablePath: "other.project" }),
    ]);

    expect(await repository.getUniqueVariablePaths(1, 10)).toEqual(["mine"]);
  });

  it("deleting a project removes only the paths of that tenant and project", async () => {
    await repository.insertBatch([
      record({ tenantId: 1, projectId: 10, variablePath: "removed" }),
      record({ tenantId: 2, projectId: 10, variablePath: "other.tenant" }),
      record({ tenantId: 1, projectId: 11, variablePath: "other.project" }),
    ]);

    await repository.deleteByProject(1, 10);

    expect(await storedPaths()).toEqual([
      { tenantId: 1, projectId: 11, variablePath: "other.project" },
      { tenantId: 2, projectId: 10, variablePath: "other.tenant" },
    ]);
  });

  it("finds the paths of a project through the primary key, not with a table scan", async () => {
    const { results } = await env.DB.prepare(
      "EXPLAIN QUERY PLAN SELECT variablePath FROM PromptExecutionLogVariablePaths WHERE tenantId = 1 AND projectId = 10 ORDER BY variablePath ASC"
    ).all<{ detail: string }>();

    const plan = results.map((row) => row.detail).join(" ");
    expect(plan).toContain("SEARCH");
    expect(plan).toContain("(tenantId=? AND projectId=?)");
  });
});
