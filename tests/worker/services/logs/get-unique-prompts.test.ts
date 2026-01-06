import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { LogService } from "../../../../worker/services/logs.service";
import { applyMigrations } from "../../helpers/db-setup";
import { promptExecutionLogs, prompts, projects } from "../../../../worker/db/schema";

describe("LogService - getUniquePromptsForProject", () => {
  let logService: LogService;
  let db: ReturnType<typeof drizzle>;
  let testProjectId: number;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
    logService = new LogService(db, undefined, env.DB);

    // Create test project
    const [project] = await db
      .insert(projects)
      .values({
        name: "Test Project",
        slug: "test-project",
        tenantId: 1,
      })
      .returning();
    testProjectId = project.id;
  });

  it("should return unique prompts with their versions", async () => {
    // Create prompts
    const [prompt1] = await db
      .insert(prompts)
      .values({
        name: "Prompt A",
        slug: "prompt-a",
        tenantId: 1,
        projectId: testProjectId,
        latestVersion: 2,
        provider: "openai",
        model: "gpt-4",
        body: JSON.stringify({ messages: [] }),
      })
      .returning();

    const [prompt2] = await db
      .insert(prompts)
      .values({
        name: "Prompt B",
        slug: "prompt-b",
        tenantId: 1,
        projectId: testProjectId,
        latestVersion: 1,
        provider: "openai",
        model: "gpt-4",
        body: JSON.stringify({ messages: [] }),
      })
      .returning();

    // Create logs with different versions
    await db.insert(promptExecutionLogs).values([
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: prompt1.id,
        version: 1,
        isSuccess: true,
      },
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: prompt1.id,
        version: 2,
        isSuccess: true,
      },
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: prompt2.id,
        version: 1,
        isSuccess: true,
      },
    ]);

    const result = await logService.getUniquePromptsForProject(1, testProjectId);

    expect(result).toHaveLength(3);
    // Should be sorted by name, then version
    expect(result[0].promptName).toBe("Prompt A");
    expect(result[0].version).toBe(1);
    expect(result[1].promptName).toBe("Prompt A");
    expect(result[1].version).toBe(2);
    expect(result[2].promptName).toBe("Prompt B");
    expect(result[2].version).toBe(1);
  });

  it("should only return prompts for the specified tenant (cross-tenant protection)", async () => {
    // Create prompt for tenant 1
    const [prompt1] = await db
      .insert(prompts)
      .values({
        name: "Tenant 1 Prompt",
        slug: "t1-prompt",
        tenantId: 1,
        projectId: testProjectId,
        latestVersion: 1,
        provider: "openai",
        model: "gpt-4",
        body: JSON.stringify({ messages: [] }),
      })
      .returning();

    // Create log for tenant 1
    await db.insert(promptExecutionLogs).values({
      tenantId: 1,
      projectId: testProjectId,
      promptId: prompt1.id,
      version: 1,
      isSuccess: true,
    });

    // Create log for different tenant (but same project/prompt - simulating cross-tenant violation)
    await db.insert(promptExecutionLogs).values({
      tenantId: 2,
      projectId: testProjectId,
      promptId: prompt1.id,
      version: 1,
      isSuccess: true,
    });

    const result = await logService.getUniquePromptsForProject(1, testProjectId);

    expect(result).toHaveLength(1);
    expect(result[0].promptName).toBe("Tenant 1 Prompt");

    // Verify using direct SQL
    const allLogs = await env.DB.prepare("SELECT * FROM PromptExecutionLogs").all();
    expect(allLogs.results).toHaveLength(2);
  });

  it("should return empty array when no logs exist", async () => {
    const result = await logService.getUniquePromptsForProject(1, testProjectId);
    expect(result).toEqual([]);
  });

  it("should handle prompts with multiple versions correctly", async () => {
    const [prompt] = await db
      .insert(prompts)
      .values({
        name: "Multi-Version Prompt",
        slug: "multi-version",
        tenantId: 1,
        projectId: testProjectId,
        latestVersion: 3,
        provider: "openai",
        model: "gpt-4",
        body: JSON.stringify({ messages: [] }),
      })
      .returning();

    // Create logs for versions 1, 2, and 3
    await db.insert(promptExecutionLogs).values([
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: prompt.id,
        version: 3,
        isSuccess: true,
      },
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: prompt.id,
        version: 1,
        isSuccess: true,
      },
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: prompt.id,
        version: 2,
        isSuccess: true,
      },
    ]);

    const result = await logService.getUniquePromptsForProject(1, testProjectId);

    expect(result).toHaveLength(3);
    // Should be sorted by version ascending
    expect(result[0].version).toBe(1);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(3);
  });
});
