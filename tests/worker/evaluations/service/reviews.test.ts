import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { EvaluationService } from "../../../../worker/evaluations/evaluation.service";
import { ClientInputValidationError, NotFoundError } from "../../../../worker/shared/errors";
import { EntityId } from "../../../../worker/shared/entity-id";
import { ProjectId } from "../../../../worker/shared/project-id";
import { applyMigrations } from "../../helpers/db-setup";
import { countRows } from "../../helpers/seed";

const evaluationOf = (tenantId: number) => new EntityId(1, new ProjectId(1, tenantId, "test-user"));
const pair = { recordId: 5, leftVersionId: 100, rightVersionId: 101 };

describe("EvaluationService - summary and manual reviews", () => {
  let service: EvaluationService;

  beforeEach(async () => {
    await applyMigrations();
    service = new EvaluationService(env.DB);
    await env.DB.prepare(
      `INSERT INTO Evaluations (id, tenantId, projectId, datasetId, name, slug, type, state, inputSchema, outputSchema)
       VALUES (1, 1, 1, 8, 'Eval', 'eval', 'comparison', 'finished', '{}', '{}')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO EvaluationPrompts (tenantId, projectId, evaluationId, promptId, versionId) VALUES (1, 1, 1, 10, 100), (1, 1, 1, 10, 101)`
    ).run();
    await env.DB.prepare(
      `INSERT INTO DataSetRecords (id, tenantId, projectId, dataSetId, variables) VALUES (5, 1, 1, 8, '{}'), (6, 1, 1, 9, '{}')`
    ).run();
  });

  describe("updateSummary", () => {
    it("saves the summary, and clears it for an empty string", async () => {
      expect((await service.updateSummary(evaluationOf(1), "v2 wins on short tickets")).summary).toBe("v2 wins on short tickets");
      expect((await service.updateSummary(evaluationOf(1), "   ")).summary).toBeNull();
    });

    it("throws NotFoundError for an evaluation of another tenant and changes nothing", async () => {
      await expect(service.updateSummary(evaluationOf(2), "x")).rejects.toBeInstanceOf(NotFoundError);
      const row = await env.DB.prepare("SELECT summary FROM Evaluations WHERE id = 1").first<{ summary: string | null }>();
      expect(row?.summary).toBeNull();
    });
  });

  describe("saveComparison", () => {
    it("saves a review and returns it in the evaluation details", async () => {
      await service.saveComparison(evaluationOf(1), pair, { description: "Right is shorter", score: 2 });

      const details = await service.getEvaluationDetails(evaluationOf(1));

      expect(details?.comparisons).toEqual([
        { ...pair, description: "Right is shorter", score: 2, updatedAt: expect.any(Date) },
      ]);
    });

    it.each([3, -3, 0.5])("rejects score %s", async (score) => {
      await expect(service.saveComparison(evaluationOf(1), pair, { description: null, score })).rejects.toBeInstanceOf(
        ClientInputValidationError
      );
      expect(await countRows("EvaluationComparisons")).toBe(0);
    });

    it("rejects a version that is not part of the evaluation", async () => {
      await expect(
        service.saveComparison(evaluationOf(1), { ...pair, rightVersionId: 999 }, { description: null, score: 0 })
      ).rejects.toThrow("Both prompt versions must be part of this evaluation");
    });

    it("rejects the same version on both sides", async () => {
      await expect(
        service.saveComparison(evaluationOf(1), { ...pair, rightVersionId: 100 }, { description: null, score: 0 })
      ).rejects.toThrow("two different prompt versions");
    });

    it("rejects a record from another dataset", async () => {
      await expect(
        service.saveComparison(evaluationOf(1), { ...pair, recordId: 6 }, { description: null, score: 0 })
      ).rejects.toThrow("Record 6 is not in the dataset of this evaluation");
    });

    it("throws NotFoundError for an evaluation of another tenant and writes nothing", async () => {
      await expect(service.saveComparison(evaluationOf(2), pair, { description: "x", score: 1 })).rejects.toBeInstanceOf(
        NotFoundError
      );
      expect(await countRows("EvaluationComparisons")).toBe(0);
    });
  });
});
