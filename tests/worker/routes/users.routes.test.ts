import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../worker/index";

const mockGetSession = vi.fn();
const getUsersByTenantIdMock = vi.fn();
const createUserMock = vi.fn();

vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../worker/services/user.service", () => ({
  UserService: class {
    getUsersByTenantId = getUsersByTenantIdMock;
    createUser = createUserMock;
  },
}));

describe("Users Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getUsersByTenantIdMock.mockReset();
    createUserMock.mockReset();
  });

  const setAuthenticatedUser = (tenantId = 1) => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: { id: "session-123" },
    });
  };

  describe("GET /api/users", () => {
    it("returns list of users for tenant", async () => {
      setAuthenticatedUser(1);
      const users = [
        {
          id: "user-1",
          name: "Alice",
          email: "alice@example.com",
          emailVerified: true,
          image: null,
          tenantId: 1,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: "user-2",
          name: "Bob",
          email: "bob@example.com",
          emailVerified: false,
          image: null,
          tenantId: 1,
          createdAt: 1100,
          updatedAt: 1100,
        },
      ];
      getUsersByTenantIdMock.mockResolvedValue(users);

      const response = await app.request(
        "/api/users",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toEqual(users);
      expect(getUsersByTenantIdMock).toHaveBeenCalledWith(1);
    });

    it("returns empty array when no users exist", async () => {
      setAuthenticatedUser(1);
      getUsersByTenantIdMock.mockResolvedValue([]);

      const response = await app.request(
        "/api/users",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.users).toEqual([]);
      expect(getUsersByTenantIdMock).toHaveBeenCalledWith(1);
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/users",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("returns 401 when user has no valid tenant", async () => {
      setAuthenticatedUser(-1);

      const response = await app.request(
        "/api/users",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });
  });

  describe("POST /api/users", () => {
    it("creates user successfully with valid data", async () => {
      setAuthenticatedUser(1);
      const newUser = {
        id: "user-new",
        name: "Charlie",
        email: "charlie@example.com",
        emailVerified: false,
        image: null,
        tenantId: 1,
        createdAt: 2000,
        updatedAt: 2000,
      };
      createUserMock.mockResolvedValue(newUser);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.user).toEqual(newUser);
      expect(createUserMock).toHaveBeenCalledWith(
        expect.anything(),
        {
          name: "Charlie",
          email: "charlie@example.com",
          password: "password123",
          tenantId: 1,
        }
      );
    });

    it("returns 400 when name is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "charlie@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name, email, and password are required" });
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 when email is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name, email, and password are required" });
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 when password is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name, email, and password are required" });
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 when all fields are missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name, email, and password are required" });
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 when password is less than 8 characters", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "short",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Password must be at least 8 characters" });
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 when password is exactly 7 characters", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "1234567",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Password must be at least 8 characters" });
      expect(createUserMock).not.toHaveBeenCalled();
    });

    it("accepts password with exactly 8 characters", async () => {
      setAuthenticatedUser(1);
      const newUser = {
        id: "user-new",
        name: "Charlie",
        email: "charlie@example.com",
        emailVerified: false,
        image: null,
        tenantId: 1,
        createdAt: 2000,
        updatedAt: 2000,
      };
      createUserMock.mockResolvedValue(newUser);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "12345678",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(201);
      expect(createUserMock).toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("returns 401 when user has no valid tenant", async () => {
      setAuthenticatedUser(-1);

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("returns 409 when email already exists", async () => {
      setAuthenticatedUser(1);
      createUserMock.mockRejectedValue(new Error("email already exists"));

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "existing@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data).toEqual({ error: "Email already exists" });
    });

    it("returns 409 when error message contains email keyword", async () => {
      setAuthenticatedUser(1);
      createUserMock.mockRejectedValue(new Error("User with this email already exists in the system"));

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "existing@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data).toEqual({ error: "Email already exists" });
    });

    it("returns 500 when service throws generic error", async () => {
      setAuthenticatedUser(1);
      createUserMock.mockRejectedValue(new Error("Database connection failed"));

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to create user" });
    });

    it("returns 500 when service throws non-Error object", async () => {
      setAuthenticatedUser(1);
      createUserMock.mockRejectedValue("Unknown error");

      const response = await app.request(
        "/api/users",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Charlie",
            email: "charlie@example.com",
            password: "password123",
          }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to create user" });
    });
  });
});
