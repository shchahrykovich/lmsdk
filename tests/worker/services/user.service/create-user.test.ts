import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { UserService } from "../../../../worker/services/user.service";
import { applyMigrations } from "../../helpers/db-setup";
import { createAuth } from "../../../../auth";
import type { User } from "../../../../worker/db/schema";

describe("UserService - createUser", () => {
  let userService: UserService;
  let mockAuth: ReturnType<typeof createAuth>;

  beforeEach(async () => {
    await applyMigrations();
    userService = new UserService(drizzle(env.DB));

    // Mock better-auth
    mockAuth = {
      api: {
        signUpEmail: vi.fn(),
      },
    } as unknown as ReturnType<typeof createAuth>;
  });

  /**
   * Helper to mock signUpEmail that creates user in DB
   * Simulates better-auth behavior
   */
  function mockSignUpWithDbInsert(userId: string, email: string, name: string) {
    (mockAuth.api.signUpEmail as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      // Simulate better-auth creating the user with default tenantId
      await env.DB.prepare(
        "INSERT INTO user (id, email, name, tenantId, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())"
      ).bind(userId, email, name, -1, 0).run();

      return {
        user: {
          id: userId,
          email: email,
          name: name,
        },
      };
    });
  }

  it("should create user and assign to tenant", async () => {
    const mockUserId = "user_created_123";
    mockSignUpWithDbInsert(mockUserId, "newuser@example.com", "New User");

    const result = await userService.createUser(mockAuth, {
      name: "New User",
      email: "newuser@example.com",
      password: "password123",
      tenantId: 1,
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(mockUserId);
    expect(result.email).toBe("newuser@example.com");
    expect(result.name).toBe("New User");
    expect(result.tenantId).toBe(1);

    // Verify user created in DB using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(mockUserId).first<User>();

    expect(dbUser).toBeDefined();
    expect(dbUser?.tenantId).toBe(1);
  });

  it("should call better-auth signUpEmail with correct parameters", async () => {
    const mockUserId = "user_params_123";
    mockSignUpWithDbInsert(mockUserId, "test@example.com", "Test User");

    await userService.createUser(mockAuth, {
      name: "Test User",
      email: "test@example.com",
      password: "securepass",
      tenantId: 5,
    });

    expect(mockAuth.api.signUpEmail).toHaveBeenCalledWith({
      body: {
        name: "Test User",
        email: "test@example.com",
        password: "securepass",
        tenantId: 5,
      },
    });
  });

  it("should throw when user creation fails", async () => {
    (mockAuth.api.signUpEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      userService.createUser(mockAuth, {
        name: "Failed User",
        email: "failed@example.com",
        password: "password",
        tenantId: 1,
      })
    ).rejects.toThrow("Failed to create user");
  });

  it("should throw when user object is missing", async () => {
    (mockAuth.api.signUpEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: null,
    });

    await expect(
      userService.createUser(mockAuth, {
        name: "No User",
        email: "nouser@example.com",
        password: "password",
        tenantId: 1,
      })
    ).rejects.toThrow("Failed to create user");
  });

  it("should update tenantId after creation", async () => {
    const mockUserId = "user_tenant_update";
    mockSignUpWithDbInsert(mockUserId, "tenant@example.com", "Tenant User");

    const result = await userService.createUser(mockAuth, {
      name: "Tenant User",
      email: "tenant@example.com",
      password: "password",
      tenantId: 10,
    });

    expect(result.tenantId).toBe(10);

    // Verify tenantId updated in DB using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(mockUserId).first<User>();

    expect(dbUser?.tenantId).toBe(10);
  });

  it("should return all user fields", async () => {
    const mockUserId = "user_fields_123";
    mockSignUpWithDbInsert(mockUserId, "fields@example.com", "Fields User");

    const result = await userService.createUser(mockAuth, {
      name: "Fields User",
      email: "fields@example.com",
      password: "password",
      tenantId: 1,
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("name");
    expect(result).toHaveProperty("email");
    expect(result).toHaveProperty("emailVerified");
    expect(result).toHaveProperty("image");
    expect(result).toHaveProperty("tenantId");
    expect(result).toHaveProperty("createdAt");
    expect(result).toHaveProperty("updatedAt");
  });

  it("should create users for different tenants", async () => {
    // Create user for tenant 1
    mockSignUpWithDbInsert("user_tenant1", "tenant1@example.com", "Tenant 1 User");
    const user1 = await userService.createUser(mockAuth, {
      name: "Tenant 1 User",
      email: "tenant1@example.com",
      password: "password",
      tenantId: 1,
    });

    // Create user for tenant 2
    mockSignUpWithDbInsert("user_tenant2", "tenant2@example.com", "Tenant 2 User");
    const user2 = await userService.createUser(mockAuth, {
      name: "Tenant 2 User",
      email: "tenant2@example.com",
      password: "password",
      tenantId: 2,
    });

    expect(user1.tenantId).toBe(1);
    expect(user2.tenantId).toBe(2);

    // Verify using SQL
    const dbUser1 = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind("user_tenant1").first<User>();

    const dbUser2 = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind("user_tenant2").first<User>();

    expect(dbUser1?.tenantId).toBe(1);
    expect(dbUser2?.tenantId).toBe(2);
  });

  it("should handle email with special characters", async () => {
    const mockUserId = "user_special_email";
    mockSignUpWithDbInsert(mockUserId, "test+special@example.co.uk", "Special Email User");

    const result = await userService.createUser(mockAuth, {
      name: "Special Email User",
      email: "test+special@example.co.uk",
      password: "password",
      tenantId: 1,
    });

    expect(result.email).toBe("test+special@example.co.uk");

    // Verify using SQL
    const dbUser = await env.DB.prepare(
      "SELECT * FROM user WHERE id = ?"
    ).bind(mockUserId).first<User>();

    expect(dbUser?.email).toBe("test+special@example.co.uk");
  });

  it("should handle long names", async () => {
    const longName = "A".repeat(255);
    const mockUserId = "user_long_name";
    mockSignUpWithDbInsert(mockUserId, "longname@example.com", longName);

    const result = await userService.createUser(mockAuth, {
      name: longName,
      email: "longname@example.com",
      password: "password",
      tenantId: 1,
    });

    expect(result.name).toBe(longName);
  });

  it("should not expose password in result", async () => {
    const mockUserId = "user_no_password";
    mockSignUpWithDbInsert(mockUserId, "nopass@example.com", "No Password User");

    const result = await userService.createUser(mockAuth, {
      name: "No Password User",
      email: "nopass@example.com",
      password: "supersecret",
      tenantId: 1,
    });

    expect(result).not.toHaveProperty("password");
    expect(result).not.toHaveProperty("passwordHash");
  });
});
