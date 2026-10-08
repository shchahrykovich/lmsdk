import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { manage, seedSubmittedBatch, setupFixtures, type Fixtures } from "./helpers";
import { bodyFor, fillPath, manageOperations, type Operation } from "./openapi";

const TABLES = ["Projects", "Prompts", "PromptVersions", "PromptRouters", "DataSets", "DataSetRecords", "Evaluations", "EvaluationPrompts", "EvaluationComparisons", "Batches", "BatchItems"];

const snapshotTenant1 = async () => {
  const rows: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    rows[table] = (await env.DB.prepare(`SELECT * FROM ${table} WHERE tenantId = 1 ORDER BY id`).all()).results;
  }
  return rows;
};

describe("Manage API - another tenant's ids are not reachable", () => {
  let f: Fixtures;
  let operations: Operation[];
  let tenant1Ids: Record<string, number>;

  beforeEach(async () => {
    f = await setupFixtures();
    operations = (await manageOperations()).filter((operation) => operation.hasPathParams);
    const created = await manage("/projects/support/evaluations", f.keys.write, {
      method: "POST",
      body: { name: "Tenant 1 eval", dataset: "tickets", prompts: [{ prompt: "classifier", version: 1 }] },
    });
    const { evaluation } = await created.json<{ evaluation: { id: number } }>();
    const batch = await seedSubmittedBatch(1, f.tenant1.project.id, f.tenant1.prompt.id);
    tenant1Ids = {
      batch: batch.id,
      project: f.tenant1.project.id,
      prompt: f.tenant1.prompt.id,
      dataset: f.tenant1.dataSet.id,
      evaluation: evaluation.id,
    };
  });

  it("returns 404 on every route with path parameters and changes nothing in tenant 1", async () => {
    const before = await snapshotTenant1();

    for (const operation of operations) {
      const res = await manage(fillPath(operation.path, tenant1Ids), f.keys.otherTenant, {
        method: operation.method,
        body: bodyFor(operation),
      });
      expect(res.status, `${operation.method} ${operation.path}`).toBe(404);
    }

    expect(await snapshotTenant1()).toEqual(before);
  });

  it("resolves a shared slug to the caller's own project, not tenant 1's", async () => {
    const res = await manage("/projects/support", f.keys.otherTenant);
    const body = await res.json<{ project: { id: number } }>();

    expect(body.project.id).toBe(f.tenant2.project.id);
    expect(body.project.id).not.toBe(f.tenant1.project.id);
  });
});
