import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptRepository } from "../../../../worker/repositories/prompt.repository";
import { applyMigrations } from "../../helpers/db-setup";
import type { Prompt } from "../../../../worker/db/schema";

describe("PromptRepository - deactivatePrompt", () => {
  let repository: PromptRepository;

  beforeEach(async () => {
    // Apply migrations before each test for clean state
    await applyMigrations();

    // Initialize repository with drizzle instance
    const db = drizzle(env.DB);
    repository = new PromptRepository(db);
  });

  it("should deactivate prompt when IDs match", async () => {
    const created = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    expect(created.isActive).toBe(true);

    await repository.deactivatePrompt(1, 1, created.id);

    // Verify using direct SQL (NOT ORM) - repository tests validate actual DB state
    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    )
      .bind(created.id)
      .first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(0); // SQLite stores false as 0
  });

  it("should not deactivate prompt when tenantId does not match (cross-tenant protection)", async () => {
    const created = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Tenant 1 Prompt",
      slug: "t1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    expect(created.isActive).toBe(true);

    // Try to deactivate with tenant 2 (should fail silently)
    await repository.deactivatePrompt(2, 1, created.id);

    // Verify prompt is still active using direct SQL
    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    )
      .bind(created.id)
      .first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(1); // Still active
  });

  it("should not deactivate prompt when projectId does not match (cross-project protection)", async () => {
    const created = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Project 1 Prompt",
      slug: "p1-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    expect(created.isActive).toBe(true);

    // Try to deactivate with project 2 (should fail silently)
    await repository.deactivatePrompt(1, 2, created.id);

    // Verify prompt is still active using direct SQL
    const dbPrompt = await env.DB.prepare(
      "SELECT isActive FROM Prompts WHERE id = ?"
    )
      .bind(created.id)
      .first<{ isActive: number }>();

    expect(dbPrompt?.isActive).toBe(1); // Still active
  });

  it("should update updatedAt timestamp when deactivating", async () => {
    const created = await repository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Test Prompt",
      slug: "test-prompt",
      provider: "openai",
      model: "gpt-4",
      body: "{}",
      latestVersion: 1,
      isActive: true,
    });

    const originalUpdatedAt = created.updatedAt;

    // Wait a moment to ensure timestamp changes
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await repository.deactivatePrompt(1, 1, created.id);

    // Verify updatedAt changed using direct SQL
    const dbPrompt = await env.DB.prepare(
      "SELECT updatedAt FROM Prompts WHERE id = ?"
    )
      .bind(created.id)
      .first<{ updatedAt: number }>();

    expect(dbPrompt?.updatedAt).toBeGreaterThan(
      Math.floor(originalUpdatedAt.getTime() / 1000)
    );
  });
});
