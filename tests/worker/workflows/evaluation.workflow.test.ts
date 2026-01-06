import { describe, it, expect, beforeEach, vi } from "vitest";
import { runEvaluationWorkflow } from "../../../worker/workflows/evaluation.workflow";

const startEvaluationMock = vi.fn();
const finishEvaluationMock = vi.fn();
const updateOutputSchemaMock = vi.fn();
const listPromptsMock = vi.fn();
const listRecordsMock = vi.fn();
const createResultMock = vi.fn();
const getPromptVersionByIdMock = vi.fn();
const executePromptMock = vi.fn();
const findEvaluationByIdMock = vi.fn();

vi.mock("../../../worker/services/evaluation.service", () => ({
  EvaluationService: class {
    startEvaluation = startEvaluationMock;
    finishEvaluation = finishEvaluationMock;
    updateOutputSchema = updateOutputSchemaMock;
  },
}));

vi.mock("../../../worker/repositories/evaluation.repository", () => ({
  EvaluationRepository: class {
    findById = findEvaluationByIdMock;
  },
}));

vi.mock("../../../worker/repositories/evaluation-prompt.repository", () => ({
  EvaluationPromptRepository: class {
    listByEvaluation = listPromptsMock;
  },
}));

vi.mock("../../../worker/repositories/dataset-record.repository", () => ({
  DataSetRecordRepository: class {
    listBatchByDataSet = listRecordsMock;
  },
}));

vi.mock("../../../worker/repositories/evaluation-result.repository", () => ({
  EvaluationResultRepository: class {
    create = createResultMock;
  },
}));

vi.mock("../../../worker/services/prompt.service", () => ({
  PromptService: class {
    getPromptVersionById = getPromptVersionByIdMock;
  },
}));

vi.mock("../../../worker/services/provider.service", () => ({
  ProviderService: class {
    executePrompt = executePromptMock;
  },
}));

vi.mock("../../../worker/providers/logger/null-prompt-execution-logger", () => ({
  NullPromptExecutionLogger: class {},
}));

describe("EvaluationWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startEvaluationMock.mockReset();
    finishEvaluationMock.mockReset();
    updateOutputSchemaMock.mockReset();
    listPromptsMock.mockReset();
    listRecordsMock.mockReset();
    createResultMock.mockReset();
    getPromptVersionByIdMock.mockReset();
    executePromptMock.mockReset();
    findEvaluationByIdMock.mockReset();
  });

  it("should mark evaluation running before finishing", async () => {
    findEvaluationByIdMock.mockResolvedValue({
      id: 3,
      tenantId: 1,
      projectId: 2,
      datasetId: 5,
      name: "Test Eval",
      slug: "test-eval",
      type: "run",
      state: "created",
    });
    listPromptsMock.mockResolvedValue([]);
    listRecordsMock.mockResolvedValue([]);
    const stepCalls: string[] = [];
    const step = {
      do: vi.fn(async (name: string, callback: () => Promise<unknown>) => {
        stepCalls.push(name);
        return await callback();
      }),
      sleep: vi.fn(),
      sleepUntil: vi.fn(),
      waitForEvent: vi.fn(),
    } as any;

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1500);

    await runEvaluationWorkflow(
      {
        tenantId: 1,
        projectId: 2,
        evaluationId: 3,
        startedAtMs: 1000,
      },
      step,
      {
        db: {} as any,
        cache: {} as any,
        providerConfig: {
          openAIKey: "test",
          geminiKey: "test",
          cloudflareAiGatewayToken: "test",
          cloudflareAiGatewayBaseUrl: "test",
        },
      }
    );

    expect(stepCalls).toEqual(["start-evaluation", "get-evaluation", "finish-evaluation"]);
    expect(startEvaluationMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 2 },
      3
    );
    expect(finishEvaluationMock).toHaveBeenCalledWith(
      { tenantId: 1, projectId: 2 },
      3,
      500
    );

    const startOrder = startEvaluationMock.mock.invocationCallOrder[0];
    const finishOrder = finishEvaluationMock.mock.invocationCallOrder[0];
    expect(startOrder).toBeLessThan(finishOrder);

    nowSpy.mockRestore();
  });

  it("should execute prompts for dataset records and persist results", async () => {
    findEvaluationByIdMock.mockResolvedValue({
      id: 3,
      tenantId: 1,
      projectId: 2,
      datasetId: 9,
      name: "Test Eval",
      slug: "test-eval",
      type: "run",
      state: "created",
    });
    listPromptsMock.mockResolvedValue([
      {
        id: 1,
        tenantId: 1,
        projectId: 2,
        evaluationId: 3,
        promptId: 11,
        versionId: 101,
        createdAt: 1000,
      },
      {
        id: 2,
        tenantId: 1,
        projectId: 2,
        evaluationId: 3,
        promptId: 12,
        versionId: 102,
        createdAt: 1001,
      },
    ]);
    listRecordsMock
      .mockResolvedValueOnce([
        {
          id: 201,
          tenantId: 1,
          projectId: 2,
          dataSetId: 9,
          variables: JSON.stringify({ name: "Ada" }),
          isDeleted: false,
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 202,
          tenantId: 1,
          projectId: 2,
          dataSetId: 9,
          variables: JSON.stringify({ name: "Linus" }),
          isDeleted: false,
          createdAt: 1001,
          updatedAt: 1001,
        },
      ])
      .mockResolvedValueOnce([]);
    getPromptVersionByIdMock.mockResolvedValue({
      id: 101,
      promptId: 11,
      tenantId: 1,
      projectId: 2,
      version: 1,
      name: "Prompt",
      provider: "openai",
      model: "gpt-4o",
      body: JSON.stringify({
        messages: [{ role: "user", content: "Hello {{name}}" }],
        response_format: { type: "json" },
      }),
      slug: "prompt",
      createdAt: 1000,
    });
    executePromptMock.mockResolvedValue({
      content: "{\"ok\":true}",
      model: "gpt-4o",
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
      duration_ms: 120,
    });
    updateOutputSchemaMock.mockResolvedValue({
      id: 3,
      tenantId: 1,
      projectId: 2,
      name: "Eval",
      slug: "eval",
      type: "run",
      state: "running",
      workflowId: "workflow-1",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{\"fields\":{\"ok\":{\"type\":\"boolean\"}}}",
      createdAt: 1000,
      updatedAt: 1000,
    });

    const stepCalls: string[] = [];
    const step = {
      do: vi.fn(async (name: string, callback: () => Promise<unknown>) => {
        stepCalls.push(name);
        return await callback();
      }),
      sleep: vi.fn(),
      sleepUntil: vi.fn(),
      waitForEvent: vi.fn(),
    } as any;

    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1500);

    await runEvaluationWorkflow(
      {
        tenantId: 1,
        projectId: 2,
        evaluationId: 3,
        startedAtMs: 1000,
      },
      step,
      {
        db: {} as any,
        cache: {} as any,
        providerConfig: {
          openAIKey: "test",
          geminiKey: "test",
          cloudflareAiGatewayToken: "test",
          cloudflareAiGatewayBaseUrl: "test",
        },
      }
    );

    expect(stepCalls[0]).toBe("start-evaluation");
    expect(stepCalls[1]).toBe("get-evaluation");
    expect(stepCalls).toContain("execute-201-11-101");
    expect(stepCalls).toContain("execute-201-12-102");
    expect(stepCalls).toContain("execute-202-11-101");
    expect(stepCalls).toContain("execute-202-12-102");
    expect(stepCalls[stepCalls.length - 1]).toBe("finish-evaluation");

    expect(getPromptVersionByIdMock).toHaveBeenCalledWith(1, 2, 101);
    expect(executePromptMock).toHaveBeenCalledTimes(4);
    expect(createResultMock).toHaveBeenCalledTimes(4);
    expect(updateOutputSchemaMock).toHaveBeenCalled();

    nowSpy.mockRestore();
  });
});
