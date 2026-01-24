import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/prompts/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createProjectId, createEntityId } from "../../helpers/id-helpers";
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
    const projectId = createProjectId(1, 1);

    await promptService.createPrompt(projectId, {
      name: "Prompt A",
      slug: "prompt-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt(projectId, {
      name: "Prompt B",
      slug: "prompt-b",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const prompts = await promptService.listPrompts(projectId);

    expect(prompts).toHaveLength(2);
    expect(prompts.every(p => p.tenantId === 1)).toBe(true);
    expect(prompts.every(p => p.projectId === 1)).toBe(true);
  });

  it("should return empty array when no prompts exist", async () => {
    const prompts = await promptService.listPrompts(createProjectId(1, 1));

    expect(prompts).toEqual([]);
  });

  it("should only return prompts for the specified tenant (cross-tenant protection)", async () => {
    const tenant1Project = createProjectId(1, 1);
    const tenant2Project = createProjectId(1, 2);

    await promptService.createPrompt(tenant1Project, {
      name: "T1 Prompt A",
      slug: "t1-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt(tenant1Project, {
      name: "T1 Prompt B",
      slug: "t1-b",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt(tenant2Project, {
      name: "T2 Prompt A",
      slug: "t2-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const tenant1Prompts = await promptService.listPrompts(tenant1Project);
    const tenant2Prompts = await promptService.listPrompts(tenant2Project);

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
    const project1 = createProjectId(1, 1);
    const project2 = createProjectId(2, 1);

    await promptService.createPrompt(project1, {
      name: "P1 Prompt A",
      slug: "p1-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.createPrompt(project2, {
      name: "P2 Prompt A",
      slug: "p2-a",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const project1Prompts = await promptService.listPrompts(project1);
    const project2Prompts = await promptService.listPrompts(project2);

    expect(project1Prompts).toHaveLength(1);
    expect(project2Prompts).toHaveLength(1);
    expect(project1Prompts[0].projectId).toBe(1);
    expect(project2Prompts[0].projectId).toBe(2);
  });

  it("should only return active prompts by default", async () => {
    const projectId = createProjectId(1, 1);

    const prompt1 = await promptService.createPrompt(projectId, {
      name: "Active Prompt",
      slug: "active-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    const prompt2 = await promptService.createPrompt(projectId, {
      name: "Inactive Prompt",
      slug: "inactive-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    await promptService.deactivatePrompt(createEntityId(prompt2.id, 1, 1));

    const prompts = await promptService.listPrompts(projectId);

    expect(prompts).toHaveLength(1);
    expect(prompts[0].id).toBe(prompt1.id);
    expect(prompts[0].isActive).toBe(true);

    // Verify using direct SQL that inactive prompt exists but is not returned
    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE tenantId = ? AND projectId = ?"
    ).bind(1, 1).all<Prompt>();

    expect(allPrompts.results).toHaveLength(2);
    expect(allPrompts.results.find(p => p.id === prompt2.id)?.isActive).toBe(0);
  });
});
