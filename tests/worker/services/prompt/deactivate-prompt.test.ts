import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../../worker/services/prompt.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptService - deactivatePrompt", () => {
  let promptService: PromptService;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize service with drizzle instance
    const db = drizzle(env.DB);
    promptService = new PromptService(db);
  });

  it("should deactivate prompt when IDs match", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    expect(created.isActive).toBe(true);

    await promptService.deactivatePrompt(1, 1, created.id);

    // Verify using direct SQL
    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(0); // SQLite stores false as 0
  });

  it("should not deactivate prompt when tenantId does not match (cross-tenant protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    expect(created.isActive).toBe(true);

    // Try to deactivate with tenant 2 (should fail silently)
    await promptService.deactivatePrompt(2, 1, created.id);

    // Verify prompt is still active
    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(1); // Still active
  });

  it("should not deactivate prompt when projectId does not match (cross-project protection)", async () => {
    const created = await promptService.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
    });

    expect(created.isActive).toBe(true);

    // Try to deactivate with project 2 (should fail silently)
    await promptService.deactivatePrompt(1, 2, created.id);

    // Verify prompt is still active
    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    ).bind(created.id).first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(1); // Still active
  });
});
