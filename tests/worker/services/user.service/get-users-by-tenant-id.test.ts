import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { UserService } from "../../../../worker/services/user.service";
import { applyMigrations } from "../../helpers/db-setup";
import type { User } from "../../../../worker/db/schema";

describe("UserService - getUsersByTenantId", () => {
  let userService: UserService;

  beforeEach(async () => {
    await applyMigrations();
    userService = new UserService(drizzle(env.DB));
  });

  async function createTestUser(data: {
    id: string;
    email: string;
    name: string;
    tenantId: number;
  }): Promise<void> {
    await env.DB.prepare(
      "INSERT INTO user (id, email, name, tenantId, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())"
    ).bind(data.id, data.email, data.name, data.tenantId, 0).run();
  }

  it("should return users for specific tenant", async () => {
    await createTestUser({
      id: "user_1",
      email: "user1@example.com",
      name: "User 1",
      tenantId: 1,
    });

    await createTestUser({
      id: "user_2",
      email: "user2@example.com",
      name: "User 2",
      tenantId: 1,
    });

    await createTestUser({
      id: "user_3",
      email: "user3@example.com",
      name: "User 3",
      tenantId: 2,
    });

    const users = await userService.getUsersByTenantId(1);

    expect(users).toHaveLength(2);
    expect(users[0].id).toBe("user_1");
    expect(users[1].id).toBe("user_2");
    expect(users[0].tenantId).toBe(1);
    expect(users[1].tenantId).toBe(1);

    // Verify using SQL
    const dbUsers = await env.DB.prepare(
      "SELECT * FROM user WHERE tenantId = ?"
    ).bind(1).all<User>();

    expect(dbUsers.results).toHaveLength(2);
  });

  it("should return empty array when no users exist for tenant", async () => {
    await createTestUser({
      id: "user_1",
      email: "user1@example.com",
      name: "User 1",
      tenantId: 1,
    });

    const users = await userService.getUsersByTenantId(999);

    expect(users).toEqual([]);
    expect(users).toHaveLength(0);
  });

  it("should not return users from different tenants (cross-tenant protection)", async () => {
    await createTestUser({
      id: "user_tenant1",
      email: "tenant1@example.com",
      name: "Tenant 1 User",
      tenantId: 1,
    });

    await createTestUser({
      id: "user_tenant2",
      email: "tenant2@example.com",
      name: "Tenant 2 User",
      tenantId: 2,
    });

    const tenant1Users = await userService.getUsersByTenantId(1);

    expect(tenant1Users).toHaveLength(1);
    expect(tenant1Users[0].id).toBe("user_tenant1");
    expect(tenant1Users[0].tenantId).toBe(1);

    // Verify tenant 2 user not included using SQL
    const dbCheck = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM user WHERE id = ? AND tenantId = ?"
    ).bind("user_tenant2", 1).first<{ count: number }>();

    expect(dbCheck?.count).toBe(0);
  });

  it("should return correct user fields", async () => {
    await createTestUser({
      id: "user_fields",
      email: "fields@example.com",
      name: "Fields User",
      tenantId: 1,
    });

    const users = await userService.getUsersByTenantId(1);

    expect(users).toHaveLength(1);
    expect(users[0]).toHaveProperty("id");
    expect(users[0]).toHaveProperty("name");
    expect(users[0]).toHaveProperty("email");
    expect(users[0]).toHaveProperty("emailVerified");
    expect(users[0]).toHaveProperty("image");
    expect(users[0]).toHaveProperty("tenantId");
    expect(users[0]).toHaveProperty("createdAt");
    expect(users[0]).toHaveProperty("updatedAt");
  });

  it("should not expose sensitive fields", async () => {
    await createTestUser({
      id: "user_sensitive",
      email: "sensitive@example.com",
      name: "Sensitive User",
      tenantId: 1,
    });

    const users = await userService.getUsersByTenantId(1);

    expect(users[0]).not.toHaveProperty("password");
    expect(users[0]).not.toHaveProperty("passwordHash");
  });

  it("should handle multiple users for same tenant", async () => {
    for (let i = 1; i <= 10; i++) {
      await createTestUser({
        id: `user_${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`,
        tenantId: 1,
      });
    }

    const users = await userService.getUsersByTenantId(1);

    expect(users).toHaveLength(10);

    // Verify using SQL
    const dbUsers = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM user WHERE tenantId = ?"
    ).bind(1).first<{ count: number }>();

    expect(dbUsers?.count).toBe(10);
  });

  it("should filter users with tenantId -1", async () => {
    await createTestUser({
      id: "user_assigned",
      email: "assigned@example.com",
      name: "Assigned User",
      tenantId: 1,
    });

    await createTestUser({
      id: "user_unassigned",
      email: "unassigned@example.com",
      name: "Unassigned User",
      tenantId: -1,
    });

    const users = await userService.getUsersByTenantId(1);

    expect(users).toHaveLength(1);
    expect(users[0].id).toBe("user_assigned");
    expect(users[0].tenantId).toBe(1);

    // Verify unassigned user not included using SQL
    const unassigned = await env.DB.prepare(
      "SELECT * FROM user WHERE tenantId = ?"
    ).bind(-1).all<User>();

    expect(unassigned.results).toHaveLength(1);
    expect(unassigned.results[0].id).toBe("user_unassigned");
  });

  it("should maintain referential integrity", async () => {
    await createTestUser({
      id: "user_integrity",
      email: "integrity@example.com",
      name: "Integrity User",
      tenantId: 1,
    });

    const users = await userService.getUsersByTenantId(1);

    expect(users[0].tenantId).toBe(1);

    // Verify in DB using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind("user_integrity").first<User>();

    expect(dbUser?.tenantId).toBe(users[0].tenantId);
  });

  it("should handle tenantId 0", async () => {
    await createTestUser({
      id: "user_zero",
      email: "zero@example.com",
      name: "Zero User",
      tenantId: 0,
    });

    const users = await userService.getUsersByTenantId(0);

    expect(users).toHaveLength(1);
    expect(users[0].tenantId).toBe(0);
  });

  it("should return users in consistent order", async () => {
    await createTestUser({
      id: "user_a",
      email: "a@example.com",
      name: "User A",
      tenantId: 1,
    });

    await createTestUser({
      id: "user_b",
      email: "b@example.com",
      name: "User B",
      tenantId: 1,
    });

    await createTestUser({
      id: "user_c",
      email: "c@example.com",
      name: "User C",
      tenantId: 1,
    });

    const users1 = await userService.getUsersByTenantId(1);
    const users2 = await userService.getUsersByTenantId(1);

    // Order should be consistent
    expect(users1.map(u => u.id)).toEqual(users2.map(u => u.id));
  });
});
