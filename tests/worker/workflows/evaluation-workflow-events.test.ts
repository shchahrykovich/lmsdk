import { describe, it, expect, beforeEach, vi } from "vitest";
import { env } from "cloudflare:test";
import { openAIResponse, retryingStep, runWorkflow, setupEvaluation, type EvaluationFixture } from "./evaluation-workflow-fixtures";

const mockResponsesCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
  },
}));

type EventRow = { type: string; recordId: number | null; versionId: number | null; details: string };

const readEvents = async () =>
  (await env.DB.prepare("SELECT type, recordId, versionId, details FROM EvaluationEvents ORDER BY id").all<EventRow>()).results
    .map((row) => ({ ...row, details: JSON.parse(row.details) as Record<string, unknown> }));

const readState = async (evaluationId: number) =>
  (await env.DB.prepare("SELECT state FROM Evaluations WHERE id = ?").bind(evaluationId).first<{ state: string }>())?.state;

const withoutEventInserts = (db: D1Database): D1Database =>
  new Proxy(db, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) => {
          if (query.includes("insert into \"EvaluationEvents\"")) {
            throw new Error("D1 unavailable");
          }
          return target.prepare(query);
        };
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });

describe("EvaluationWorkflow - activity events", () => {
  let fixture: EvaluationFixture;

  beforeEach(async () => {
    mockResponsesCreate.mockReset();
    fixture = await setupEvaluation();
  });

  it("records the start, each sent and answered call, and the end", async () => {
    mockResponsesCreate.mockResolvedValue(openAIResponse("7.5"));

    await runWorkflow(fixture.payload);

    const [first, second] = fixture.recordIds;
    const call = { attempt: 1, provider: "openai", model: "gpt-4o-mini" };
    const events = await readEvents();
    expect(events.map(({ type, recordId }) => [type, recordId])).toEqual([
      ["started", null],
      ["call_started", first],
      ["call_succeeded", first],
      ["call_started", second],
      ["call_succeeded", second],
      ["finished", null],
    ]);
    expect(events[0].details).toEqual({ totalCalls: 2 });
    expect(events[1]).toMatchObject({ versionId: fixture.versionId, details: call });
    expect(events[2].details).toMatchObject({ attempt: 1, durationMs: expect.any(Number) });
    expect(events[5].details).toEqual({ durationMs: expect.any(Number) });
  });

  it("numbers each retry, records every error, and marks the evaluation failed at the end", async () => {
    mockResponsesCreate.mockRejectedValue(new Error("400 Invalid value: 'disabled'."));

    await expect(runWorkflow(fixture.payload, { step: retryingStep(3) })).rejects.toThrow("400 Invalid value");

    const events = await readEvents();
    expect(events.map(({ type, details }) => [type, details.attempt ?? null])).toEqual([
      ["started", null],
      ["call_started", 1],
      ["call_failed", 1],
      ["call_started", 2],
      ["call_failed", 2],
      ["call_started", 3],
      ["call_failed", 3],
      ["failed", null],
    ]);
    expect(events[2].details).toMatchObject({ error: "400 Invalid value: 'disabled'." });
    expect(events[7].details).toMatchObject({ error: "400 Invalid value: 'disabled'.", durationMs: expect.any(Number) });
    expect(await readState(fixture.payload.evaluationId)).toBe("failed");
  });

  it("still runs the calls when events cannot be saved, so paid calls are not repeated", async () => {
    mockResponsesCreate.mockResolvedValue(openAIResponse("7.5"));

    await runWorkflow(fixture.payload, { db: withoutEventInserts(env.DB) });

    const results = await env.DB.prepare("SELECT COUNT(*) AS count FROM EvaluationResults").first<{ count: number }>();
    expect(results?.count).toBe(2);
    expect(mockResponsesCreate).toHaveBeenCalledTimes(2);
    expect(await readState(fixture.payload.evaluationId)).toBe("finished");
  });
});
