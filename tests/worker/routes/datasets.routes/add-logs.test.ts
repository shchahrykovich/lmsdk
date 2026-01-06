import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getDataSetByIdMock = vi.fn();
const addLogsToDataSetMock = vi.fn();

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
    addLogsToDataSet = addLogsToDataSetMock;
  },
}));

describe("Datasets Routes - POST /api/projects/:projectId/datasets/:datasetId/logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetByIdMock.mockReset();
    addLogsToDataSetMock.mockReset();
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

  it("should add logs to dataset", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 10,
      name: "Dataset A",
      slug: "dataset-a",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });
    addLogsToDataSetMock.mockResolvedValue({ added: 2, skipped: 0 });

    const response = await app.request(
      "/api/projects/1/datasets/10/logs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logIds: [101, 102] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.added).toBe(2);
    expect(addLogsToDataSetMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 10 },
      { logIds: [101, 102] }
    );
  });

  it("should parse log IDs as integers", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 10,
      name: "Dataset A",
      slug: "dataset-a",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });
    addLogsToDataSetMock.mockResolvedValue({ added: 2, skipped: 0 });

    const response = await app.request(
      "/api/projects/1/datasets/10/logs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logIds: ["101", 102.5, 103, "bad"] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    expect(addLogsToDataSetMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 10 },
      { logIds: [101, 103] }
    );
  });

  it("should return 400 for invalid project or dataset ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets/10/logs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logIds: [1] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID or dataset ID");
  });

  it("should return 400 when log IDs are missing", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/1/datasets/10/logs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Log IDs are required");
  });

  it("should return 404 when dataset is missing", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/10/logs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logIds: [1] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Dataset not found");
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/10/logs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logIds: [1] }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });
});
