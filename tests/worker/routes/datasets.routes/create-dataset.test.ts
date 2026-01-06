import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const createDataSetMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/dataset.service", () => ({
  DataSetService: class {
    createDataSet = createDataSetMock;
  },
}));

describe("Datasets Routes - POST /api/projects/:projectId/datasets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    createDataSetMock.mockReset();
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

  it("should create a new dataset", async () => {
    setAuthenticatedUser(1);
    createDataSetMock.mockResolvedValue({
      id: 1,
      name: "New Dataset",
      slug: "new-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Dataset" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.dataset.name).toBe("New Dataset");
    expect(createDataSetMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1 },
      { name: "New Dataset" }
    );
  });

  it("should return 400 for missing name", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Name is required");
  });

  it("should return 400 for empty name", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Name is required");
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Dataset" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID");
  });

  it("should trim whitespace from name", async () => {
    setAuthenticatedUser(1);
    createDataSetMock.mockResolvedValue({
      id: 1,
      name: "Trimmed Dataset",
      slug: "trimmed-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  Trimmed Dataset  " }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    expect(createDataSetMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1 },
      { name: "Trimmed Dataset" }
    );
  });

  it("should use correct tenant ID (cross-tenant protection)", async () => {
    setAuthenticatedUser(2);
    createDataSetMock.mockResolvedValue({
      id: 1,
      name: "Tenant 2 Dataset",
      slug: "tenant-2-dataset",
      tenantId: 2,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tenant 2 Dataset" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    expect(createDataSetMock).toHaveBeenCalledWith(
      { tenantId: 2, projectId: 1 },
      { name: "Tenant 2 Dataset" }
    );
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test Dataset" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
