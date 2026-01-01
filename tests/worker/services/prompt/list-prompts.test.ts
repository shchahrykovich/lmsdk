import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - listPrompts", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should return all prompts for a project", async () => {
    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt A",
      slug: "prompt-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt B",
      slug: "prompt-b",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const prompts = await promptService.listPrompts(1, 1);

    expect(prompts).toHaveLength(2);
    expect(prompts.every(p => p.tenantId === 1)).toBe(true);
    expect(prompts.every(p => p.projectId === 1)).toBe(true);
  });

  it("should return empty array when no prompts exist", async () => {
    const prompts = await promptService.listPrompts(1, 1);

    expect(prompts).toEqual([]);
  });

  it("should only return prompts for the specified tenant (cross-tenant protection)", async () => {
    // Create prompts for tenant 1
    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt A",
      slug: "t1-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt B",
      slug: "t1-b",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Create prompts for tenant 2
    await promptService.createPrompt({
      tenantId: 2,
      projectId: 1,
      name: "T2 Prompt A",
      slug: "t2-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const tenant1Prompts = await promptService.listPrompts(1, 1);
    const tenant2Prompts = await promptService.listPrompts(2, 1);

    expect(tenant1Prompts).toHaveLength(2);
    expect(tenant2Prompts).toHaveLength(1);
    expect(tenant1Prompts.every(p => p.tenantId === 1)).toBe(true);
    expect(tenant2Prompts.every(p => p.tenantId === 2)).toBe(true);

    // Verify using direct SQL
    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts"
    ).all<Prompt>();

    expect(allPrompts.results).toHaveLength(3);
  });

  it("should only return prompts for the specified project (cross-project protection)", async () => {
    // Create prompts for project 1
    await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "P1 Prompt A",
      slug: "p1-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    // Create prompts for project 2
    await promptService.createPrompt({
      tenantId: 1,
      projectId: 2,
      name: "P2 Prompt A",
      slug: "p2-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const project1Prompts = await promptService.listPrompts(1, 1);
    const project2Prompts = await promptService.listPrompts(1, 2);

    expect(project1Prompts).toHaveLength(1);
    expect(project2Prompts).toHaveLength(1);
    expect(project1Prompts[0].projectId).toBe(1);
    expect(project2Prompts[0].projectId).toBe(2);
  });
});
