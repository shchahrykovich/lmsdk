import { describe, it, expect, beforeEach } from "vitest";
import { manage, MODEL, setupFixtures, validBody, type Fixtures } from "./helpers";
import { fetchOpenApi, manageOperations, type Operation } from "./openapi";
import { PromptBodySchema } from "../../../../../worker/openapi/manage/schemas";

describe("Manage API - OpenAPI contract", () => {
  let operations: Operation[];

  beforeEach(async () => {
    operations = await manageOperations();
  });

  it("documents every operation with the manage tag, the key and the error codes", () => {
    for (const { method, path, hasPathParams, spec } of operations) {
      const label = `${method} ${path}`;
      expect(spec.tags, label).toEqual(["manage"]);
      expect(spec.security, label).toEqual([{ apiKey: [] }]);
      expect(Object.keys(spec.responses), label).toEqual(expect.arrayContaining(["400", "401", "403"]));
      if (hasPathParams) {
        expect(Object.keys(spec.responses), label).toContain("404");
      }
      if (method !== "GET") {
        expect(spec.requestBody?.content["application/json"].schema, label).toBeDefined();
      }
    }
  });

  it("warns agents on the two routes that are not safe to retry", () => {
    const describe = (method: string, suffix: string) =>
      operations.find((op) => op.method === method && op.path.endsWith(suffix))?.spec.description ?? "";

    expect(describe("POST", "/versions")).toContain("NOT safe to retry");
    expect(describe("POST", "/records")).toContain("NOT safe to retry");
  });

  it("documents the prompt body with required messages and the three roles", async () => {
    const doc = await fetchOpenApi();
    const create = doc.paths["/api/v1/manage/projects/{project}/prompts"].post;
    const text = JSON.stringify(create.requestBody);

    expect(text).toContain('"messages"');
    expect(text).toContain('"system","user","assistant"');
  });
});

describe("Manage API - stored prompt body round trip", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("stores a body that parses back into at least one valid message", async () => {
    await manage("/projects/support/prompts", f.keys.write, {
      method: "POST",
      body: { name: "Round trip", slug: "round-trip", provider: "openai", model: MODEL, body: validBody },
    });

    const res = await manage("/projects/support/prompts/round-trip/versions", f.keys.read);
    const { versions } = await res.json<{ versions: { body: unknown }[] }>();
    const parsed = PromptBodySchema.parse(versions[0].body);

    expect(parsed.messages.length).toBeGreaterThanOrEqual(1);
  });
});
