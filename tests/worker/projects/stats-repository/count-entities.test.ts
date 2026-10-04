import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { ProjectStatsRepository } from "../../../../worker/projects/project-stats.repository";
import { applyMigrations } from "../../helpers/db-setup";
import { insertDataSet, insertEvaluation, insertPrompt, insertTrace } from "../stats-fixtures";

describe("ProjectStatsRepository - entity counts", () => {
  let repository: ProjectStatsRepository;

  beforeEach(async () => {
    await applyMigrations();
    repository = new ProjectStatsRepository(env.DB);
  });

  it("counts only active prompts", async () => {
    await insertPrompt(1, 10);
    await insertPrompt(1, 10);
    await insertPrompt(1, 10, false);

    expect(await repository.countActivePrompts({ tenantId: 1 })).toEqual([{ projectId: 10, value: 2 }]);
  });

  it("counts traces and evaluations per project", async () => {
    await insertTrace(1, 10);
    await insertTrace(1, 20);
    await insertTrace(1, 20);
    await insertEvaluation(1, 20);

    const traces = await repository.countTraces({ tenantId: 1 });
    const evaluations = await repository.countEvaluations({ tenantId: 1 });

    expect(traces.sort((a, b) => a.projectId - b.projectId)).toEqual([
      { projectId: 10, value: 1 },
      { projectId: 20, value: 2 },
    ]);
    expect(evaluations).toEqual([{ projectId: 20, value: 1 }]);
  });

  it("sums records of datasets that are not deleted", async () => {
    await insertDataSet(1, 10, 5);
    await insertDataSet(1, 10, 7);
    await insertDataSet(1, 10, 100, true);

    expect(await repository.sumDataSets({ tenantId: 1 })).toEqual([{ projectId: 10, datasets: 2, records: 12 }]);
  });

  it("does not count rows of another tenant", async () => {
    await insertPrompt(2, 10);
    await insertTrace(2, 10);
    await insertDataSet(2, 10, 3);
    await insertEvaluation(2, 10);

    const scope = { tenantId: 1, projectId: 10 };
    expect(await repository.countActivePrompts(scope)).toEqual([]);
    expect(await repository.countTraces(scope)).toEqual([]);
    expect(await repository.sumDataSets(scope)).toEqual([]);
    expect(await repository.countEvaluations(scope)).toEqual([]);
  });
});
