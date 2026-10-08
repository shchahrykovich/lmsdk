import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { evaluationResults, evaluations } from "../../../worker/db/schema";
import { ProjectId } from "../../../worker/shared/project-id";
import { applyMigrations } from "../helpers/db-setup";
import { insertDataSetRecords, insertEvaluationPrompts, seedDataSet, seedProject, seedPrompt } from "../helpers/seed";
import { openAIResponse, runWorkflow, setupEvaluation } from "./evaluation-workflow-fixtures";

const mockResponsesCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
  },
}));

type ResultRow = { dataSetRecordId: number; versionId: number; result: string };

const readResults = async (evaluationId: number) =>
  (
    await env.DB.prepare("SELECT dataSetRecordId, versionId, result FROM EvaluationResults WHERE evaluationId = ? ORDER BY dataSetRecordId, versionId")
      .bind(evaluationId)
      .all<ResultRow>()
  ).results;

async function setupReuse() {
  await applyMigrations();
  const project = await seedProject(1, "supplements");
  const projectId = new ProjectId(project.id, 1, "user-1");
  const { prompt, versionIds } = await seedPrompt(projectId, "score-product", 1);
  const [oldVersionId, newVersionId] = versionIds;
  const dataSet = await seedDataSet(projectId, "supplement scoring");
  const records = await insertDataSetRecords([
    { tenantId: 1, projectId: project.id, dataSetId: dataSet.id, variables: JSON.stringify({ word: "zinc" }) },
    { tenantId: 1, projectId: project.id, dataSetId: dataSet.id, variables: JSON.stringify({ word: "iron" }) },
  ]);
  const db = drizzle(env.DB);
  const [base] = await db.insert(evaluations).values({
    tenantId: 1, projectId: project.id, datasetId: dataSet.id, name: "v1", slug: "v1", type: "run", state: "finished",
  }).returning();
  await insertEvaluationPrompts([
    { tenantId: 1, projectId: project.id, evaluationId: base.id, promptId: prompt.id, versionId: oldVersionId },
  ]);
  await db.insert(evaluationResults).values(records.map((record) => ({
    tenantId: 1,
    projectId: project.id,
    evaluationId: base.id,
    dataSetRecordId: record.id,
    promptId: prompt.id,
    versionId: oldVersionId,
    result: JSON.stringify({ content: `old answer ${record.id}`, model: "gpt-4o-mini" }),
    durationMs: 900,
  })));
  const [next] = await db.insert(evaluations).values({
    tenantId: 1, projectId: project.id, datasetId: dataSet.id, name: "v1 vs v2", slug: "v1-vs-v2", type: "comparison",
    state: "created", baseEvaluationId: base.id,
  }).returning();
  await insertEvaluationPrompts([
    { tenantId: 1, projectId: project.id, evaluationId: next.id, promptId: prompt.id, versionId: oldVersionId },
    { tenantId: 1, projectId: project.id, evaluationId: next.id, promptId: prompt.id, versionId: newVersionId },
  ]);
  return {
    payload: { userId: "user-1", tenantId: 1, projectId: project.id, evaluationId: next.id, startedAtMs: Date.now() },
    recordIds: records.map((record) => record.id),
    oldVersionId,
    newVersionId,
  };
}

describe("EvaluationWorkflow - parallel calls and reused results", () => {
  beforeEach(() => {
    mockResponsesCreate.mockReset();
  });

  it("sends the calls of different records at the same time", async () => {
    const fixture = await setupEvaluation();
    let inFlight = 0;
    let maxInFlight = 0;
    mockResponsesCreate.mockImplementation(async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight--;
      return openAIResponse("7.5");
    });

    await runWorkflow(fixture.payload);

    expect(maxInFlight).toBe(2);
    expect(await readResults(fixture.payload.evaluationId)).toHaveLength(2);
  });

  it("copies the results of the base evaluation and runs only the new version", async () => {
    const fixture = await setupReuse();
    mockResponsesCreate.mockResolvedValue(openAIResponse("new answer"));

    await runWorkflow(fixture.payload);

    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    const results = await readResults(fixture.payload.evaluationId);
    expect(results.map((row) => [row.dataSetRecordId, row.versionId])).toEqual([
      [fixture.recordIds[0], fixture.oldVersionId],
      [fixture.recordIds[0], fixture.newVersionId],
      [fixture.recordIds[1], fixture.oldVersionId],
      [fixture.recordIds[1], fixture.newVersionId],
    ]);
    const copied = results.filter((row) => row.versionId === fixture.oldVersionId);
    expect(copied.map((row) => JSON.parse(row.result).content)).toEqual([
      `old answer ${fixture.recordIds[0]}`,
      `old answer ${fixture.recordIds[1]}`,
    ]);

    const reused = await env.DB.prepare("SELECT details FROM EvaluationEvents WHERE evaluationId = ? AND type = 'results_reused'")
      .bind(fixture.payload.evaluationId)
      .first<{ details: string }>();
    expect(JSON.parse(reused!.details)).toMatchObject({ reusedCalls: 2 });
    const evaluation = await env.DB.prepare("SELECT state, outputSchema FROM Evaluations WHERE id = ?")
      .bind(fixture.payload.evaluationId)
      .first<{ state: string; outputSchema: string }>();
    expect(evaluation?.state).toBe("finished");
    expect(JSON.parse(evaluation!.outputSchema)).toEqual({ fields: { value: { type: "string" } } });
  });

  it("does not copy or run a call twice when the workflow runs again", async () => {
    const fixture = await setupReuse();
    mockResponsesCreate.mockResolvedValue(openAIResponse("new answer"));

    await runWorkflow(fixture.payload);
    await runWorkflow(fixture.payload);

    expect(await readResults(fixture.payload.evaluationId)).toHaveLength(4);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
  });
});
