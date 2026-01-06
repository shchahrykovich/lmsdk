import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getDataSetByIdMock = vi.fn();
const deleteDataSetRecordsMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/dataset.service", () => ({
  DataSetService: class {
    getDataSetById = getDataSetByIdMock;
    deleteDataSetRecords = deleteDataSetRecordsMock;
  },
}));

describe("Datasets Routes - DELETE /api/projects/:projectId/datasets/:datasetId/records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetByIdMock.mockReset();
    deleteDataSetRecordsMock.mockReset();
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

  it("should delete records successfully", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 5,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    deleteDataSetRecordsMock.mockResolvedValue({ deleted: 3 });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, 2, 3] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.deleted).toBe(3);

    expect(deleteDataSetRecordsMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      [1, 2, 3]
    );
  });

  it("should return 400 for missing record IDs", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Record IDs are required");
  });

  it("should return 400 for empty record IDs array", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Record IDs are required");
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, 2] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID or dataset ID");
  });

  it("should return 400 for invalid dataset ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets/invalid/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, 2] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID or dataset ID");
  });

  it("should return 404 when dataset not found", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/999/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, 2] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Dataset not found");
  });

  it("should filter out non-integer record IDs", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 3,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    deleteDataSetRecordsMock.mockResolvedValue({ deleted: 2 });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, "invalid", 2, null, undefined] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);

    // Should only call with valid integer IDs
    expect(deleteDataSetRecordsMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      [1, 2]
    );
  });

  it("should return 400 when all record IDs are invalid", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: ["invalid", null, undefined, "abc"] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Record IDs are required");
  });

  it("should handle service errors gracefully", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 3,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    deleteDataSetRecordsMock.mockRejectedValue(new Error("Database error"));

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, 2] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to delete dataset records");
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: [1, 2] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
