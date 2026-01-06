import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.middleware";
import { getUserFromContext } from "../middleware/auth";
import { EvaluationService } from "../services/evaluation.service";
import type { HonoEnv } from "./app";

const evaluations = new Hono<HonoEnv>();

// Apply authentication middleware to all routes
evaluations.use("/*", requireAuth);

/**
 * GET /api/projects/:projectId/evaluations
 * List all evaluations for a project
 */
evaluations.get("/:projectId/evaluations", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const evaluationService = new EvaluationService(c.env.DB);

    const evaluations = await evaluationService.getEvaluations({
      tenantId: user.tenantId,
      projectId,
    });

    return c.json({ evaluations });
  } catch (error) {
    console.error("Error listing evaluations:", error);
    return c.json({ error: "Failed to list evaluations" }, 500);
  }
});

/**
 * GET /api/projects/:projectId/evaluations/:evaluationId
 * Get evaluation details with results
 */
evaluations.get("/:projectId/evaluations/:evaluationId", async (c) => {
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));
    const evaluationId = parseInt(c.req.param("evaluationId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    if (isNaN(evaluationId)) {
      return c.json({ error: "Invalid evaluation ID" }, 400);
    }

    const evaluationService = new EvaluationService(c.env.DB);

    const details = await evaluationService.getEvaluationDetails(
      {
        tenantId: user.tenantId,
        projectId,
      },
      evaluationId
    );

    if (!details) {
      return c.json({ error: "Evaluation not found" }, 404);
    }

    return c.json(details);
  } catch (error) {
    console.error("Error fetching evaluation details:", error);
    return c.json({ error: "Failed to fetch evaluation details" }, 500);
  }
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
  try {
    const user = getUserFromContext(c);
    const projectId = parseInt(c.req.param("projectId"));

    if (isNaN(projectId)) {
      return c.json({ error: "Invalid project ID" }, 400);
    }

    const body = await c.req.json();
    const validation = validateCreateEvaluationRequest(body);

    if ("error" in validation) {
      return c.json({ error: validation.error }, validation.status);
    }

    const evaluationService = new EvaluationService(c.env.DB);

    const evaluation = await evaluationService.createEvaluation(
      { tenantId: user.tenantId, projectId },
      validation
    );

    const workflowInstance = await c.env.EVALUATION_WORKFLOW.create({
      params: {
        tenantId: user.tenantId,
        projectId,
        evaluationId: evaluation.id,
        startedAtMs: Date.now(),
      },
    });

    const updatedEvaluation = await evaluationService.setWorkflowId(
      { tenantId: user.tenantId, projectId },
      evaluation.id,
      workflowInstance.id
    );

    return c.json({ evaluation: updatedEvaluation }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "Evaluation name already exists") {
      return c.json({ error: "Evaluation name already exists" }, 409);
    }
    console.error("Error creating evaluation:", error);
    return c.json({ error: "Failed to create evaluation" }, 500);
  }
});

export default evaluations;
