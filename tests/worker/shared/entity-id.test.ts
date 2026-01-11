import { describe, it, expect, vi } from "vitest";
import type { Context } from "hono";
import type { HonoEnv } from "../../../worker/routes/app";
import { EntityId } from "../../../worker/shared/entity-id";
import { ClientInputValidationError } from "../../../worker/shared/errors";

// Mock the auth middleware module
vi.mock("../../../worker/middleware/auth", () => ({
  getUserFromContext: vi.fn((c: Context<HonoEnv>) => c.get("user")),
}));

describe("EntityId", () => {
  // Helper to create a mock Hono context
  const createMockContext = (
    projectId: string,
    entityId: string,
    entityParamName: string = "evaluationId",
    user = { id: "user-123", tenantId: 1 }
  ): Context<HonoEnv> => {
    return {
      req: {
        param: (key: string) => {
          if (key === "projectId") return projectId;
          if (key === entityParamName) return entityId;
          return undefined;
        },
      },
      get: (key: string) => (key === "user" ? user : undefined),
    } as unknown as Context<HonoEnv>;
  };

  describe("parse with valid entity IDs", () => {
    it("parses valid evaluation ID", () => {
      const ctx = createMockContext("10", "42", "evaluationId");
      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.id).toBe(42);
      expect(entityId.projectId).toBe(10);
      expect(entityId.tenantId).toBe(1);
      expect(entityId.userId).toBe("user-123");
    });

    it("parses valid dataset ID", () => {
      const ctx = createMockContext("5", "99", "datasetId");
      const entityId = EntityId.parse(ctx, "datasetId");

      expect(entityId.id).toBe(99);
      expect(entityId.projectId).toBe(5);
      expect(entityId.tenantId).toBe(1);
      expect(entityId.userId).toBe("user-123");
    });

    it("parses with different user context", () => {
      const ctx = createMockContext("20", "100", "evaluationId", {
        id: "different-user",
        tenantId: 42,
      });
      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.id).toBe(100);
      expect(entityId.projectId).toBe(20);
      expect(entityId.tenantId).toBe(42);
      expect(entityId.userId).toBe("different-user");
    });

    it("parses large entity ID", () => {
      const ctx = createMockContext("1", "999999", "evaluationId");
      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.id).toBe(999999);
    });
  });

  describe("infers entity name from param name", () => {
    it("infers 'evaluation' from 'evaluationId'", () => {
      const ctx = createMockContext("10", "invalid", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid evaluation ID");
    });

    it("infers 'dataset' from 'datasetId'", () => {
      const ctx = createMockContext("10", "invalid", "datasetId");

      expect(() => EntityId.parse(ctx, "datasetId")).toThrow("Invalid dataset ID");
    });

    it("infers 'prompt' from 'promptId'", () => {
      const ctx = createMockContext("10", "invalid", "promptId");

      expect(() => EntityId.parse(ctx, "promptId")).toThrow("Invalid prompt ID");
    });

    it("handles param names without 'Id' suffix", () => {
      const ctx = createMockContext("10", "invalid", "custom");

      expect(() => EntityId.parse(ctx, "custom")).toThrow("Invalid custom ID");
    });
  });

  describe("validation errors for entity ID", () => {
    it("throws error for invalid entity ID (NaN)", () => {
      const ctx = createMockContext("10", "invalid", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid evaluation ID");
    });

    it("throws error for entity ID = 0", () => {
      const ctx = createMockContext("10", "0", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid evaluation ID");
    });

    it("throws error for negative entity ID", () => {
      const ctx = createMockContext("10", "-1", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid evaluation ID");
    });

    it("throws error for empty string", () => {
      const ctx = createMockContext("10", "", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid evaluation ID");
    });

    it("throws error for undefined param", () => {
      const ctx = {
        req: {
          param: (key: string) => (key === "projectId" ? "10" : undefined),
        },
        get: (key: string) => (key === "user" ? { id: "user-123", tenantId: 1 } : undefined),
      } as unknown as Context<HonoEnv>;

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid evaluation ID");
    });
  });

  describe("validation errors for project ID", () => {
    it("throws error when project ID is invalid", () => {
      const ctx = createMockContext("invalid", "42", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid project ID");
    });

    it("throws error when project ID is 0", () => {
      const ctx = createMockContext("0", "42", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid project ID");
    });

    it("throws error when project ID is negative", () => {
      const ctx = createMockContext("-5", "42", "evaluationId");

      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow(ClientInputValidationError);
      expect(() => EntityId.parse(ctx, "evaluationId")).toThrow("Invalid project ID");
    });
  });

  describe("edge cases", () => {
    it("handles floating point entity ID by truncating", () => {
      const ctx = createMockContext("10", "42.9", "evaluationId");
      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.id).toBe(42);
    });

    it("handles whitespace in entity ID", () => {
      const ctx = createMockContext("10", " 42 ", "evaluationId");
      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.id).toBe(42);
    });

    it("handles floating point project ID by truncating", () => {
      const ctx = createMockContext("10.5", "42", "evaluationId");
      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.projectId).toBe(10);
      expect(entityId.id).toBe(42);
    });

    it("handles case-insensitive Id suffix removal", () => {
      const ctx = createMockContext("10", "invalid", "customID");

      expect(() => EntityId.parse(ctx, "customID")).toThrow("Invalid custom ID");
    });
  });

  describe("multiple entity types", () => {
    it("parses different entity types with same user", () => {
      const user = { id: "same-user", tenantId: 5 };

      const evalCtx = createMockContext("10", "20", "evaluationId", user);
      const evaluationId = EntityId.parse(evalCtx, "evaluationId");

      const datasetCtx = createMockContext("10", "30", "datasetId", user);
      const datasetId = EntityId.parse(datasetCtx, "datasetId");

      expect(evaluationId.id).toBe(20);
      expect(evaluationId.projectId).toBe(10);
      expect(evaluationId.tenantId).toBe(5);
      expect(evaluationId.userId).toBe("same-user");

      expect(datasetId.id).toBe(30);
      expect(datasetId.projectId).toBe(10);
      expect(datasetId.tenantId).toBe(5);
      expect(datasetId.userId).toBe("same-user");
    });

    it("handles entities from different projects", () => {
      const user = { id: "user-1", tenantId: 1 };

      const ctx1 = createMockContext("10", "100", "evaluationId", user);
      const entity1 = EntityId.parse(ctx1, "evaluationId");

      const ctx2 = createMockContext("20", "200", "evaluationId", user);
      const entity2 = EntityId.parse(ctx2, "evaluationId");

      expect(entity1.projectId).toBe(10);
      expect(entity1.id).toBe(100);

      expect(entity2.projectId).toBe(20);
      expect(entity2.id).toBe(200);
    });
  });

  describe("real-world scenarios", () => {
    it("works with typical Hono context from evaluations route", () => {
      const ctx = {
        req: {
          param: (key: string) => {
            const params = { projectId: "123", evaluationId: "456" };
            return params[key as keyof typeof params];
          },
        },
        get: (key: string) => {
          if (key === "user") {
            return {
              id: "real-user-uuid",
              name: "Test User",
              email: "test@example.com",
              tenantId: 5,
              emailVerified: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return undefined;
        },
      } as unknown as Context<HonoEnv>;

      const entityId = EntityId.parse(ctx, "evaluationId");

      expect(entityId.id).toBe(456);
      expect(entityId.projectId).toBe(123);
      expect(entityId.tenantId).toBe(5);
      expect(entityId.userId).toBe("real-user-uuid");
    });

    it("parses multiple instances independently", () => {
      const user1 = { id: "user-1", tenantId: 1 };
      const user2 = { id: "user-2", tenantId: 2 };

      const ctx1 = createMockContext("10", "100", "evaluationId", user1);
      const ctx2 = createMockContext("20", "200", "datasetId", user2);

      const entityId1 = EntityId.parse(ctx1, "evaluationId");
      const entityId2 = EntityId.parse(ctx2, "datasetId");

      // Verify each instance is independent
      expect(entityId1.id).toBe(100);
      expect(entityId1.projectId).toBe(10);
      expect(entityId1.tenantId).toBe(1);
      expect(entityId1.userId).toBe("user-1");

      expect(entityId2.id).toBe(200);
      expect(entityId2.projectId).toBe(20);
      expect(entityId2.tenantId).toBe(2);
      expect(entityId2.userId).toBe("user-2");
    });
  });
});
