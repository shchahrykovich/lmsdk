import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { openAIResponse, runWorkflow, setupEvaluation, type EvaluationFixture } from "./evaluation-workflow-fixtures";

const mockResponsesCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
  },
}));

type LogRow = {
  id: number;
  tenantId: number;
  projectId: number;
  promptId: number;
  version: number;
  isSuccess: number;
  errorMessage: string | null;
  logPath: string | null;
};

const readLogs = async () =>
  (await env.DB.prepare("SELECT * FROM PromptExecutionLogs ORDER BY id").all<LogRow>()).results;

const readFile = async (key: string): Promise<unknown> => {
  const file = await env.PRIVATE_FILES.get(key);
  return file ? JSON.parse(await file.text()) : null;
};

describe("EvaluationWorkflow - execution logs", () => {
  let fixture: EvaluationFixture;

  beforeEach(async () => {
    mockResponsesCreate.mockReset();
    fixture = await setupEvaluation();
  });

  it("writes one log row with its input and output files for each prompt call", async () => {
    mockResponsesCreate.mockResolvedValue(openAIResponse("7.5"));

    await runWorkflow(fixture.payload);

    const logs = await readLogs();
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log).toMatchObject({ tenantId: 1, projectId: fixture.payload.projectId, promptId: fixture.promptId, version: 1, isSuccess: 1 });
      expect(await readFile(`${log.logPath}/input.json`)).toMatchObject({ model: "gpt-4o-mini" });
      expect(await readFile(`${log.logPath}/output.json`)).toMatchObject({ id: "resp-1" });
    }
    expect(await readFile(`${logs[0].logPath}/variables.json`)).toEqual({ word: "zinc" });
  });

  it("writes a failed log row when the provider call fails, and still fails the step", async () => {
    mockResponsesCreate.mockRejectedValue(new Error("The model `gpt-4o-mini` does not exist"));

    await expect(runWorkflow(fixture.payload)).rejects.toThrow("does not exist");

    const logs = await readLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ promptId: fixture.promptId, isSuccess: 0, errorMessage: "The model `gpt-4o-mini` does not exist" });
  });

  it("keeps the result when the log files cannot be saved, so the paid call is not repeated", async () => {
    mockResponsesCreate.mockResolvedValue(openAIResponse("7.5"));
    const brokenFiles = { put: vi.fn().mockRejectedValue(new Error("R2 unavailable")) } as unknown as R2Bucket;

    await runWorkflow(fixture.payload, { logFiles: brokenFiles });

    const results = await env.DB.prepare("SELECT COUNT(*) AS count FROM EvaluationResults").first<{ count: number }>();
    expect(results?.count).toBe(2);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
  });
});
