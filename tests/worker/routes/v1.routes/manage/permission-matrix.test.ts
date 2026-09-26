import { describe, it, expect, beforeEach } from "vitest";
import { manage, setupFixtures, type Fixtures } from "./helpers";
import { setupApiKeyUser } from "../helpers";
import { bodyFor, fillPath, manageOperations, type Operation } from "./openapi";

const slugs = { project: "support", prompt: "classifier", dataset: "tickets", evaluation: "missing" };

const call = (operation: Operation, key: string | undefined) =>
  manage(fillPath(operation.path, slugs), key, { method: operation.method, body: bodyFor(operation) });

describe("Manage API - permission matrix over every documented route", () => {
  let f: Fixtures;
  let operations: Operation[];

  beforeEach(async () => {
    f = await setupFixtures();
    operations = await manageOperations();
  });

  it("finds the 16 documented manage operations", () => {
    expect(operations).toHaveLength(16);
  });

  it("returns 401 without a key on every route", async () => {
    for (const operation of operations) {
      const res = await call(operation, undefined);
      expect(res.status, `${operation.method} ${operation.path}`).toBe(401);
    }
  });

  it("returns 403 for a key without permissions on every route", async () => {
    for (const operation of operations) {
      const res = await call(operation, f.keys.old);
      expect(res.status, `${operation.method} ${operation.path}`).toBe(403);
    }
  });

  it("returns 403 for a read key on every write route and lets it through on every GET", async () => {
    for (const operation of operations) {
      const res = await call(operation, f.keys.read);
      const label = `${operation.method} ${operation.path}`;
      if (operation.method === "GET") {
        expect(res.status, label).not.toBe(403);
      } else {
        expect(res.status, label).toBe(403);
      }
    }
  });

  it("returns 401 on every route for a write key whose owner has no tenant", async () => {
    const orphan = await setupApiKeyUser(-1, { manage: ["read", "write"] });

    for (const operation of operations) {
      const res = await call(operation, orphan.testApiKey);
      expect(res.status, `${operation.method} ${operation.path}`).toBe(401);
    }
  });

  it("lets a write key through on every route", async () => {
    for (const operation of operations) {
      const res = await call(operation, f.keys.write);
      expect([401, 403], `${operation.method} ${operation.path}`).not.toContain(res.status);
    }
  });
});
