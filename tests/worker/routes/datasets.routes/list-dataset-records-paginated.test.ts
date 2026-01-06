import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getDataSetByIdMock = vi.fn();
const listDataSetRecordsPaginatedMock = vi.fn();

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
    listDataSetRecordsPaginated = listDataSetRecordsPaginatedMock;
  },
}));

describe("Datasets Routes - GET /api/projects/:projectId/datasets/:datasetId/records (paginated)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetByIdMock.mockReset();
    listDataSetRecordsPaginatedMock.mockReset();
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

  it("should return paginated records", async () => {
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

    listDataSetRecordsPaginatedMock.mockResolvedValue({
      records: [
        {
          id: 1,
          tenantId: 1,
          projectId: 1,
          dataSetId: 1,
          variables: JSON.stringify({ index: 1 }),
          isDeleted: false,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 2,
          tenantId: 1,
          projectId: 1,
          dataSetId: 1,
          variables: JSON.stringify({ index: 2 }),
          isDeleted: false,
          createdAt: 1001,
          updatedAt: 1001,
        },
      ],
      total: 5,
      page: 1,
      pageSize: 2,
      totalPages: 3,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records?page=1&pageSize=2",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.records).toHaveLength(2);
    expect(data.total).toBe(5);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(2);
    expect(data.totalPages).toBe(3);

    expect(listDataSetRecordsPaginatedMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      { page: 1, pageSize: 2 }
    );
  });

  it("should use default pagination parameters when not provided", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    listDataSetRecordsPaginatedMock.mockResolvedValue({
      records: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);

    expect(listDataSetRecordsPaginatedMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      { page: 1, pageSize: 10 }
    );
  });

  it("should enforce maximum page size", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    listDataSetRecordsPaginatedMock.mockResolvedValue({
      records: [],
      total: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records?pageSize=500",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);

    expect(listDataSetRecordsPaginatedMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      { page: 1, pageSize: 100 }
    );
  });

  it("should enforce minimum page size", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    listDataSetRecordsPaginatedMock.mockResolvedValue({
      records: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totalPages: 0,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records?pageSize=0",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);

    expect(listDataSetRecordsPaginatedMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      { page: 1, pageSize: 1 }
    );
  });

  it("should enforce minimum page number", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    listDataSetRecordsPaginatedMock.mockResolvedValue({
      records: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records?page=0",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);

    expect(listDataSetRecordsPaginatedMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      { page: 1, pageSize: 10 }
    );
  });

  it("should return 404 when dataset not found", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/999/records",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Dataset not found");
  });

  it("should return 400 for invalid project ID", async () => {
    setAuthenticatedUser(1);

    const response = await app.request(
      "/api/projects/invalid/datasets/1/records",
      { method: "GET" },
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
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID or dataset ID");
  });

  it("should parse variables in response", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      slug: "test-dataset",
      tenantId: 1,
      projectId: 1,
      isDeleted: false,
      countOfRecords: 1,
      schema: "{}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const variables = { name: "John", age: 30 };

    listDataSetRecordsPaginatedMock.mockResolvedValue({
      records: [
        {
          id: 1,
          tenantId: 1,
          projectId: 1,
          dataSetId: 1,
          variables: JSON.stringify(variables),
          isDeleted: false,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      { method: "GET" },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.records[0].variables).toEqual(variables);
  });
});
