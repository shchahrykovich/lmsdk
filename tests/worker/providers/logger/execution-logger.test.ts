import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { applyMigrations } from "../../helpers/db-setup";
import type { ExecutionLogQueueMessage } from "../../../../worker/queue/messages";
import {CFPromptExecutionLogger} from "../../../../worker/providers/logger/c-f-prompt-execution-logger";
import {NullPromptExecutionLogger} from "../../../../worker/providers/logger/null-prompt-execution-logger";

// Mock queue for testing
class MockQueue implements Queue {
  public messages: ExecutionLogQueueMessage[] = [];

  async send(message: ExecutionLogQueueMessage): Promise<void> {
    this.messages.push(message);
  }

  async sendBatch(_messages: Iterable<MessageSendRequest>): Promise<void> {
    throw new Error("Not implemented");
  }
}

describe("NullPromptExecutionLogger", () => {
  let logger: NullPromptExecutionLogger;

  beforeEach(() => {
    logger = new NullPromptExecutionLogger();
  });

  it("should not throw on logSuccess", async () => {
    await expect(
      logger.logSuccess({
        tenantId: 1,
        projectId: 1,
        promptId: 1,
        version: 1,
        durationMs: 100,
      })
    ).resolves.not.toThrow();
  });

  it("should not throw on logError", async () => {
    await expect(
      logger.logError({
        tenantId: 1,
        projectId: 1,
        promptId: 1,
        version: 1,
        durationMs: 100,
        errorMessage: "Test error",
      })
    ).resolves.not.toThrow();
  });
});

describe("CFPromptExecutionLogger", () => {
  let logger: CFPromptExecutionLogger;
  let mockQueue: MockQueue;

  beforeEach(async () => {
    await applyMigrations();
    const db = drizzle(env.DB);
    mockQueue = new MockQueue();
    logger = new CFPromptExecutionLogger(db, env.PRIVATE_FILES, mockQueue);
  });

  it("should log successful execution with explicit params", async () => {
    await logger.logSuccess({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 1,
      durationMs: 150,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify log was created using direct SQL
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND projectId = ? AND promptId = ?"
    )
      .bind(1, 2, 3)
      .first();

    expect(logResult).toBeDefined();
    expect(logResult?.tenantId).toBe(1);
    expect(logResult?.projectId).toBe(2);
    expect(logResult?.promptId).toBe(3);
    expect(logResult?.version).toBe(1);
    expect(logResult?.isSuccess).toBe(1); // SQLite boolean
    expect(logResult?.durationMs).toBe(150);
    expect(logResult?.errorMessage).toBeNull();
  });

  it("should log successful execution using setContext", async () => {
    logger.setContext({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 1,
    });

    await logger.logSuccess({
      durationMs: 150,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify log was created using direct SQL
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND projectId = ? AND promptId = ?"
    )
      .bind(1, 2, 3)
      .first();

    expect(logResult).toBeDefined();
    expect(logResult?.tenantId).toBe(1);
    expect(logResult?.projectId).toBe(2);
    expect(logResult?.promptId).toBe(3);
    expect(logResult?.version).toBe(1);
    expect(logResult?.isSuccess).toBe(1);
    expect(logResult?.durationMs).toBe(150);
  });

  it("should log error execution with explicit params", async () => {
    await logger.logError({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 1,
      durationMs: 50,
      errorMessage: "Provider timeout",
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify error log was created using direct SQL
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND projectId = ? AND promptId = ?"
    )
      .bind(1, 2, 3)
      .first();

    expect(logResult).toBeDefined();
    expect(logResult?.tenantId).toBe(1);
    expect(logResult?.projectId).toBe(2);
    expect(logResult?.promptId).toBe(3);
    expect(logResult?.version).toBe(1);
    expect(logResult?.isSuccess).toBe(0); // SQLite boolean false
    expect(logResult?.durationMs).toBe(50);
    expect(logResult?.errorMessage).toBe("Provider timeout");
  });

  it("should log error execution using setContext", async () => {
    logger.setContext({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 1,
    });

    await logger.logError({
      durationMs: 50,
      errorMessage: "Provider timeout",
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify error log was created using direct SQL
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND projectId = ? AND promptId = ?"
    )
      .bind(1, 2, 3)
      .first();

    expect(logResult).toBeDefined();
    expect(logResult?.tenantId).toBe(1);
    expect(logResult?.projectId).toBe(2);
    expect(logResult?.promptId).toBe(3);
    expect(logResult?.version).toBe(1);
    expect(logResult?.isSuccess).toBe(0);
    expect(logResult?.durationMs).toBe(50);
    expect(logResult?.errorMessage).toBe("Provider timeout");
  });

  it("should throw error when context is missing", async () => {
    await expect(
      logger.logSuccess({ durationMs: 100 })
    ).rejects.toThrow("Missing required context");

    await expect(
      logger.logError({ durationMs: 100, errorMessage: "Error" })
    ).rejects.toThrow("Missing required context");
  });

  it("should allow overriding context with explicit params", async () => {
    logger.setContext({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
    });

    await logger.logSuccess({
      tenantId: 2,
      projectId: 2,
      promptId: 2,
      version: 2,
      durationMs: 100,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify log was created with overridden values
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND projectId = ? AND promptId = ?"
    )
      .bind(2, 2, 2)
      .first();

    expect(logResult).toBeDefined();
    expect(logResult?.tenantId).toBe(2);
    expect(logResult?.projectId).toBe(2);
    expect(logResult?.promptId).toBe(2);
    expect(logResult?.version).toBe(2);
  });

  it("should create multiple logs for same prompt", async () => {
    await logger.logSuccess({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 100,
    });

    await logger.logSuccess({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 200,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify both logs were created using direct SQL
    const logsResult = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM PromptExecutionLogs WHERE tenantId = ? AND promptId = ?"
    )
      .bind(1, 1)
      .first();

    expect(logsResult?.count).toBe(2);
  });

  it("should maintain tenant isolation", async () => {
    await logger.logSuccess({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 100,
    });

    await logger.logSuccess({
      tenantId: 2,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 100,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify tenant 1 has 1 log
    const tenant1Logs = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM PromptExecutionLogs WHERE tenantId = ?"
    )
      .bind(1)
      .first();

    // Verify tenant 2 has 1 log
    const tenant2Logs = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM PromptExecutionLogs WHERE tenantId = ?"
    )
      .bind(2)
      .first();

    expect(tenant1Logs?.count).toBe(1);
    expect(tenant2Logs?.count).toBe(1);
  });

  it("should record different versions", async () => {
    await logger.logSuccess({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 100,
    });

    await logger.logSuccess({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 2,
      durationMs: 150,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify version 1 log
    const v1Log = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND promptId = ? AND version = ?"
    )
      .bind(1, 1, 1)
      .first();

    // Verify version 2 log
    const v2Log = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND promptId = ? AND version = ?"
    )
      .bind(1, 1, 2)
      .first();

    expect(v1Log?.version).toBe(1);
    expect(v1Log?.durationMs).toBe(100);
    expect(v2Log?.version).toBe(2);
    expect(v2Log?.durationMs).toBe(150);
  });

  it("should handle long error messages", async () => {
    const longError = "A".repeat(1000);

    await logger.logError({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 50,
      errorMessage: longError,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    // Verify error message was stored
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND promptId = ?"
    )
      .bind(1, 1)
      .first();

    expect(logResult?.errorMessage).toBe(longError);
    expect(logResult?.errorMessage?.length).toBe(1000);
  });

  it("should record timestamp automatically", async () => {
    const beforeTime = Math.floor(Date.now() / 1000);

    await logger.logSuccess({
      tenantId: 1,
      projectId: 1,
      promptId: 1,
      version: 1,
      durationMs: 100,
    });

    // Wait for deferred operations to complete
    await logger.finish();

    const afterTime = Math.floor(Date.now() / 1000);

    // Verify timestamp is within expected range
    const logResult = await env.DB.prepare(
      "SELECT * FROM PromptExecutionLogs WHERE tenantId = ? AND promptId = ?"
    )
      .bind(1, 1)
      .first();

    expect(logResult?.createdAt).toBeGreaterThanOrEqual(beforeTime);
    expect(logResult?.createdAt).toBeLessThanOrEqual(afterTime);
  });

  it("should send queue message on finish after successful execution", async () => {
    await logger.logSuccess({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 4,
      durationMs: 150,
    });

    expect(mockQueue.messages).toHaveLength(0);

    await logger.finish();

    expect(mockQueue.messages).toHaveLength(1);
    const message = mockQueue.messages[0];
    expect(message.tenantId).toBe(1);
    expect(message.projectId).toBe(2);
    expect(message.promptId).toBe(3);
    expect(message.version).toBe(4);
    expect(message.logId).toBeGreaterThan(0);
    // Note: isSuccess and durationMs are stored in the DB, not in the queue message
  });

  it("should send queue message on finish after error execution", async () => {
    await logger.logError({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 4,
      durationMs: 50,
      errorMessage: "Test error",
    });

    expect(mockQueue.messages).toHaveLength(0);

    await logger.finish();

    expect(mockQueue.messages).toHaveLength(1);
    const message = mockQueue.messages[0];
    expect(message.tenantId).toBe(1);
    expect(message.projectId).toBe(2);
    expect(message.promptId).toBe(3);
    expect(message.version).toBe(4);
    expect(message.logId).toBeGreaterThan(0);
    // Note: isSuccess, durationMs, and errorMessage are stored in the DB, not in the queue message
  });

  it("should include input/output/variables in R2 storage (not in queue message)", async () => {
    logger.setContext({
      tenantId: 1,
      projectId: 2,
      promptId: 3,
      version: 1,
    });

    await logger.logInput({
      input: {
        model: "gpt-4",
        messages: [{ role: "user", content: "test" }],
      },
    });

    await logger.logOutput({
      output: { content: "response" },
    });

    await logger.logVariables({
      variables: { name: "Alice" },
    });

    await logger.logSuccess({ durationMs: 200 });

    await logger.finish();

    expect(mockQueue.messages).toHaveLength(1);
    const message = mockQueue.messages[0];
    // Queue message only contains identifiers for background processing
    expect(message.tenantId).toBe(1);
    expect(message.projectId).toBe(2);
    expect(message.promptId).toBe(3);
    expect(message.version).toBe(1);
    expect(message.logId).toBeGreaterThan(0);
    // Note: input/output/variables are saved to R2 during logInput/logOutput/logVariables
    // They are not included in the queue message
  });
});
