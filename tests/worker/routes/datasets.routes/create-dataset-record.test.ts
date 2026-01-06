import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../../worker/index";

const mockGetSession = vi.fn();
const getDataSetByIdMock = vi.fn();
const createDataSetRecordMock = vi.fn();

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
    createDataSetRecord = createDataSetRecordMock;
  },
}));

describe("Datasets Routes - POST /api/projects/:projectId/datasets/:datasetId/records", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getDataSetByIdMock.mockReset();
    createDataSetRecordMock.mockReset();
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

  it("should create a new record", async () => {
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

    const variables = {
      name: "John Doe",
      age: 30,
    };

    createDataSetRecordMock.mockResolvedValue({
      id: 1,
      tenantId: 1,
      projectId: 1,
      dataSetId: 1,
      variables: JSON.stringify(variables),
      isDeleted: false,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.record).toBeDefined();
    expect(data.record.variables).toEqual(variables);

    expect(createDataSetRecordMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 1, dataSetId: 1 },
      variables
    );
  });

  it("should return 400 for missing variables", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      tenantId: 1,
      projectId: 1,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Variables object is required");
  });

  it("should return 400 for invalid variables type", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      tenantId: 1,
      projectId: 1,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: "invalid" }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Variables object is required");
  });

  it("should return 404 if dataset not found", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue(undefined);

    const response = await app.request(
      "/api/projects/1/datasets/999/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: { test: "data" } }),
      },
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
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: { test: "data" } }),
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: { test: "data" } }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid project ID or dataset ID");
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

    const variables = { test: "data" };

    createDataSetRecordMock.mockResolvedValue({
      id: 1,
      tenantId: 2,
      projectId: 1,
      dataSetId: 1,
      variables: JSON.stringify(variables),
      isDeleted: false,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    expect(getDataSetByIdMock).toHaveBeenCalledWith({
      tenantId: 2,
      projectId: 1,
      dataSetId: 1,
    });
    expect(createDataSetRecordMock).toHaveBeenCalledWith(
      { tenantId: 2, projectId: 1, dataSetId: 1 },
      variables
    );
  });

  it("should return 401 for unauthenticated user", async () => {
    mockGetSession.mockResolvedValue(null);

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: { test: "data" } }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(401);
  });

  it("should handle nested variables", async () => {
    setAuthenticatedUser(1);
    getDataSetByIdMock.mockResolvedValue({
      id: 1,
      name: "Test Dataset",
      tenantId: 1,
      projectId: 1,
    });

    const variables = {
      user: {
        name: "Jane",
        email: "jane@example.com",
      },
      metadata: {
        source: "api",
      },
    };

    createDataSetRecordMock.mockResolvedValue({
      id: 1,
      tenantId: 1,
      projectId: 1,
      dataSetId: 1,
      variables: JSON.stringify(variables),
      isDeleted: false,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const response = await app.request(
      "/api/projects/1/datasets/1/records",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      },
      { DB: {} as any, PRIVATE_FILES: {} as any }
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.record.variables).toEqual(variables);
  });
});
