import { OpenAPIRoute } from "chanfana";
import { z } from "zod";
import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import type { HonoEnv } from "../../routes/app";
import { EvaluationService } from "../../evaluations/evaluation.service";
import { PromptService } from "../../prompts/prompt.service";
import { PromptVersionId } from "../../prompts/prompt-version-id";
import { ClientInputValidationError, NotFoundError } from "../../shared/errors";
import { ManageResolver } from "./resolve";
import { parseResult, serializeComparison, serializeEvaluation } from "./serializers";
import {
  COMPARISON_DESCRIPTION_MAX_LENGTH,
  COMPARISON_SCORE_MAX,
  COMPARISON_SCORE_MIN,
  SUMMARY_MAX_LENGTH,
} from "../../evaluations/evaluation-review-limits";
import {
  EvaluationComparisonSchema,
  EvaluationSchema,
  MANAGE_TAG,
  SlugOrId,
  conflictResponse,
  errorResponses,
  jsonBody,
  jsonContent,
  manageSecurity,
  notFoundResponse,
} from "./schemas";

const MAX_PROMPTS_PER_EVALUATION = 3;

const projectParams = z.object({ project: SlugOrId });

const WorkflowStatusSchema = z
  .string()
  .nullable()
  .describe(
    "Status of the background run: starting, queued, running, complete, errored, terminated, unknown. Null when no run was started. Stop polling on state=finished or on errored/terminated."
  );

export class ManageListEvaluations extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "List evaluations",
    security: manageSecurity,
    request: {
      params: projectParams,
      query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      }),
    },
    responses: {
      "200": jsonContent(
        z.object({
          evaluations: z.array(EvaluationSchema),
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
          totalPages: z.number(),
        }),
        "Evaluations, newest first"
      ),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, query } = await this.getValidatedData<typeof this.schema>();
    const { projectId } = await new ManageResolver(c).project(params.project);
    const result = await new EvaluationService(c.env.DB).listEvaluationRows(projectId, query.page, query.pageSize);
    return c.json({ ...result, evaluations: result.evaluations.map(serializeEvaluation) });
  }
}

export class ManageCreateEvaluation extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Start an evaluation",
    description: [
      "Runs every record of the dataset through each prompt version, in the background.",
      "Each record x version is one paid model call.",
      "Poll GET .../evaluations/{evaluation} for the results.",
      "A repeat with the same name returns 409.",
      "Set reuseResultsFrom to copy results from an earlier evaluation on the same dataset:",
      "calls for a prompt version that the earlier evaluation already ran are not sent again.",
    ].join(" "),
    security: manageSecurity,
    request: {
      params: projectParams,
      body: jsonBody(
        z.object({
          name: z.string().trim().min(1).max(200),
          type: z.enum(["run", "comparison"]).optional().describe("Default: comparison for 2 or more prompts, else run"),
          dataset: SlugOrId,
          prompts: z
            .array(z.object({ prompt: SlugOrId, version: z.number().int().min(1) }))
            .min(1)
            .max(MAX_PROMPTS_PER_EVALUATION)
            .describe("1 to 3 prompt versions to compare, by prompt slug or id and version number"),
          reuseResultsFrom: SlugOrId.optional().describe(
            "Slug or id of an earlier evaluation on the same dataset. Its results are copied for the prompt versions both evaluations share, so only the other versions are run."
          ),
        })
      ),
    },
    responses: {
      "201": jsonContent(z.object({ evaluation: EvaluationSchema }), "The started evaluation"),
      ...errorResponses,
      ...notFoundResponse,
      ...conflictResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { dataSet } = await resolver.dataSet(projectId, body.dataset);

    const promptService = new PromptService(drizzle(c.env.DB));
    const prompts = [];
    for (const item of body.prompts) {
      const { prompt, promptId } = await resolver.prompt(projectId, item.prompt);
      const version = await promptService.getPromptVersion(new PromptVersionId(item.version, promptId));
      if (!version) {
        throw new ClientInputValidationError(`Prompt "${item.prompt}" has no version ${item.version}`);
      }
      prompts.push({ promptId: prompt.id, versionId: version.id });
    }

    const base = body.reuseResultsFrom ? await resolver.evaluation(projectId, body.reuseResultsFrom) : undefined;

    const evaluation = await new EvaluationService(c.env.DB).createAndStartEvaluation(
      projectId,
      {
        name: body.name,
        type: body.type ?? (prompts.length > 1 ? "comparison" : "run"),
        datasetId: dataSet.id,
        prompts,
        ...(base ? { baseEvaluationId: base.evaluation.id } : {}),
      },
      c.env.EVALUATION_WORKFLOW
    );

    return c.json({ evaluation: serializeEvaluation(evaluation) }, 201);
  }
}

export class ManageGetEvaluation extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Get an evaluation with its results",
    description: "Poll this until state is finished, or workflowStatus is errored or terminated.",
    security: manageSecurity,
    request: { params: z.object({ project: SlugOrId, evaluation: SlugOrId }) },
    responses: {
      "200": jsonContent(
        z.object({
          evaluation: EvaluationSchema,
          workflowStatus: WorkflowStatusSchema,
          prompts: z.array(
            z.object({ promptId: z.number(), versionId: z.number(), version: z.number(), promptName: z.string() })
          ),
          results: z.array(
            z.object({
              recordId: z.number(),
              variables: z.unknown(),
              outputs: z.array(
                z.object({ promptId: z.number(), versionId: z.number(), result: z.unknown(), durationMs: z.number().nullable() })
              ),
            })
          ),
          comparisons: z
            .array(EvaluationComparisonSchema)
            .describe("Manual reviews: one per record and pair of prompt versions that someone reviewed"),
        }),
        "The evaluation, the status of its background run, one entry per record with results, and the manual reviews"
      ),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { evaluationId } = await resolver.evaluation(projectId, params.evaluation);

    const service = new EvaluationService(c.env.DB);
    const details = await service.getEvaluationDetails(evaluationId);
    if (!details) {
      throw new NotFoundError("Evaluation not found");
    }

    return c.json({
      evaluation: serializeEvaluation(details.evaluation),
      workflowStatus: await service.getWorkflowStatus(details.evaluation, c.env.EVALUATION_WORKFLOW),
      prompts: details.prompts.map(({ promptId, versionId, version, promptName }) => ({ promptId, versionId, version, promptName })),
      results: details.results.map((record) => ({
        recordId: record.recordId,
        variables: parseResult(record.variables),
        outputs: record.outputs.map((output) => ({ ...output, result: parseResult(output.result) })),
      })),
      comparisons: details.comparisons.map(serializeComparison),
    });
  }
}

const evaluationParams = z.object({ project: SlugOrId, evaluation: SlugOrId });

export class ManageUpdateEvaluation extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Update the evaluation summary",
    description: "Sets the written description of the evaluation result. Send null or an empty string to clear it. Safe to repeat.",
    security: manageSecurity,
    request: {
      params: evaluationParams,
      body: jsonBody(z.object({ summary: z.string().max(SUMMARY_MAX_LENGTH).nullable() })),
    },
    responses: {
      "200": jsonContent(z.object({ evaluation: EvaluationSchema }), "The updated evaluation"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { evaluationId } = await resolver.evaluation(projectId, params.evaluation);
    const evaluation = await new EvaluationService(c.env.DB).updateSummary(evaluationId, body.summary);
    return c.json({ evaluation: serializeEvaluation(evaluation) });
  }
}

export class ManageSaveEvaluationComparison extends OpenAPIRoute {
  schema = {
    tags: [MANAGE_TAG],
    summary: "Save a manual review of one comparison",
    description: [
      "Sets the manual description and score for one record and one pair of prompt versions.",
      "Use the versionId values from GET .../evaluations/{evaluation}.",
      "The score compares the right version with the left one.",
      "A repeat replaces the earlier review. Null clears a field.",
    ].join(" "),
    security: manageSecurity,
    request: {
      params: evaluationParams,
      body: jsonBody(
        z.object({
          recordId: z.number().int().positive(),
          leftVersionId: z.number().int().positive(),
          rightVersionId: z.number().int().positive(),
          description: z.string().max(COMPARISON_DESCRIPTION_MAX_LENGTH).nullable(),
          score: z
            .number()
            .int()
            .min(COMPARISON_SCORE_MIN)
            .max(COMPARISON_SCORE_MAX)
            .nullable()
            .describe("-2 left much better, -1 left better, 0 equal, 1 right better, 2 right much better"),
        })
      ),
    },
    responses: {
      "200": jsonContent(z.object({ comparison: EvaluationComparisonSchema }), "The saved review"),
      ...errorResponses,
      ...notFoundResponse,
    },
  };

  async handle(c: Context<HonoEnv>): Promise<Response> {
    const { params, body } = await this.getValidatedData<typeof this.schema>();
    const resolver = new ManageResolver(c);
    const { projectId } = await resolver.project(params.project);
    const { evaluationId } = await resolver.evaluation(projectId, params.evaluation);
    const comparison = await new EvaluationService(c.env.DB).saveComparison(
      evaluationId,
      { recordId: body.recordId, leftVersionId: body.leftVersionId, rightVersionId: body.rightVersionId },
      { description: body.description, score: body.score }
    );
    return c.json({ comparison: serializeComparison(comparison) });
  }
}
