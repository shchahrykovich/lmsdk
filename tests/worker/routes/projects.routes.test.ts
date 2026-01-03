import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../worker/index";

const mockGetSession = vi.fn();
const listProjectsMock = vi.fn();
const createProjectMock = vi.fn();
const getProjectByIdMock = vi.fn();
const deactivateProjectMock = vi.fn();

vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../worker/services/project.service", () => ({
  ProjectService: class {
    listProjects = listProjectsMock;
    createProject = createProjectMock;
    getProjectById = getProjectByIdMock;
    deactivateProject = deactivateProjectMock;
  },
}));

describe("Projects Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    listProjectsMock.mockReset();
    createProjectMock.mockReset();
    getProjectByIdMock.mockReset();
    deactivateProjectMock.mockReset();
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

  describe("GET /api/projects", () => {
    it("returns list of projects for authenticated user", async () => {
      setAuthenticatedUser(1);
      listProjectsMock.mockResolvedValue([
        {
          id: 1,
          name: "Project A",
          slug: "project-a",
          tenantId: 1,
          isActive: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 2,
          name: "Project B",
          slug: "project-b",
          tenantId: 1,
          isActive: true,
          createdAt: 1100,
          updatedAt: 1100,
        },
      ]);

      const response = await app.request(
        "/api/projects",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.projects).toHaveLength(2);
      expect(data.projects[0].name).toBe("Project A");
      expect(data.projects[1].name).toBe("Project B");
      expect(listProjectsMock).toHaveBeenCalledWith(1);
    });

    it("returns empty array when no projects exist", async () => {
      setAuthenticatedUser(1);
      listProjectsMock.mockResolvedValue([]);

      const response = await app.request(
        "/api/projects",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.projects).toEqual([]);
      expect(listProjectsMock).toHaveBeenCalledWith(1);
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/projects",
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
        "/api/projects",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      listProjectsMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        "/api/projects",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to list projects" });
    });
  });

  describe("POST /api/projects", () => {
    it("creates a new project with valid data", async () => {
      setAuthenticatedUser(1);
      const newProject = {
        id: 3,
        name: "New Project",
        slug: "new-project",
        tenantId: 1,
        isActive: true,
        createdAt: 2000,
        updatedAt: 2000,
      };
      createProjectMock.mockResolvedValue(newProject);

      const response = await app.request(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Project", slug: "new-project" }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.project).toEqual(newProject);
      expect(createProjectMock).toHaveBeenCalledWith({
        name: "New Project",
        slug: "new-project",
        tenantId: 1,
      });
    });

    it("returns 400 when name is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: "new-project" }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name and slug are required" });
      expect(createProjectMock).not.toHaveBeenCalled();
    });

    it("returns 400 when slug is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Project" }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name and slug are required" });
      expect(createProjectMock).not.toHaveBeenCalled();
    });

    it("returns 400 when both name and slug are missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Name and slug are required" });
      expect(createProjectMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Project", slug: "new-project" }),
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
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Project", slug: "new-project" }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      createProjectMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        "/api/projects",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Project", slug: "new-project" }),
        },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to create project" });
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns a specific project by ID", async () => {
      setAuthenticatedUser(1);
      const project = {
        id: 1,
        name: "Project A",
        slug: "project-a",
        tenantId: 1,
        isActive: true,
        createdAt: 1000,
        updatedAt: 1000,
      };
      getProjectByIdMock.mockResolvedValue(project);

      const response = await app.request(
        "/api/projects/1",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.project).toEqual(project);
      expect(getProjectByIdMock).toHaveBeenCalledWith(1, 1);
    });

    it("returns 404 when project is not found", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockResolvedValue(undefined);

      const response = await app.request(
        "/api/projects/999",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Project not found" });
      expect(getProjectByIdMock).toHaveBeenCalledWith(1, 999);
    });

    it("returns 400 for invalid project ID", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/projects/invalid",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid project ID" });
      expect(getProjectByIdMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/projects/1",
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
        "/api/projects/1",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        "/api/projects/1",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to get project" });
    });

    it("prevents cross-tenant access", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockResolvedValue(undefined);

      const response = await app.request(
        "/api/projects/2",
        {},
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Project not found" });
      expect(getProjectByIdMock).toHaveBeenCalledWith(1, 2);
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("deactivates an existing project", async () => {
      setAuthenticatedUser(1);
      const project = {
        id: 1,
        name: "Project A",
        slug: "project-a",
        tenantId: 1,
        isActive: true,
        createdAt: 1000,
        updatedAt: 1000,
      };
      getProjectByIdMock.mockResolvedValue(project);
      deactivateProjectMock.mockResolvedValue(undefined);

      const response = await app.request(
        "/api/projects/1",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ success: true });
      expect(getProjectByIdMock).toHaveBeenCalledWith(1, 1);
      expect(deactivateProjectMock).toHaveBeenCalledWith(1, 1);
    });

    it("returns 404 when project does not exist", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockResolvedValue(undefined);

      const response = await app.request(
        "/api/projects/999",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Project not found" });
      expect(getProjectByIdMock).toHaveBeenCalledWith(1, 999);
      expect(deactivateProjectMock).not.toHaveBeenCalled();
    });

    it("returns 400 for invalid project ID", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/projects/invalid",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data).toEqual({ error: "Invalid project ID" });
      expect(getProjectByIdMock).not.toHaveBeenCalled();
      expect(deactivateProjectMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/projects/1",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("returns 401 when user has no valid tenant", async () => {
      setAuthenticatedUser(-1);

      const response = await app.request(
        "/api/projects/1",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("returns 500 when service throws error during deactivation", async () => {
      setAuthenticatedUser(1);
      const project = {
        id: 1,
        name: "Project A",
        slug: "project-a",
        tenantId: 1,
        isActive: true,
        createdAt: 1000,
        updatedAt: 1000,
      };
      getProjectByIdMock.mockResolvedValue(project);
      deactivateProjectMock.mockRejectedValue(new Error("Database error"));

      const response = await app.request(
        "/api/projects/1",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Failed to deactivate project" });
    });

    it("prevents cross-tenant deactivation", async () => {
      setAuthenticatedUser(1);
      getProjectByIdMock.mockResolvedValue(undefined);

      const response = await app.request(
        "/api/projects/2",
        { method: "DELETE" },
        { DB: {} as any, PRIVATE_FILES: {} as any }
      );

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data).toEqual({ error: "Project not found" });
      expect(getProjectByIdMock).toHaveBeenCalledWith(1, 2);
      expect(deactivateProjectMock).not.toHaveBeenCalled();
    });
  });
});
