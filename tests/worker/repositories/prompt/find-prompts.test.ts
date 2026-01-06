import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptRepository } from "../../../../worker/repositories/prompt.repository";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptRepository - findPrompts", () => {
  let repository: PromptRepository;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize repository with drizzle instance
    const db = drizzle(env.DB);
    repository = new PromptRepository(db);
  });

  it("should return all active prompts by default", async () => {
    const prompt1 = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Active Prompt 1",
      slug: "active-1",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const prompt2 = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Active Prompt 2",
      slug: "active-2",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const prompts = await repository.findPrompts(1, 1);

    expect(prompts).toHaveLength(2);
    expect(prompts.map((p) => p.id)).toContain(prompt1.id);
    expect(prompts.map((p) => p.id)).toContain(prompt2.id);
  });

  it("should exclude inactive prompts when activeOnly is true", async () => {
    const activePrompt = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Active Prompt",
      slug: "active",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const inactivePrompt = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Inactive Prompt",
      slug: "inactive",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    // Deactivate the second prompt
    await repository.deactivatePrompt(1, 1, inactivePrompt.id);

    const prompts = await repository.findPrompts(1, 1, true);

    expect(prompts).toHaveLength(1);
    expect(prompts[0].id).toBe(activePrompt.id);

    // Verify using direct SQL that both prompts exist
    const allPrompts = await env.DB.prepare(
      "SELECT * FROM Prompts WHERE tenantId = ? AND projectId = ?"
    )
      .bind(1, 1)
      .all<Prompt>();

    expect(allPrompts.results).toHaveLength(2);
  });

  it("should include inactive prompts when activeOnly is false", async () => {
    const activePrompt = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Active Prompt",
      slug: "active",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const inactivePrompt = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Inactive Prompt",
      slug: "inactive",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    // Deactivate the second prompt
    await repository.deactivatePrompt(1, 1, inactivePrompt.id);

    const prompts = await repository.findPrompts(1, 1, false);

    expect(prompts).toHaveLength(2);
    expect(prompts.map((p) => p.id)).toContain(activePrompt.id);
    expect(prompts.map((p) => p.id)).toContain(inactivePrompt.id);
  });

  it("should only return prompts for the specified tenant (cross-tenant protection)", async () => {
    await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "T1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    await repository.createPrompt({
      tenantId: 2,
      projectId: 1,
      name: "T2 Prompt",
      slug: "t2-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const tenant1Prompts = await repository.findPrompts(1, 1);
    const tenant2Prompts = await repository.findPrompts(2, 1);

    expect(tenant1Prompts).toHaveLength(1);
    expect(tenant2Prompts).toHaveLength(1);
    expect(tenant1Prompts[0].tenantId).toBe(1);
    expect(tenant2Prompts[0].tenantId).toBe(2);

    // Verify using direct SQL that both prompts exist
    const allPrompts = await env.DB.prepare("SELECT * FROM Prompts")
      .all<Prompt>();

    expect(allPrompts.results).toHaveLength(2);
  });

  it("should only return prompts for the specified project (cross-project protection)", async () => {
    await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "P1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    await repository.createPrompt({
      tenantId: 1,
      projectId: 2,
      name: "P2 Prompt",
      slug: "p2-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const project1Prompts = await repository.findPrompts(1, 1);
    const project2Prompts = await repository.findPrompts(1, 2);

    expect(project1Prompts).toHaveLength(1);
    expect(project2Prompts).toHaveLength(1);
    expect(project1Prompts[0].projectId).toBe(1);
    expect(project2Prompts[0].projectId).toBe(2);
  });

  it("should return empty array when no prompts exist", async () => {
    const prompts = await repository.findPrompts(1, 1);

    expect(prompts).toEqual([]);
  });
});
