import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getDataSetsMock = vi.fn();

vi.mock("../../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../../worker/services/dataset.service", () => ({
  DataSetService: class {
    getDataSets = getDataSetsMock;
  },
}));

describe("Datasets Routes - GET /api/projects/:projectId/datasets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetsMock.mockReset();
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

  it("should return list of datasets for authenticated user", async () => {
    setAuthenticatedUser(1);
    getDataSetsMock.mockResolvedValue([
      {
        id: 1,
        name: "Dataset A",
        slug: "dataset-a",
        tenantId: 1,
        projectId: 1,
        isDeleted: false,
        countOfRecords: 10,
        schema: "{}",
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 2,
        name: "Dataset B",
        slug: "dataset-b",
        tenantId: 1,
        projectId: 1,
        isDeleted: false,
        countOfRecords: 5,
        schema: "{}",
        createdAt: 1100,
        updatedAt: 1100,
      },
    ]);

    const response = await app.request(
      "/api/projects/1/datasets",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.datasets).toHaveLength(2);
    expect(data.datasets[0].name).toBe("Dataset A");
    expect(data.datasets[1].name).toBe("Dataset B");
    expect(getDataSetsMock).toHaveBeenCalledWith({
      tenantId: 1,
      projectId: 1,
    });
  });

  it("should return empty array when no datasets exist", async () => {
    setAuthenticatedUser(1);
    getDataSetsMock.mockResolvedValue([]);

    const response = await app.request(
      "/api/projects/1/datasets",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.datasets).toEqual([]);
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID");
  });

  it("should only return datasets for user's tenant (cross-tenant protection)", async () => {
    setAuthenticatedUser(2);
    getDataSetsMock.mockResolvedValue([
      {
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
      },
    ]);

    const response = await app.request(
      "/api/projects/1/datasets",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(getDataSetsMock).toHaveBeenCalledWith({
      tenantId: 2,
      projectId: 1,
    });
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
