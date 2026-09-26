import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService, type EvaluationWorkflowBinding } from "../../../../worker/evaluations/evaluation.service";
import { ConflictError } from "../../../../worker/shared/errors";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { seedDataSet, seedPrompt } from "../../helpers/seed";

const workflowThatFailsOnce = () => {
  const create = vi.fn(async ({ params }: { params: { evaluationId: number } }) => ({ id: `wf-${params.evaluationId}` }));
  create.mockRejectedValueOnce(new Error("Workflows is unavailable"));
  return { binding: { create } as unknown as EvaluationWorkflowBinding, create };
};

const readEvaluation = async () =>
  await env.DB.prepare("SELECT workflowId, state FROM Evaluations").all<{ workflowId: string | null; state: string }>();

describe("EvaluationService - createAndStartEvaluation retry", () => {
  let service: EvaluationService;
  const project = new ProjectId(1, 1, "test-user");
  let input: { name: string; type: "run"; datasetId: number; prompts: { promptId: number; versionId: number }[] };

  beforeEach(async () => {
    await applyMigrations();
    service = new EvaluationService(env.DB);
    const dataset = await seedDataSet(project, "Tickets");
    const { prompt, versionIds } = await seedPrompt(project, "classifier", 1);
    input = { name: "Retry", type: "run", datasetId: dataset.id, prompts: [{ promptId: prompt.id, versionId: versionIds[0] }] };
  });

  it("leaves the evaluation without a workflow when the start fails", async () => {
    const workflow = workflowThatFailsOnce();

    await expect(service.createAndStartEvaluation(project, input, workflow.binding)).rejects.toThrow("Workflows is unavailable");

    expect((await readEvaluation()).results).toEqual([{ workflowId: null, state: "created" }]);
  });

  it("starts the workflow for the existing evaluation on a retry with the same definition", async () => {
    const workflow = workflowThatFailsOnce();
    await service.createAndStartEvaluation(project, input, workflow.binding).catch(() => undefined);

    const evaluation = await service.createAndStartEvaluation(project, input, workflow.binding);

    expect(evaluation.workflowId).toBe(`wf-${evaluation.id}`);
    expect((await readEvaluation()).results).toHaveLength(1);
  });

  it("throws ConflictError when the retry changes the definition", async () => {
    const workflow = workflowThatFailsOnce();
    await service.createAndStartEvaluation(project, input, workflow.binding).catch(() => undefined);
    const { prompt, versionIds } = await seedPrompt(project, "other");

    await expect(
      service.createAndStartEvaluation(project, { ...input, prompts: [{ promptId: prompt.id, versionId: versionIds[0] }] }, workflow.binding)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("reports the status as starting while the start is claimed", async () => {
    const evaluation = await service.createEvaluation(project, input);

    const status = await service.getWorkflowStatus({ ...evaluation, workflowId: "pending" }, workflowThatFailsOnce().binding);

    expect(status).toBe("starting");
  });

  it("throws ConflictError when the evaluation already has a workflow", async () => {
    const workflow = workflowThatFailsOnce();
    workflow.create.mockReset();
    workflow.create.mockImplementation(async ({ params }) => ({ id: `wf-${params.evaluationId}` }));
    await service.createAndStartEvaluation(project, input, workflow.binding);

    await expect(service.createAndStartEvaluation(project, input, workflow.binding)).rejects.toBeInstanceOf(ConflictError);
    expect(workflow.create).toHaveBeenCalledTimes(1);
  });
});
