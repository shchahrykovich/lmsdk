import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { ClientInputValidationError, ConflictError } from "../../../../worker/shared/errors";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { countRows, seedDataSet, seedPrompt } from "../../helpers/seed";

describe("EvaluationService - createEvaluation write rules", () => {
  let service: EvaluationService;
  const project = new ProjectId(1, 1, "test-user");
  const otherProject = new ProjectId(2, 1, "test-user");

  beforeEach(async () => {
    await applyMigrations();
    service = new EvaluationService(env.DB);
  });

  it("throws ConflictError when the name already exists", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const { prompt, versionIds } = await seedPrompt(project, "classify");
    const input = {
      name: "Eval A",
      type: "run" as const,
      datasetId: dataset.id,
      prompts: [{ promptId: prompt.id, versionId: versionIds[0] }],
    };

    await service.createEvaluation(project, input);

    await expect(service.createEvaluation(project, input)).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a dataset from another project and writes nothing", async () => {
    const foreignDataset = await seedDataSet(otherProject, "Foreign");
    const { prompt, versionIds } = await seedPrompt(project, "classify");

    await expect(
      service.createEvaluation(project, {
        name: "Eval B",
        type: "run",
        datasetId: foreignDataset.id,
        prompts: [{ promptId: prompt.id, versionId: versionIds[0] }],
      })
    ).rejects.toBeInstanceOf(ClientInputValidationError);

    expect(await countRows("Evaluations")).toBe(0);
    expect(await countRows("EvaluationPrompts")).toBe(0);
  });

  it("rejects a prompt version from another project and writes nothing", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const { prompt } = await seedPrompt(project, "classify");
    const foreign = await seedPrompt(otherProject, "foreign");

    await expect(
      service.createEvaluation(project, {
        name: "Eval C",
        type: "run",
        datasetId: dataset.id,
        prompts: [{ promptId: prompt.id, versionId: foreign.versionIds[0] }],
      })
    ).rejects.toBeInstanceOf(ClientInputValidationError);

    expect(await countRows("Evaluations")).toBe(0);
  });

  it("rejects a version that belongs to a different prompt", async () => {
    const dataset = await seedDataSet(project, "Tickets");
    const promptA = await seedPrompt(project, "prompt-a");
    const promptB = await seedPrompt(project, "prompt-b");

    await expect(
      service.createEvaluation(project, {
        name: "Eval D",
        type: "run",
        datasetId: dataset.id,
        prompts: [{ promptId: promptA.prompt.id, versionId: promptB.versionIds[0] }],
      })
    ).rejects.toBeInstanceOf(ClientInputValidationError);

    expect(await countRows("Evaluations")).toBe(0);
  });
});
