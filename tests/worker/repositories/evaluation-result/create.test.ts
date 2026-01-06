import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationResultRepository } from "../../../../worker/repositories/evaluation-result.repository";
import { EvaluationRepository } from "../../../../worker/repositories/evaluation.repository";
import { DataSetRepository } from "../../../../worker/repositories/dataset.repository";
import { DataSetRecordRepository } from "../../../../worker/repositories/dataset-record.repository";
import { PromptRepository } from "../../../../worker/repositories/prompt.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { drizzle } from "drizzle-orm/d1";

describe("EvaluationResultRepository - create", () => {
  let repository: EvaluationResultRepository;
  let evaluationRepository: EvaluationRepository;
  let dataSetRepository: DataSetRepository;
  let dataSetRecordRepository: DataSetRecordRepository;
  let promptRepository: PromptRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new EvaluationResultRepository(env.DB);
    evaluationRepository = new EvaluationRepository(env.DB);
    dataSetRepository = new DataSetRepository(env.DB);
    dataSetRecordRepository = new DataSetRecordRepository(env.DB);
    const db = drizzle(env.DB);
    promptRepository = new PromptRepository(db);
  });

  it("should create evaluation result", async () => {
    const evaluation = await evaluationRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Eval",
      slug: "eval",
      type: "run",
      state: "created",
      durationMs: null,
      inputSchema: "{}",
      outputSchema: "{}",
    });

    const dataset = await dataSetRepository.create({
      tenantId: 1,
      projectId: 1,
      name: "Dataset",
      slug: "dataset",
      isDeleted: false,
      countOfRecords: 0,
      schema: "{}",
    });

    const [record] = await dataSetRecordRepository.createMany([
      {
        tenantId: 1,
        projectId: 1,
        dataSetId: dataset.id,
        variables: JSON.stringify({ name: "Ada" }),
        isDeleted: false,
      },
    ]);

    const prompt = await promptRepository.createPrompt({
      tenantId: 1,
      projectId: 1,
      name: "Prompt",
      slug: "prompt",
      provider: "openai",
      model: "gpt-4o",
      body: "{}",
      isDeleted: false,
      isActive: true,
      latestVersion: 1,
    });

    const version = await promptRepository.createPromptVersion({
      promptId: prompt.id,
      tenantId: 1,
      projectId: 1,
      version: 1,
      name: "Prompt v1",
      provider: "openai",
      model: "gpt-4o",
      body: "{}",
      slug: "prompt-v1",
    });

    const result = await repository.create({
      tenantId: 1,
      projectId: 1,
      evaluationId: evaluation.id,
      dataSetRecordId: record.id,
      promptId: prompt.id,
      versionId: version.id,
      result: JSON.stringify({ content: "ok" }),
      durationMs: 120,
      stats: JSON.stringify({ usage: { total_tokens: 10 } }),
    });

    expect(result.id).toBeDefined();

    const saved = await env.DB.prepare(
      "SELECT result FROM EvaluationResults WHERE id = ?"
    )
      .bind(result.id)
      .first<{ result: string }>();

    expect(saved?.result).toBe(JSON.stringify({ content: "ok" }));
  });
});
