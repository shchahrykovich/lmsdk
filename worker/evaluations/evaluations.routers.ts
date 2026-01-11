import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.middleware";
import { EvaluationService } from "./evaluation.service";
import type { HonoEnv } from "../routes/app";
import { Pagination } from "../shared/pagination";
import { ProjectId } from "../shared/project-id";
import { EntityId } from "../shared/entity-id";
import { ClientInputValidationError, NotFoundError } from "../shared/errors";

const evaluations = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
evaluations.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/evaluations
 * List all evaluations for a project with pagination
 */
evaluations.get("/:projectId/evaluations", async (c) => {
  const projectId = ProjectId.parse(c);
	const pagination = Pagination.parse(c.req.query.bind(c.req));

  const evaluationService = new EvaluationService(c.env.DB);
  const result = await evaluationService.getEvaluationsPaginated(
		projectId,
		pagination.page,
    pagination.size
  );

  return c.json(result);
});

/**
 * GET /api/projects/:projectId/evaluations/:evaluationId
 * Get evaluation details with results
 */
evaluations.get("/:projectId/evaluations/:evaluationId", async (c) => {
  const evaluationId = EntityId.parse(c, "evaluationId");

  const evaluationService = new EvaluationService(c.env.DB);

  const details = await evaluationService.getEvaluationDetails(evaluationId);

  if (!details) {
    throw new NotFoundError("Evaluation not found");
  }

  return c.json(details);
});

const validateCreateEvaluationRequest = (body: {
  name?: unknown;
  type?: unknown;
  datasetId?: unknown;
  prompts?: unknown;
}):
  | { error: string; status: 400 }
  | {
      name: string;
      type: "run" | "comparison";
      datasetId: number;
      prompts: { promptId: number; versionId: number }[];
    } => {
  const { name, type, datasetId, prompts } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return { error: "Name is required", status: 400 };
  }

  const parsedDatasetId = Number(datasetId);
  if (!Number.isInteger(parsedDatasetId) || parsedDatasetId <= 0) {
    return { error: "Valid dataset ID is required", status: 400 };
  }

  const evaluationType: "run" | "comparison" = type === "comparison" ? "comparison" : "run";
  const promptList = Array.isArray(prompts) ? prompts : [];
  const parsedPrompts = promptList
    .map((prompt: { promptId?: unknown; versionId?: unknown }) => ({
      promptId: Number(prompt.promptId),
      versionId: Number(prompt.versionId),
    }))
    .filter(
      (prompt: { promptId: number; versionId: number }) =>
        Number.isInteger(prompt.promptId) && Number.isInteger(prompt.versionId)
    );

  if (parsedPrompts.length === 0) {
    return { error: "At least one prompt is required", status: 400 };
  }

  if (parsedPrompts.length > 3) {
    return { error: "Maximum of 3 prompts allowed", status: 400 };
  }

  return {
    name: name.trim(),
    type: evaluationType,
    datasetId: parsedDatasetId,
    prompts: parsedPrompts,
  };
};

/**
 * POST /api/projects/:projectId/evaluations
 * Create a new evaluation
 */
evaluations.post("/:projectId/evaluations", async (c) => {
  const projectId = ProjectId.parse(c);

  const body = await c.req.json();
  const validation = validateCreateEvaluationRequest(body);

  if ("error" in validation) {
    throw new ClientInputValidationError(validation.error);
  }

  const evaluationService = new EvaluationService(c.env.DB);

  const evaluation = await evaluationService.createEvaluation(projectId, validation);

  const workflowInstance = await c.env.EVALUATION_WORKFLOW.create({
    params: {
      tenantId: projectId.tenantId,
      projectId: projectId.id,
      evaluationId: evaluation.id,
      startedAtMs: Date.now(),
			userId: projectId.userId,
    },
  });

  const updatedEvaluation = await evaluationService.setWorkflowId(
    new EntityId(evaluation.id, projectId),
    workflowInstance.id
  );

  return c.json({ evaluation: updatedEvaluation }, 201);
});

/**
 * DELETE /api/projects/:projectId/evaluations/:evaluationId
 * Delete an evaluation
 */
evaluations.delete("/:projectId/evaluations/:evaluationId", async (c) => {
  const evaluationId = EntityId.parse(c, "evaluationId");

  const evaluationService = new EvaluationService(c.env.DB);
  await evaluationService.deleteEvaluation(evaluationId);

  return c.json({ success: true }, 200);
});

export default evaluations;
