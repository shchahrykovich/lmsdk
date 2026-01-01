import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { UserService } from "../../../../worker/services/user.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { User, Tenant } from "../../../../worker/db/schema";

describe("UserService - assignTenantToUser", () => {
  let userService: UserService;

  beforeEach(async () => {
    await applyMigrations();
    userService = new UserService(drizzle(env.DB));
  });

  /**
   * Helper function to create a test user in the database
   * Uses direct SQL to bypass better-auth
   */
  async function createTestUser(data: {
    id: string;
    email: string;
    name: string;
    tenantId?: number;
  }): Promise<User> {
    const tenantId = data.tenantId ?? -1;

    await env.DB.prepare(
      "INSERT INTO user (id, email, name, tenantId, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())"
    ).bind(data.id, data.email, data.name, tenantId, 0).run();

    const result = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(data.id).first<User>();

    if (!result) {
      throw new Error("Failed to create test user");
    }

    return result;
  }

  it("should create tenant and assign to user", async () => {
    const testUser = await createTestUser({
      id: "user_123",
      email: "test@example.com",
      name: "Test User",
    });

    expect(testUser.tenantId).toBe(-1);

    const result = await userService.assignTenantToUser(testUser.id);

    expect(result.userId).toBe(testUser.id);
    expect(result.tenantId).toBeGreaterThan(0);

    // Verify user updated using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(testUser.id).first<User>();

    expect(dbUser?.tenantId).toBe(result.tenantId);
    expect(dbUser?.tenantId).toBeGreaterThan(0);

    // Verify tenant created using SQL
    const dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(result.tenantId).first<Tenant>();

    expect(dbTenant).toBeDefined();
    expect(dbTenant?.id).toBe(result.tenantId);
    expect(dbTenant?.isActive).toBe(1); // SQLite boolean as 0/1
  });

  it("should create unique tenants for different users", async () => {
    const user1 = await createTestUser({
      id: "user_1",
      email: "user1@example.com",
      name: "User 1",
    });

    const user2 = await createTestUser({
      id: "user_2",
      email: "user2@example.com",
      name: "User 2",
    });

    const user3 = await createTestUser({
      id: "user_3",
      email: "user3@example.com",
      name: "User 3",
    });

    const result1 = await userService.assignTenantToUser(user1.id);
    const result2 = await userService.assignTenantToUser(user2.id);
    const result3 = await userService.assignTenantToUser(user3.id);

    // Each user gets unique tenant
    expect(result1.tenantId).not.toBe(result2.tenantId);
    expect(result1.tenantId).not.toBe(result3.tenantId);
    expect(result2.tenantId).not.toBe(result3.tenantId);

    // Verify all tenants exist using SQL
    const tenantCount = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM Tenants"
    ).first<{ count: number }>();

    expect(tenantCount?.count).toBe(3);
  });

  it("should update from default tenantId -1 to valid tenant", async () => {
    const testUser = await createTestUser({
      id: "user_default",
      email: "default@example.com",
      name: "Default User",
      tenantId: -1,
    });

    expect(testUser.tenantId).toBe(-1);

    const result = await userService.assignTenantToUser(testUser.id);

    expect(result.tenantId).toBeGreaterThan(0);

    // Verify transition using SQL
    const dbUser = await env.DB.prepare(
      "SELECT tenantId FROM user WHERE id = ?"
    ).bind(testUser.id).first<{ tenantId: number }>();

    expect(dbUser?.tenantId).toBe(result.tenantId);
    expect(dbUser?.tenantId).not.toBe(-1);
  });

  it("should reassign tenant when user already has one", async () => {
    const testUser = await createTestUser({
      id: "user_existing",
      email: "existing@example.com",
      name: "Existing Tenant User",
      tenantId: 100,
    });

    const result = await userService.assignTenantToUser(testUser.id);

    expect(result.tenantId).toBeGreaterThan(0);
    expect(result.tenantId).not.toBe(100);

    // Verify reassignment using SQL
    const dbUser = await env.DB.prepare(
      "SELECT tenantId FROM user WHERE id = ?"
    ).bind(testUser.id).first<{ tenantId: number }>();

    expect(dbUser?.tenantId).toBe(result.tenantId);
    expect(dbUser?.tenantId).not.toBe(100);

    // Verify new tenant created using SQL
    const newTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(result.tenantId).first<Tenant>();

    expect(newTenant).toBeDefined();
    expect(newTenant?.isActive).toBe(1);
  });

  it("should preserve other user fields", async () => {
    const testUser = await createTestUser({
      id: "user_preserve",
      email: "preserve@example.com",
      name: "Preserve Fields User",
    });

    const originalEmail = testUser.email;
    const originalName = testUser.name;
    const originalEmailVerified = testUser.emailVerified;

    await userService.assignTenantToUser(testUser.id);

    // Verify fields preserved using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(testUser.id).first<User>();

    expect(dbUser?.email).toBe(originalEmail);
    expect(dbUser?.name).toBe(originalName);
    expect(dbUser?.emailVerified).toBe(originalEmailVerified);
    expect(dbUser?.tenantId).toBeGreaterThan(0);
  });

  it("should handle non-existent user gracefully", async () => {
    const result = await userService.assignTenantToUser("non_existent_user");

    expect(result.userId).toBe("non_existent_user");
    expect(result.tenantId).toBeGreaterThan(0);

    // Verify tenant created using SQL
    const dbTenant = await env.DB.prepare(
      "SELECT * FROM Tenants WHERE id = ?"
    ).bind(result.tenantId).first<Tenant>();

    expect(dbTenant).toBeDefined();
    expect(dbTenant?.isActive).toBe(1);

    // Verify user doesn't exist using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind("non_existent_user").first<User>();

    expect(dbUser).toBeNull();
  });

  it("should create tenants with sequential IDs", async () => {
    const user1 = await createTestUser({
      id: "user_seq1",
      email: "seq1@example.com",
      name: "Seq User 1",
    });

    const user2 = await createTestUser({
      id: "user_seq2",
      email: "seq2@example.com",
      name: "Seq User 2",
    });

    const result1 = await userService.assignTenantToUser(user1.id);
    const result2 = await userService.assignTenantToUser(user2.id);

    // Tenants have sequential IDs
    expect(result2.tenantId).toBe(result1.tenantId + 1);

    // Verify using SQL
    const allTenants = await env.DB.prepare(
      "SELECT * FROM Tenants ORDER BY id"
    ).all<Tenant>();

    expect(allTenants.results).toHaveLength(2);
    expect(allTenants.results[0].id).toBe(result1.tenantId);
    expect(allTenants.results[1].id).toBe(result2.tenantId);
  });

  it("should return correct result structure", async () => {
    const testUser = await createTestUser({
      id: "user_result",
      email: "result@example.com",
      name: "Result User",
    });

    const result = await userService.assignTenantToUser(testUser.id);

    expect(result).toHaveProperty("userId");
    expect(result).toHaveProperty("tenantId");
    expect(result.userId).toBe(testUser.id);
    expect(result.tenantId).toBeGreaterThan(0);
    expect(typeof result.tenantId).toBe("number");

    // Verify matches DB state using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(testUser.id).first<User>();

    expect(dbUser?.id).toBe(result.userId);
    expect(dbUser?.tenantId).toBe(result.tenantId);
  });
});
