import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker";
import {EntityId} from "../../../../worker/shared/entity-id";
import {ProjectId} from "../../../../worker/shared/project-id";

const mockGetSession = vi.fn();
const getDataSetByIdMock = vi.fn();
const deleteDataSetMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/datasets/dataset.service", () => ({
  DataSetService: class {
    getDataSetById = getDataSetByIdMock;
    deleteDataSet = deleteDataSetMock;
  },
}));

describe("Datasets Routes - DELETE /api/projects/:projectId/datasets/:datasetId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetByIdMock.mockReset();
    deleteDataSetMock.mockReset();
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

  it("should delete an existing dataset", async () => {
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
    deleteDataSetMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/1",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    const [[getEntityId]] = getDataSetByIdMock.mock.calls;
    expect(getEntityId).toBeInstanceOf(EntityId);
    expect(getEntityId.id).toBe(1);
    expect(getEntityId.projectId).toBe(1);
    expect(getEntityId.tenantId).toBe(1);

    const [[deleteEntityId]] = deleteDataSetMock.mock.calls;
    expect(deleteEntityId).toBeInstanceOf(EntityId);
    expect(deleteEntityId.id).toBe(1);
    expect(deleteEntityId.projectId).toBe(1);
    expect(deleteEntityId.tenantId).toBe(1);
  });

  it("should return 404 for non-existent dataset", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/999",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Dataset not found");
    expect(deleteDataSetMock).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets/1",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID");
    expect(getDataSetByIdMock).not.toHaveBeenCalled();
    expect(deleteDataSetMock).not.toHaveBeenCalled();
  });

  it("should return 400 for invalid dataset ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets/invalid",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid dataset ID");
    expect(getDataSetByIdMock).not.toHaveBeenCalled();
    expect(deleteDataSetMock).not.toHaveBeenCalled();
  });

  it("should use correct tenant ID (cross-tenant protection)", async () => {
    setAuthenticatedUser(2);
    getDataSetByIdMock.mockResolvedValue({
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
    deleteDataSetMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/1",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);

    const [[getEntityId]] = getDataSetByIdMock.mock.calls;
    expect(getEntityId).toBeInstanceOf(EntityId);
    expect(getEntityId.id).toBe(1);
    expect(getEntityId.projectId).toBe(1);
    expect(getEntityId.tenantId).toBe(2);

    const [[deleteEntityId]] = deleteDataSetMock.mock.calls;
    expect(deleteEntityId).toBeInstanceOf(EntityId);
    expect(deleteEntityId.id).toBe(1);
    expect(deleteEntityId.projectId).toBe(1);
    expect(deleteEntityId.tenantId).toBe(2);
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/1",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
    expect(getDataSetByIdMock).not.toHaveBeenCalled();
    expect(deleteDataSetMock).not.toHaveBeenCalled();
  });

  it("should not delete dataset from different tenant", async () => {
    setAuthenticatedUser(1);
    // Service returns undefined because tenantId doesn't match
    getDataSetByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/1",
      {
        method: "DELETE",
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Dataset not found");

    const [[getEntityId]] = getDataSetByIdMock.mock.calls;
    expect(getEntityId).toBeInstanceOf(EntityId);
    expect(getEntityId.id).toBe(1);
    expect(getEntityId.projectId).toBe(1);
    expect(getEntityId.tenantId).toBe(1);

    expect(deleteDataSetMock).not.toHaveBeenCalled();
  });
});
