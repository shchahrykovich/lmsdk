import { describe, it, expect, beforeEach } from "vitest";
import { manage, setupFixtures, type Fixtures } from "./helpers";

type ProjectBody = { project: { id: number; name: string; slug: string } };

describe("Manage API - providers and projects", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("lists providers with their models", async () => {
    const res = await manage("/providers", f.keys.read);
    const body = await res.json<{ providers: { id: string; models: { id: string }[] }[] }>();

    expect(res.status).toBe(200);
    expect(body.providers.map((p) => p.id)).toEqual(["openai", "google", "openrouter", "anthropic", "openrouter-decisions"]);
    expect(body.providers[0].models.length).toBeGreaterThan(0);
  });

  it("lists only the key owner's projects", async () => {
    const res = await manage("/projects", f.keys.read);
    const body = await res.json<{ projects: { id: number }[] }>();

    expect(res.status).toBe(200);
    expect(body.projects.map((p) => p.id)).toEqual([f.tenant1.project.id]);
  });

  it("creates a project, then returns 409 for the same slug", async () => {
    const first = await manage("/projects", f.keys.write, { method: "POST", body: { name: "Agent", slug: "agent" } });
    const second = await manage("/projects", f.keys.write, { method: "POST", body: { name: "Agent 2", slug: "agent" } });

    expect(first.status).toBe(201);
    expect((await first.json<ProjectBody>()).project).toMatchObject({ name: "Agent", slug: "agent" });
    expect(second.status).toBe(409);
  });

  it.each([
    [{ name: "No slug" }],
    [{ name: "Bad", slug: "Has Spaces" }],
    [{ name: "Digits", slug: "2024" }],
    [{ slug: "no-name" }],
  ])("returns 400 for %j", async (body) => {
    const res = await manage("/projects", f.keys.write, { method: "POST", body });

    expect(res.status).toBe(400);
  });

  it("gets a project by slug and by id", async () => {
    const bySlug = await manage("/projects/support", f.keys.read);
    const byId = await manage(`/projects/${f.tenant1.project.id}`, f.keys.read);

    expect((await bySlug.json<ProjectBody>()).project.id).toBe(f.tenant1.project.id);
    expect((await byId.json<ProjectBody>()).project.slug).toBe("support");
  });

  it("returns 404 for a project that does not exist", async () => {
    const res = await manage("/projects/missing", f.keys.read);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });
});
