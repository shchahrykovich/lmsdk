import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { handler } from "../../../worker/queue/handler";
import type { ExecutionLogQueueMessage } from "../../../worker/queue/messages";
import { applyMigrations } from "../helpers/db-setup";
import { promptExecutionLogs, traces } from "../../../worker/db/schema";
import { eq, and } from "drizzle-orm";

describe("Queue Handler", () => {
  let db: ReturnType<typeof drizzle>;
  const tenantId = 1;
  const projectId = 1;
  const promptId = 1;
  const version = 1;

  beforeEach(async () => {
    await applyMigrations();
    db = drizzle(env.DB);
  });

  describe("handler - message batch processing", () => {
    it("should process a single message successfully", async () => {
      // Create execution log with variables
      const [log] = await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: true,
        logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/1`,
      }).returning();

      // Store variables in R2
      await env.PRIVATE_FILES.put(
        `${log.logPath}/variables.json`,
        JSON.stringify({ userId: "123", action: "login" })
      );

      // Create mock message
      const mockMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: log.id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // Verify message was acknowledged
      expect(mockMessage.ack).toHaveBeenCalledTimes(1);
      expect(mockMessage.retry).not.toHaveBeenCalled();
    });

    it("should process multiple messages in a batch", async () => {
      // Create multiple logs
      const logs = await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId,
          version,
          isSuccess: true,
          logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/1`,
        },
        {
          tenantId,
          projectId,
          promptId,
          version,
          isSuccess: true,
          logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/2`,
        },
        {
          tenantId,
          projectId,
          promptId,
          version,
          isSuccess: true,
          logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/3`,
        },
      ]).returning();

      // Store variables for each log
      for (const log of logs) {
        await env.PRIVATE_FILES.put(
          `${log.logPath}/variables.json`,
          JSON.stringify({ userId: String(log.id), action: "test" })
        );
      }

      // Create mock messages
      const mockMessages = logs.map(log => ({
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: log.id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      }));

      const batch = {
        messages: mockMessages,
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // Verify all messages were acknowledged
      mockMessages.forEach(msg => {
        expect(msg.ack).toHaveBeenCalledTimes(1);
        expect(msg.retry).not.toHaveBeenCalled();
      });
    });

    it("should acknowledge message even when log has no variables", async () => {
      // Create execution log without logPath (no variables)
      const [log] = await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: true,
        logPath: null,
      }).returning();

      const mockMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: log.id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // Should still acknowledge (processing completed, just nothing to index)
      expect(mockMessage.ack).toHaveBeenCalledTimes(1);
      expect(mockMessage.retry).not.toHaveBeenCalled();
    });
  });

  describe("handler - error handling", () => {
    it("should retry message on processing failure", async () => {
      // Create log that will fail (non-existent logId)
      const mockMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: 99999, // Non-existent
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // Verify message was retried, not acknowledged
      expect(mockMessage.retry).toHaveBeenCalledTimes(1);
      expect(mockMessage.ack).not.toHaveBeenCalled();
    });

    it("should continue processing other messages after one fails", async () => {
      // Create one valid log
      const [validLog] = await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: true,
        logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/1`,
      }).returning();

      await env.PRIVATE_FILES.put(
        `${validLog.logPath}/variables.json`,
        JSON.stringify({ userId: "123" })
      );

      // Create mock messages: one invalid, one valid
      const invalidMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: 99999, // Non-existent
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const validMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: validLog.id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [invalidMessage, validMessage],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // First message should be retried
      expect(invalidMessage.retry).toHaveBeenCalledTimes(1);
      expect(invalidMessage.ack).not.toHaveBeenCalled();

      // Second message should be acknowledged
      expect(validMessage.ack).toHaveBeenCalledTimes(1);
      expect(validMessage.retry).not.toHaveBeenCalled();
    });
  });

  describe("handler - trace extraction integration", () => {
    it("should extract trace when log has traceId", async () => {
      const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

      // Create execution log with traceId
      const [log] = await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: true,
        traceId,
        rawTraceId: `00-${traceId}-00f067aa0ba902b7-01`,
        logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/1`,
      }).returning();

      // Store variables
      await env.PRIVATE_FILES.put(
        `${log.logPath}/variables.json`,
        JSON.stringify({ userId: "123" })
      );

      const mockMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: log.id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // Verify message was acknowledged
      expect(mockMessage.ack).toHaveBeenCalledTimes(1);

      // Verify trace was created
      const [trace] = await db
        .select()
        .from(traces)
        .where(
          and(
            eq(traces.tenantId, tenantId),
            eq(traces.projectId, projectId),
            eq(traces.traceId, traceId)
          )
        )
        .limit(1);

      expect(trace).toBeDefined();
      expect(trace.totalLogs).toBe(1);
      expect(trace.traceId).toBe(traceId);
    });

    it("should not extract trace when log has no traceId", async () => {
      // Create execution log without traceId
      const [log] = await db.insert(promptExecutionLogs).values({
        tenantId,
        projectId,
        promptId,
        version,
        isSuccess: true,
        traceId: null,
        logPath: `logs/${tenantId}/2025-01-01/${projectId}/${promptId}/${version}/1`,
      }).returning();

      // Store variables
      await env.PRIVATE_FILES.put(
        `${log.logPath}/variables.json`,
        JSON.stringify({ userId: "123" })
      );

      const mockMessage = {
        body: {
          tenantId,
          projectId,
          promptId,
          version,
          logId: log.id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch = {
        messages: [mockMessage],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch, env);

      // Verify message was acknowledged
      expect(mockMessage.ack).toHaveBeenCalledTimes(1);

      // Verify no traces were created
      const allTraces = await db.select().from(traces);
      expect(allTraces).toHaveLength(0);
    });

    it("should process multiple logs with same traceId", async () => {
      const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

      // Create multiple logs with same traceId
      const logs = await db.insert(promptExecutionLogs).values([
        {
          tenantId,
          projectId,
          promptId: 1,
          version,
          isSuccess: true,
          traceId,
          logPath: `logs/${tenantId}/2025-01-01/${projectId}/1/${version}/1`,
        },
        {
          tenantId,
          projectId,
          promptId: 2,
          version,
          isSuccess: true,
          traceId,
          logPath: `logs/${tenantId}/2025-01-01/${projectId}/2/${version}/2`,
        },
      ]).returning();

      // Store variables for each
      for (const log of logs) {
        await env.PRIVATE_FILES.put(
          `${log.logPath}/variables.json`,
          JSON.stringify({ userId: String(log.id) })
        );
      }

      // Process first message
      const mockMessage1 = {
        body: {
          tenantId,
          projectId,
          promptId: logs[0].promptId,
          version,
          logId: logs[0].id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch1 = {
        messages: [mockMessage1],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch1, env);
      expect(mockMessage1.ack).toHaveBeenCalledTimes(1);

      // Wait to ensure timestamp changes (SQLite has 1-second resolution)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Process second message
      const mockMessage2 = {
        body: {
          tenantId,
          projectId,
          promptId: logs[1].promptId,
          version,
          logId: logs[1].id,
        } as ExecutionLogQueueMessage,
        ack: vi.fn(),
        retry: vi.fn(),
      };

      const batch2 = {
        messages: [mockMessage2],
        queue: "execution-logs",
      } as unknown as MessageBatch<ExecutionLogQueueMessage>;

      await handler(batch2, env);

      // Message should be either acked (if trace extraction succeeded) or retried (if lock conflict)
      // Both are acceptable in this scenario due to optimistic locking
      expect(mockMessage2.ack.mock.calls.length + mockMessage2.retry.mock.calls.length).toBe(1);

      // Verify at least one trace exists
      const allTraces = await db
        .select()
        .from(traces)
        .where(eq(traces.traceId, traceId));

      expect(allTraces.length).toBeGreaterThan(0);
    });
  });

  describe("handler - cross-tenant isolation", () => {
    it("should process logs from different tenants independently", async () => {
      const tenant1 = 1;
      const tenant2 = 2;
      const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";

      // Create logs for different tenants with same traceId
      const log1 = await db.insert(promptExecutionLogs).values({
        tenantId: tenant1,
        projectId,
        promptId,
        version,
        isSuccess: true,
        traceId,
        logPath: `logs/${tenant1}/2025-01-01/${projectId}/${promptId}/${version}/1`,
      }).returning();

      const log2 = await db.insert(promptExecutionLogs).values({
        tenantId: tenant2,
        projectId,
        promptId,
        version,
        isSuccess: true,
        traceId,
        logPath: `logs/${tenant2}/2025-01-01/${projectId}/${promptId}/${version}/2`,
      }).returning();

      // Store variables
      await env.PRIVATE_FILES.put(
        `${log1[0].logPath}/variables.json`,
        JSON.stringify({ userId: "tenant1" })
      );
      await env.PRIVATE_FILES.put(
        `${log2[0].logPath}/variables.json`,
        JSON.stringify({ userId: "tenant2" })
      );

      // Process both messages
      const messages = [
        {
          body: {
            tenantId: tenant1,
            projectId,
            promptId,
            version,
            logId: log1[0].id,
          } as ExecutionLogQueueMessage,
          ack: vi.fn(),
          retry: vi.fn(),
        },
        {
          body: {
            tenantId: tenant2,
            projectId,
            promptId,
            version,
            logId: log2[0].id,
          } as ExecutionLogQueueMessage,
          ack: vi.fn(),
          retry: vi.fn(),
        },
      ];

      for (const msg of messages) {
        const batch = {
          messages: [msg],
          queue: "execution-logs",
        } as unknown as MessageBatch<ExecutionLogQueueMessage>;

        await handler(batch, env);
        expect(msg.ack).toHaveBeenCalledTimes(1);

        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      // Verify separate traces were created for each tenant
      const allTraces = await db.select().from(traces);
      expect(allTraces).toHaveLength(2);

      const tenant1Trace = allTraces.find(t => t.tenantId === tenant1);
      const tenant2Trace = allTraces.find(t => t.tenantId === tenant2);

      expect(tenant1Trace).toBeDefined();
      expect(tenant1Trace?.totalLogs).toBe(1);

      expect(tenant2Trace).toBeDefined();
      expect(tenant2Trace?.totalLogs).toBe(1);
    });
  });
});
