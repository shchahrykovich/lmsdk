import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { projects, prompts, promptRouters, promptVersions } from "../../../../worker/db/schema";
import { requestJsonWithApiKey, setupApiKeyUser } from "./helpers";

const mockExecutePrompt = vi.fn();
vi.mock("../../../../worker/services/provider.service", () => ({
  ProviderService: class {
    constructor() {}
    executePrompt = mockExecutePrompt;
  },
}));

const versionBody = (text: string) => JSON.stringify({ messages: [{ role: "user", content: `${text} {{name}}` }] });

describe("V1 Execute Prompt - version selection", () => {
  let testApiKey: string;
  let projectId: number;

  const insertPrompt = async (slug: string, versions: { version: number; model: string; text: string }[], activeVersion: number) => {
    const db = drizzle(env.DB);
    const latest = versions[versions.length - 1];
    const [prompt] = await db.insert(prompts).values({
      name: slug,
      slug,
      tenantId: 1,
      projectId,
      provider: "openai",
      model: latest.model,
      body: versionBody(latest.text),
      latestVersion: latest.version,
      isActive: true,
    }).returning();

    for (const v of versions) {
      await db.insert(promptVersions).values({
        promptId: prompt.id,
        tenantId: 1,
        projectId,
        version: v.version,
        name: slug,
        slug,
        provider: "openai",
        model: v.model,
        body: versionBody(v.text),
      });
    }

    await db.insert(promptRouters).values({ promptId: prompt.id, tenantId: 1, projectId, version: activeVersion });
    return prompt;
  };

  const execute = (body: Record<string, unknown>) =>
    requestJsonWithApiKey("/api/v1/projects/test-project/prompts/scorer/execute", testApiKey, body);

  beforeEach(async () => {
    testApiKey = (await setupApiKeyUser()).testApiKey;
    mockExecutePrompt.mockReset();
    mockExecutePrompt.mockResolvedValue({
      content: "ok",
      model: "gpt-4o",
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const [project] = await drizzle(env.DB).insert(projects).values({
      name: "Test Project",
      slug: "test-project",
      tenantId: 1,
      isActive: true,
    }).returning();
    projectId = project.id;

    await insertPrompt("scorer", [
      { version: 1, model: "gpt-4o-mini", text: "first" },
      { version: 2, model: "gpt-4o", text: "second" },
    ], 2);
  });

  it("runs the active version when no version is given", async () => {
    const response = await execute({ variables: { name: "Ann" } });

    expect(response.status).toBe(200);
    expect(mockExecutePrompt).toHaveBeenCalledWith("openai", expect.objectContaining({ model: "gpt-4o" }));
    expect(await response.json()).toMatchObject({
      response: "ok",
      model: "gpt-4o",
      provider: "openai",
      version: 2,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  });

  it("runs the requested version instead of the active one", async () => {
    const response = await execute({ variables: { name: "Ann" }, version: 1 });

    expect(response.status).toBe(200);
    expect(mockExecutePrompt).toHaveBeenCalledWith(
      "openai",
      expect.objectContaining({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "first {{name}}" }],
      })
    );
    expect(await response.json()).toMatchObject({ version: 1 });
  });

  it("returns 404 when the requested version does not exist", async () => {
    const response = await execute({ variables: {}, version: 7 });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Prompt version 7 not found" });
    expect(mockExecutePrompt).not.toHaveBeenCalled();
  });

  it("does not run a version that belongs to another prompt", async () => {
    await insertPrompt("other", [
      { version: 1, model: "gpt-4o-mini", text: "a" },
      { version: 2, model: "gpt-4o-mini", text: "b" },
      { version: 3, model: "gpt-4o-mini", text: "c" },
    ], 3);

    const response = await execute({ variables: {}, version: 3 });

    expect(response.status).toBe(404);
    expect(mockExecutePrompt).not.toHaveBeenCalled();
  });

  it("rejects a version that is not a positive integer", async () => {
    const response = await execute({ variables: {}, version: 0 });

    expect(response.status).toBe(400);
    expect(mockExecutePrompt).not.toHaveBeenCalled();
  });
});
