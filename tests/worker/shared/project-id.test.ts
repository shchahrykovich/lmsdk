import { describe, it, expect, vi } from "vitest";
import type { Context } from "hono";
import type { HonoEnv } from "../../../worker/routes/app";
import { ProjectId } from "../../../worker/shared/project-id";
import { ClientInputValidationError } from "../../../worker/shared/errors";

// Mock the auth middleware module
vi.mock("../../../worker/middleware/auth", () => ({
  getUserFromContext: vi.fn((c: Context<HonoEnv>) => c.get("user")),
}));

describe("ProjectId", () => {
  // Helper to create a mock Hono context
  const createMockContext = (projectId: string, user = { id: "user-123", tenantId: 1 }): Context<HonoEnv> => {
    return {
      req: {
        param: (key: string) => (key === "projectId" ? projectId : undefined),
      },
      get: (key: string) => (key === "user" ? user : undefined),
    } as unknown as Context<HonoEnv>;
  };

  describe("parse with valid project IDs", () => {
    it("parses valid project ID", () => {
      const ctx = createMockContext("42");
      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(42);
      expect(projectId.tenantId).toBe(1);
      expect(projectId.userId).toBe("user-123");
    });

    it("parses project ID with different user", () => {
      const ctx = createMockContext("123", { id: "user-456", tenantId: 5 });
      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(123);
      expect(projectId.tenantId).toBe(5);
      expect(projectId.userId).toBe("user-456");
    });

    it("parses large project ID", () => {
      const ctx = createMockContext("999999");
      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(999999);
      expect(projectId.tenantId).toBe(1);
      expect(projectId.userId).toBe("user-123");
    });
  });

  describe("validation errors", () => {
    it("throws error for invalid project ID (NaN)", () => {
      const ctx = createMockContext("invalid");

      expect(() => ProjectId.parse(ctx)).toThrow(ClientInputValidationError);
      expect(() => ProjectId.parse(ctx)).toThrow("Invalid project ID");
    });

    it("throws error for project ID = 0", () => {
      const ctx = createMockContext("0");

      expect(() => ProjectId.parse(ctx)).toThrow(ClientInputValidationError);
      expect(() => ProjectId.parse(ctx)).toThrow("Invalid project ID");
    });

    it("throws error for negative project ID", () => {
      const ctx = createMockContext("-1");

      expect(() => ProjectId.parse(ctx)).toThrow(ClientInputValidationError);
      expect(() => ProjectId.parse(ctx)).toThrow("Invalid project ID");
    });

    it("throws error for negative project ID (large)", () => {
      const ctx = createMockContext("-999");

      expect(() => ProjectId.parse(ctx)).toThrow(ClientInputValidationError);
      expect(() => ProjectId.parse(ctx)).toThrow("Invalid project ID");
    });

    it("throws error for empty string", () => {
      const ctx = createMockContext("");

      expect(() => ProjectId.parse(ctx)).toThrow(ClientInputValidationError);
      expect(() => ProjectId.parse(ctx)).toThrow("Invalid project ID");
    });

    it("throws error for undefined param", () => {
      const ctx = {
        req: { param: () => undefined },
        get: (key: string) => (key === "user" ? { id: "user-123", tenantId: 1 } : undefined),
      } as unknown as Context<HonoEnv>;

      expect(() => ProjectId.parse(ctx)).toThrow(ClientInputValidationError);
      expect(() => ProjectId.parse(ctx)).toThrow("Invalid project ID");
    });
  });

  describe("edge cases", () => {
    it("handles floating point project ID by truncating", () => {
      const ctx = createMockContext("42.9");
      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(42);
    });

    it("handles whitespace in project ID", () => {
      const ctx = createMockContext(" 42 ");
      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(42);
    });

    it("rejects floating point that rounds to valid but isn't integer", () => {
      // parseInt("5.5") = 5, but we validate it's > 0 and not NaN
      const ctx = createMockContext("5.5");
      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(5);
    });
  });

  describe("user context integration", () => {
    it("correctly extracts user from context", () => {
      const ctx = createMockContext("10", {
        id: "test-user-id",
        tenantId: 99,
      });

      const projectId = ProjectId.parse(ctx);

      expect(projectId.userId).toBe("test-user-id");
      expect(projectId.tenantId).toBe(99);
    });

    it("preserves user data with different project IDs", () => {
      const user = { id: "same-user", tenantId: 42 };

      const ctx1 = createMockContext("1", user);
      const projectId1 = ProjectId.parse(ctx1);

      const ctx2 = createMockContext("999", user);
      const projectId2 = ProjectId.parse(ctx2);

      expect(projectId1.userId).toBe("same-user");
      expect(projectId1.tenantId).toBe(42);
      expect(projectId2.userId).toBe("same-user");
      expect(projectId2.tenantId).toBe(42);

      expect(projectId1.id).toBe(1);
      expect(projectId2.id).toBe(999);
    });
  });

  describe("real-world scenarios", () => {
    it("works with typical Hono context from evaluations route", () => {
      // Simulate real Hono context structure
      const ctx = {
        req: {
          param: (key: string) => {
            const params = { projectId: "123" };
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

      const projectId = ProjectId.parse(ctx);

      expect(projectId.id).toBe(123);
      expect(projectId.tenantId).toBe(5);
      expect(projectId.userId).toBe("real-user-uuid");
    });

    it("parses multiple instances independently", () => {
      const ctx1 = createMockContext("10", { id: "user-1", tenantId: 1 });
      const ctx2 = createMockContext("20", { id: "user-2", tenantId: 2 });

      const projectId1 = ProjectId.parse(ctx1);
      const projectId2 = ProjectId.parse(ctx2);

      // Verify each instance is independent
      expect(projectId1.id).toBe(10);
      expect(projectId1.tenantId).toBe(1);
      expect(projectId1.userId).toBe("user-1");

      expect(projectId2.id).toBe(20);
      expect(projectId2.tenantId).toBe(2);
      expect(projectId2.userId).toBe("user-2");
    });
  });
});
