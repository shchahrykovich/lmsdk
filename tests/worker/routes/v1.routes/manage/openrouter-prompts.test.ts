import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { manage, setupFixtures, validBody, type Fixtures } from "./helpers";

type PromptResponse = {
  prompt: { slug: string; provider: string; model: string };
  version: { version: number; body: Record<string, unknown> };
};

const LISTED_MODEL = "anthropic/claude-sonnet-5";

const createPrompt = (key: string, body: Record<string, unknown>) =>
  manage("/projects/support/prompts", key, { method: "POST", body });

const openRouterPrompt = {
  name: "Claude router",
  slug: "claude-router",
  provider: "openrouter",
  model: LISTED_MODEL,
  body: validBody,
};

describe("Manage API - OpenRouter prompts", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
  });

  it("lists the OpenRouter models for agents", async () => {
    const res = await manage("/providers", f.keys.read);
    const body = await res.json<{ providers: { id: string; models: { id: string }[] }[] }>();

    const openRouter = body.providers.find((p) => p.id === "openrouter");
    expect(openRouter?.models.map((m) => m.id)).toContain(LISTED_MODEL);
  });

  it("creates a prompt on a listed OpenRouter model", async () => {
    const res = await createPrompt(f.keys.write, openRouterPrompt);
    const body = await res.json<PromptResponse>();

    expect(res.status).toBe(201);
    expect(body.prompt).toMatchObject({ provider: "openrouter", model: LISTED_MODEL });
    expect(body.version.body).toEqual({ ...validBody, provider: "openrouter", model: LISTED_MODEL });
  });

  it("returns 400 for an OpenRouter model that is not in the list and writes nothing", async () => {
    const res = await createPrompt(f.keys.write, { ...openRouterPrompt, model: "anthropic/claude-3-opus" });
    const row = await env.DB.prepare("SELECT COUNT(*) as count FROM Prompts WHERE slug = 'claude-router'").first<{
      count: number;
    }>();

    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toContain('Unknown model "anthropic/claude-3-opus" for provider "openrouter"');
    expect(row?.count).toBe(0);
  });

  it("refuses a new version of a prompt whose model left the list until a listed model is sent", async () => {
    await createPrompt(f.keys.write, openRouterPrompt);
    await env.DB.prepare("UPDATE Prompts SET model = 'anthropic/claude-retired' WHERE slug = 'claude-router'").run();
    const versionsPath = "/projects/support/prompts/claude-router/versions";

    const refused = await manage(versionsPath, f.keys.write, { method: "POST", body: { body: validBody } });
    const accepted = await manage(versionsPath, f.keys.write, {
      method: "POST",
      body: { body: validBody, model: LISTED_MODEL },
    });

    expect(refused.status).toBe(400);
    expect(accepted.status).toBe(201);
  });
});
