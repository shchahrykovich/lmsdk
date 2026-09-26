import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { MODEL, manage, setupFixtures, validBody, type Fixtures } from "./helpers";

type PromptResponse = {
  prompt: { id: number; slug: string; latestVersion: number; activeVersion: number | null; provider: string; model: string };
  version: { version: number; body: Record<string, unknown> };
};

const createPrompt = (key: string, body: Record<string, unknown>) =>
  manage("/projects/support/prompts", key, { method: "POST", body });

const newPrompt = { name: "Ticket router", slug: "ticket-router", provider: "openai", model: MODEL, body: validBody };

describe("Manage API - prompts", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("creates a prompt with version 1 active and stores provider and model in the body", async () => {
    const res = await createPrompt(f.keys.write, newPrompt);
    const body = await res.json<PromptResponse>();

    expect(res.status).toBe(201);
    expect(body.prompt).toMatchObject({ slug: "ticket-router", latestVersion: 1, activeVersion: 1, provider: "openai", model: MODEL });
    expect(body.version.body).toEqual({ ...validBody, provider: "openai", model: MODEL });
  });

  it("returns 409 for a duplicate slug", async () => {
    await createPrompt(f.keys.write, newPrompt);

    const res = await createPrompt(f.keys.write, { ...newPrompt, name: "Other" });

    expect(res.status).toBe(409);
  });

  it.each([
    ["an unknown provider", { provider: "acme" }],
    ["an unknown model", { model: "no-such-model" }],
    ["no messages", { body: { messages: [] } }],
    ["a bad role", { body: { messages: [{ role: "robot", content: "x" }] } }],
  ])("returns 400 for %s and writes nothing", async (_label, override) => {
    const res = await createPrompt(f.keys.write, { ...newPrompt, ...override });
    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM Prompts WHERE slug = 'ticket-router'").first<{ count: number }>();

    expect(res.status).toBe(400);
    expect(row?.count).toBe(0);
  });

  it("adds a version that is NOT active by default", async () => {
    const res = await manage("/projects/support/prompts/classifier/versions", f.keys.write, {
      method: "POST",
      body: { body: { messages: [{ role: "user", content: "v2 {{ticket}}" }] } },
    });
    const body = await res.json<PromptResponse>();

    expect(res.status).toBe(201);
    expect(body.version.version).toBe(2);
    expect(body.prompt).toMatchObject({ latestVersion: 2, activeVersion: 1 });
  });

  it("adds a version and activates it when activate is true", async () => {
    const res = await manage("/projects/support/prompts/classifier/versions", f.keys.write, {
      method: "POST",
      body: { model: MODEL, activate: true },
    });
    const body = await res.json<PromptResponse>();

    expect(res.status).toBe(201);
    expect(body.prompt).toMatchObject({ latestVersion: 2, activeVersion: 2, model: MODEL });
    expect(body.version.body).toMatchObject({ model: MODEL, messages: [{ role: "user", content: "Say {{word}}" }] });
  });

  it("lists versions newest first", async () => {
    await manage("/projects/support/prompts/classifier/versions", f.keys.write, { method: "POST", body: {} });

    const res = await manage("/projects/support/prompts/classifier/versions", f.keys.read);
    const body = await res.json<{ versions: { version: number }[] }>();

    expect(body.versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("sets the active version, and returns 404 for a version that does not exist", async () => {
    await manage("/projects/support/prompts/classifier/versions", f.keys.write, { method: "POST", body: {} });

    const ok = await manage("/projects/support/prompts/classifier/active-version", f.keys.write, {
      method: "PUT",
      body: { version: 2 },
    });
    const missing = await manage("/projects/support/prompts/classifier/active-version", f.keys.write, {
      method: "PUT",
      body: { version: 9 },
    });

    expect(ok.status).toBe(200);
    expect((await ok.json<PromptResponse>()).prompt.activeVersion).toBe(2);
    expect(missing.status).toBe(404);
  });

  it("gets and lists prompts by slug and by id", async () => {
    const bySlug = await manage("/projects/support/prompts/classifier", f.keys.read);
    const byId = await manage(`/projects/${f.tenant1.project.id}/prompts/${f.tenant1.prompt.id}`, f.keys.read);
    const list = await manage("/projects/support/prompts", f.keys.read);

    expect(bySlug.status).toBe(200);
    expect((await byId.json<PromptResponse>()).prompt.slug).toBe("classifier");
    expect((await list.json<{ prompts: { slug: string; activeVersion: number }[] }>()).prompts).toEqual([
      expect.objectContaining({ slug: "classifier", activeVersion: 1 }),
    ]);
  });
});
