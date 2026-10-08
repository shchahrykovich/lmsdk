import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService, type CreateEvaluationInput } from "../../../../worker/evaluations/evaluation.service";
import { ClientInputValidationError } from "../../../../worker/shared/errors";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { countRows, seedDataSet, seedPrompt } from "../../helpers/seed";

describe("EvaluationService - createEvaluation with a base evaluation", () => {
  let service: EvaluationService;
  const project = new ProjectId(1, 1, "test-user");
  const otherTenantProject = new ProjectId(1, 2, "other-user");

  beforeEach(async () => {
    await applyMigrations();
    service = new EvaluationService(env.DB);
  });

  const inputFor = async (projectId: ProjectId, name: string, datasetName = "Tickets"): Promise<CreateEvaluationInput> => {
    const dataset = await seedDataSet(projectId, datasetName);
    const { prompt, versionIds } = await seedPrompt(projectId, `classify-${name.toLowerCase().replace(/\W/g, "-")}`);
    return { name, type: "run", datasetId: dataset.id, prompts: [{ promptId: prompt.id, versionId: versionIds[0] }] };
  };

  it("stores the base evaluation id", async () => {
    const baseInput = await inputFor(project, "Base");
    const base = await service.createEvaluation(project, baseInput);

    const created = await service.createEvaluation(project, { ...baseInput, name: "Next", baseEvaluationId: base.id });

    expect(created.baseEvaluationId).toBe(base.id);
    const row = await env.DB.prepare("SELECT baseEvaluationId FROM Evaluations WHERE id = ?").bind(created.id).first<{ baseEvaluationId: number }>();
    expect(row?.baseEvaluationId).toBe(base.id);
  });

  it("rejects a base evaluation on another dataset and writes nothing", async () => {
    const base = await service.createEvaluation(project, await inputFor(project, "Base", "Tickets"));
    const input = await inputFor(project, "Next", "Emails");

    await expect(service.createEvaluation(project, { ...input, baseEvaluationId: base.id })).rejects.toThrow(
      "must use the same dataset"
    );
    expect(await countRows("Evaluations")).toBe(1);
  });

  it("rejects a base evaluation of another tenant", async () => {
    const foreign = await service.createEvaluation(otherTenantProject, await inputFor(otherTenantProject, "Foreign"));
    const input = await inputFor(project, "Next");

    await expect(service.createEvaluation(project, { ...input, baseEvaluationId: foreign.id })).rejects.toBeInstanceOf(
      ClientInputValidationError
    );
    expect(await countRows("Evaluations")).toBe(1);
  });
});
