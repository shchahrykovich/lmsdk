import { describe, it, expect, beforeEach } from "vitest";
import { manage, setupFixtures, type Fixtures } from "./helpers";

type DataSetResponse = { dataset: { id: number; slug: string; countOfRecords: number; schema: unknown } };

describe("Manage API - datasets", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("creates a dataset with a slug from its name, then returns 409 for the same name", async () => {
    const first = await manage("/projects/support/datasets", f.keys.write, { method: "POST", body: { name: "Hard Cases" } });
    const second = await manage("/projects/support/datasets", f.keys.write, { method: "POST", body: { name: "Hard Cases" } });

    expect(first.status).toBe(201);
    expect((await first.json<DataSetResponse>()).dataset).toMatchObject({ slug: "hard-cases", countOfRecords: 0 });
    expect(second.status).toBe(409);
  });

  it("adds records and returns the new count and schema", async () => {
    const res = await manage("/projects/support/datasets/tickets/records", f.keys.write, {
      method: "POST",
      body: { records: [{ ticket: "Refund" }, { ticket: "Crash" }] },
    });
    const body = await res.json<DataSetResponse & { recordIds: number[] }>();

    expect(res.status).toBe(201);
    expect(body.recordIds).toHaveLength(2);
    expect(body.dataset).toMatchObject({ countOfRecords: 2, schema: { fields: { ticket: { type: "string" } } } });
  });

  it.each([
    ["0 records", { records: [] }],
    ["101 records", { records: Array.from({ length: 101 }, (_, i) => ({ i })) }],
    ["a record that is not an object", { records: ["text"] }],
  ])("returns 400 for %s", async (_label, body) => {
    const res = await manage("/projects/support/datasets/tickets/records", f.keys.write, { method: "POST", body });

    expect(res.status).toBe(400);
  });

  it("finds a dataset whose slug is only digits by its slug, not as an id", async () => {
    const created = await manage("/projects/support/datasets", f.keys.write, { method: "POST", body: { name: "2024" } });
    const { dataset } = await created.json<DataSetResponse>();

    const res = await manage("/projects/support/datasets/2024", f.keys.read);

    expect(dataset.slug).toBe("2024");
    expect(res.status).toBe(200);
    expect((await res.json<DataSetResponse>()).dataset.id).toBe(dataset.id);
  });

  it("gets a dataset by slug and by id, and 404 for a missing one", async () => {
    const bySlug = await manage("/projects/support/datasets/tickets", f.keys.read);
    const byId = await manage(`/projects/support/datasets/${f.tenant1.dataSet.id}`, f.keys.read);
    const missing = await manage("/projects/support/datasets/nope", f.keys.read);

    expect((await bySlug.json<DataSetResponse>()).dataset.id).toBe(f.tenant1.dataSet.id);
    expect(byId.status).toBe(200);
    expect(missing.status).toBe(404);
  });
});
