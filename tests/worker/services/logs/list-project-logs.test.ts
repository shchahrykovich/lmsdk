import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { LogService } from "../../../../worker/services/logs.service";
import { applyMigrations } from "../../helpers/db-setup";
import { promptExecutionLogs, prompts, projects } from "../../../../worker/db/schema";

describe("LogService - listProjectLogs", () => {
  let logService: LogService;
  let db: ReturnType<typeof drizzle>;
  let testProjectId: number;
  let testPromptId: number;

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

    // Create test prompt
    const [prompt] = await db
      .insert(prompts)
      .values({
        name: "Test Prompt",
        slug: "test-prompt",
        tenantId: 1,
        projectId: testProjectId,
        latestVersion: 1,
        provider: "openai",
        model: "gpt-4",
        body: JSON.stringify({ messages: [] }),
      })
      .returning();
    testPromptId = prompt.id;

    // Create test logs
    await db.insert(promptExecutionLogs).values([
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: testPromptId,
        version: 1,
        isSuccess: true,
        durationMs: 100,
      },
      {
        tenantId: 1,
        projectId: testProjectId,
        promptId: testPromptId,
        version: 1,
        isSuccess: false,
        errorMessage: "Test error",
        durationMs: 200,
      },
    ]);
  });

  it("should return logs with default sorting (createdAt desc)", async () => {
    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
    });

    expect(result.logs).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
  });

  it("should return logs with explicit undefined sort parameter", async () => {
    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
      sort: undefined,
    });

    expect(result.logs).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("should return logs sorted by createdAt asc", async () => {
    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
      sort: { field: "createdAt", direction: "asc" },
    });

    expect(result.logs).toHaveLength(2);
  });

  it("should return logs sorted by durationMs desc", async () => {
    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
      sort: { field: "durationMs", direction: "desc" },
    });

    expect(result.logs).toHaveLength(2);
    // Logs should be sorted by durationMs descending (200, then 100)
    expect(result.logs[0].durationMs).toBe(200);
    expect(result.logs[1].durationMs).toBe(100);
  });

  it("should return logs sorted by isSuccess asc", async () => {
    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
      sort: { field: "isSuccess", direction: "asc" },
    });

    expect(result.logs).toHaveLength(2);
    // false (0) should come before true (1)
    expect(result.logs[0].isSuccess).toBe(false);
    expect(result.logs[1].isSuccess).toBe(true);
  });

  it("should filter logs by success status", async () => {
    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
      filters: { isSuccess: true },
    });

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0].isSuccess).toBe(true);
  });

  it("should only return logs for the specified tenant (cross-tenant protection)", async () => {
    // Create log for different tenant
    await db.insert(promptExecutionLogs).values({
      tenantId: 2,
      projectId: testProjectId,
      promptId: testPromptId,
      version: 1,
      isSuccess: true,
    });

    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
    });

    // Should only return logs for tenant 1 (the 2 created in beforeEach)
    expect(result.logs).toHaveLength(2);
    expect(result.total).toBe(2);

    // Verify using direct SQL that there are actually 3 logs total
    const allLogs = await env.DB.prepare("SELECT * FROM PromptExecutionLogs").all();
    expect(allLogs.results).toHaveLength(3);

    // Verify the service correctly filtered by tenantId
    const tenant1Logs = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ?"
    ).bind(1).all();
    expect(tenant1Logs.results).toHaveLength(2);
  });

  it("should handle pagination correctly", async () => {
    // Create more logs
    for (let i = 0; i < 10; i++) {
      await db.insert(promptExecutionLogs).values({
        tenantId: 1,
        projectId: testProjectId,
        promptId: testPromptId,
        version: 1,
        isSuccess: true,
      });
    }

    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 2,
      pageSize: 5,
    });

    expect(result.logs).toHaveLength(5);
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    expect(result.totalPages).toBe(3);
  });

  it("should handle invalid sort field gracefully (fallback to createdAt desc)", async () => {
    // This simulates what happens when an invalid sortField comes from URL params
    // due to type casting in the router
    const invalidSort = { field: "invalidField" as any, direction: "desc" as const };

    const result = await logService.listProjectLogs({
      tenantId: 1,
      projectId: testProjectId,
      page: 1,
      pageSize: 10,
      sort: invalidSort,
    });

    // Should not throw an error and should return results
    expect(result.logs).toHaveLength(2);
    expect(result.total).toBe(2);
  });
});
