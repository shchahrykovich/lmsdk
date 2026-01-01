import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { randomBytes } from "node:crypto";
import { applyMigrations } from "../../helpers/db-setup";
import { tenants, user } from "../../../../worker/db/schema";
import { createPostSignUpHook } from "../../../../worker/utils/auth-helpers";

// Mock better-auth middleware wrapper
vi.mock("better-auth/api", () => ({
  createAuthMiddleware: (fn: unknown) => fn,
}));

describe("createPostSignUpHook", () => {
  beforeEach(async () => {
    await applyMigrations();
  });

  describe("when multiple tenants are allowed", () => {
    it("should create tenant and assign to user on sign-up", async () => {
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(4).toString("hex")}`;

      // Create user
      await db.insert(user).values({
        id: userId,
        email: `${userId}@example.com`,
        name: "Test User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create hook with multiple tenants enabled
      const hook = createPostSignUpHook(db, {
        ...env,
        ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "true",
      } as Cloudflare.Env);

      // Execute hook
      await hook({
        path: "/sign-up",
        context: { newSession: { user: { id: userId } } },
      });

      // Verify user assigned to tenant using SQL
      const updatedUser = await env.DB.prepare(
        "SELECT tenantId FROM user WHERE id = ?"
      )
        .bind(userId)
        .first<{ tenantId: number }>();

      expect(updatedUser?.tenantId).toBeGreaterThan(0);

      // Verify tenant created using SQL
      const tenantCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Tenants"
      ).first<{ count: number }>();

      expect(tenantCount?.count).toBe(1);
    });

    it("should allow creating multiple tenants", async () => {
      const db = drizzle(env.DB);

      // Create first user and tenant
      const userId1 = `user_${randomBytes(4).toString("hex")}`;
      await db.insert(user).values({
        id: userId1,
        email: `${userId1}@example.com`,
        name: "User 1",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const hook = createPostSignUpHook(db, {
        ...env,
        ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "true",
      } as Cloudflare.Env);

      await hook({
        path: "/sign-up",
        context: { newSession: { user: { id: userId1 } } },
      });

      // Create second user and tenant
      const userId2 = `user_${randomBytes(4).toString("hex")}`;
      await db.insert(user).values({
        id: userId2,
        email: `${userId2}@example.com`,
        name: "User 2",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await hook({
        path: "/sign-up",
        context: { newSession: { user: { id: userId2 } } },
      });

      // Verify two tenants created using SQL
      const tenantCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Tenants"
      ).first<{ count: number }>();

      expect(tenantCount?.count).toBe(2);
    });
  });

  describe("when multiple tenants are disabled", () => {
    it("should create the first tenant successfully", async () => {
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(4).toString("hex")}`;

      // Create user
      await db.insert(user).values({
        id: userId,
        email: `${userId}@example.com`,
        name: "Test User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create hook with multiple tenants disabled
      const hook = createPostSignUpHook(db, {
        ...env,
        ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "false",
      } as Cloudflare.Env);

      // Execute hook
      await hook({
        path: "/sign-up",
        context: { newSession: { user: { id: userId } } },
      });

      // Verify user assigned to tenant using SQL
      const updatedUser = await env.DB.prepare(
        "SELECT tenantId FROM user WHERE id = ?"
      )
        .bind(userId)
        .first<{ tenantId: number }>();

      expect(updatedUser?.tenantId).toBeGreaterThan(0);

      // Verify tenant created using SQL
      const tenantCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Tenants"
      ).first<{ count: number }>();

      expect(tenantCount?.count).toBe(1);
    });

    it("should not create tenant when tenants already exist", async () => {
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(4).toString("hex")}`;

      // Create existing tenant first
      await db.insert(tenants).values({
        isActive: true,
      });

      // Create user with default tenantId
      await db.insert(user).values({
        id: userId,
        email: `${userId}@example.com`,
        name: "Test User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create hook with multiple tenants disabled
      const hook = createPostSignUpHook(db, {
        ...env,
        ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "false",
      } as Cloudflare.Env);

      // Execute hook
      await hook({
        path: "/sign-up",
        context: { newSession: { user: { id: userId } } },
      });

      // Verify user tenantId unchanged using SQL
      const updatedUser = await env.DB.prepare(
        "SELECT tenantId FROM user WHERE id = ?"
      )
        .bind(userId)
        .first<{ tenantId: number }>();

      expect(updatedUser?.tenantId).toBe(-1);

      // Verify no new tenant created using SQL
      const tenantCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Tenants"
      ).first<{ count: number }>();

      expect(tenantCount?.count).toBe(1); // Only the pre-existing tenant
    });

  });

  describe("when path is not sign-up", () => {
    it("should not create tenant for non-signup paths", async () => {
      const db = drizzle(env.DB);
      const userId = `user_${randomBytes(4).toString("hex")}`;

      // Create user
      await db.insert(user).values({
        id: userId,
        email: `${userId}@example.com`,
        name: "Test User",
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const hook = createPostSignUpHook(db, {
        ...env,
        ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "true",
      } as Cloudflare.Env);

      // Execute hook with different path
      await hook({
        path: "/sign-in",
        context: { newSession: { user: { id: userId } } },
      });

      // Verify user not assigned to tenant using SQL
      const updatedUser = await env.DB.prepare(
        "SELECT tenantId FROM user WHERE id = ?"
      )
        .bind(userId)
        .first<{ tenantId: number }>();

      expect(updatedUser?.tenantId).toBe(-1);

      // Verify no tenant created using SQL
      const tenantCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Tenants"
      ).first<{ count: number }>();

      expect(tenantCount?.count).toBe(0);
    });
  });

  describe("when no new session", () => {
    it("should not create tenant when newSession is missing", async () => {
      const db = drizzle(env.DB);

      const hook = createPostSignUpHook(db, {
        ...env,
        ALLOW_TO_CREATE_MORE_THAN_ONE_TENANT: "true",
      } as Cloudflare.Env);

      // Execute hook without newSession
      await hook({
        path: "/sign-up",
        context: {},
      });

      // Verify no tenant created using SQL
      const tenantCount = await env.DB.prepare(
        "SELECT COUNT(*) as count FROM Tenants"
      ).first<{ count: number }>();

      expect(tenantCount?.count).toBe(0);
    });
  });
});
