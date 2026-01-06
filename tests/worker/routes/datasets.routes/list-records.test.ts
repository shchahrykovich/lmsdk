import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getDataSetByIdMock = vi.fn();
const listDataSetRecordsMock = vi.fn();

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
    listDataSetRecords = listDataSetRecordsMock;
  },
}));

describe("Datasets Routes - GET /api/projects/:projectId/datasets/:datasetId/records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetByIdMock.mockReset();
    listDataSetRecordsMock.mockReset();
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

  it("should return parsed dataset records", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 10,
      name: "Dataset A",
      slug: "dataset-a",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 2,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });
    listDataSetRecordsMock.mockResolvedValue([
      {
        id: 1,
        tenantId: 1,
        projectId: 1,
        dataSetId: 10,
        variables: JSON.stringify({ user: { name: "Ada" } }),
        isDeleted: false,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ]);

    const response = await app.request(
      "/api/projects/1/datasets/10/records",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records).toHaveLength(1);
    expect(data.records[0].variables).toEqual({ user: { name: "Ada" } });
    expect(listDataSetRecordsMock).toHaveBeenCalledWith({
      tenantId: 1,
      projectId: 1,
      dataSetId: 10,
    });
  });

  it("should return 400 for invalid project or dataset ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets/10/records",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID or dataset ID");
  });

  it("should return 404 when dataset is missing", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/10/records",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Dataset not found");
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/10/records",
      {},
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
