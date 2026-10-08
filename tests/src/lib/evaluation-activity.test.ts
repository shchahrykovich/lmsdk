import { describe, expect, it } from "vitest";
import {
  currentStatus,
  describeEvent,
  describeProgress,
  progressPercent,
  type ActivityEvent,
  type EvaluationActivity,
} from "../../../src/lib/evaluation-activity";

const labels = { 202: "score product v3", 201: "score product v2" };
const at = (iso: string) => new Date(iso).getTime();

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  id: 1,
  type: "started",
  recordId: null,
  promptId: null,
  versionId: null,
  details: {},
  createdAt: "2026-09-26T11:43:41.000Z",
  ...overrides,
});

const call = (type: ActivityEvent["type"], details: ActivityEvent["details"], createdAt = "2026-09-26T11:43:41.000Z") =>
  event({ type, recordId: 182, promptId: 22, versionId: 202, details, createdAt });

const activity = (events: ActivityEvent[], progress: Partial<EvaluationActivity["progress"]> = {}): EvaluationActivity => ({
  events,
  progress: {
    totalCalls: 20,
    succeededCalls: 0,
    sentAttempts: 0,
    failedAttempts: 0,
    lastEventAt: events[0]?.createdAt ?? null,
    ...progress,
  },
});

describe("describeEvent", () => {
  it("describes the start and the end of the run", () => {
    expect(describeEvent(event({ type: "started", details: { totalCalls: 20 } }), labels)).toBe("Started: 20 calls to run");
    expect(describeEvent(event({ type: "results_reused", details: { reusedCalls: 12, baseEvaluationId: 7 } }), labels)).toBe(
      "Reused 12 results from evaluation #7"
    );
    expect(describeEvent(event({ type: "finished", details: { durationMs: 291779 } }), labels)).toBe("Finished in 4m 52s");
    expect(describeEvent(event({ type: "failed", details: { durationMs: 312000, error: "400 Invalid value" } }), labels))
      .toBe("Failed after 5m 12s: 400 Invalid value");
  });

  it("describes each call with its record, prompt version, model and attempt", () => {
    expect(describeEvent(call("call_started", { attempt: 2, provider: "openai", model: "gpt-6-luna" }), labels))
      .toBe("Sent record #182 to score product v3 (openai/gpt-6-luna), attempt 2");
    expect(describeEvent(call("call_succeeded", { attempt: 1, durationMs: 8491 }), labels))
      .toBe("Answer for record #182 from score product v3 in 8.5s");
    expect(describeEvent(call("call_failed", { attempt: 1, error: "400 Invalid value" }), labels))
      .toBe("Record #182 on score product v3 failed on attempt 1: 400 Invalid value");
  });

  it("falls back to the version id when the prompt version is unknown", () => {
    expect(describeEvent(event({ type: "call_succeeded", recordId: 5, versionId: 999, details: {} }), labels))
      .toBe("Answer for record #5 from version 999");
  });
});

describe("describeProgress", () => {
  it("counts finished calls and failed attempts", () => {
    expect(describeProgress(activity([], { succeededCalls: 3, failedAttempts: 1 }).progress)).toBe("3 of 20 calls done · 1 failed attempt");
    expect(describeProgress(activity([], { totalCalls: 1, succeededCalls: 1 }).progress)).toBe("1 of 1 call done");
  });

  it("gives the share of finished calls for the progress bar", () => {
    expect(progressPercent(activity([], { succeededCalls: 5 }).progress)).toBe(25);
    expect(progressPercent(activity([], { totalCalls: 0 }).progress)).toBe(0);
  });

  it("counts results reused from an earlier evaluation as done", () => {
    const progress = activity([], { succeededCalls: 4, reusedCalls: 10 }).progress;

    expect(describeProgress(progress)).toBe("14 of 20 calls done (10 reused)");
    expect(progressPercent(progress)).toBe(70);
  });
});

describe("currentStatus", () => {
  it("shows the call that is waiting for an answer and for how long", () => {
    const sent = call("call_started", { attempt: 2 }, "2026-09-26T11:50:00.000Z");

    expect(currentStatus("running", activity([sent]), labels, at("2026-09-26T11:53:12.000Z"))).toEqual({
      tone: "info",
      text: "Waiting 3m 12s for an answer for record #182 from score product v3 (attempt 2)",
    });
  });

  it("warns that the run may be stuck when a call has no answer after 11 minutes", () => {
    const sent = call("call_started", { attempt: 1 }, "2026-09-26T11:43:41.000Z");

    expect(currentStatus("running", activity([sent]), labels, at("2026-09-26T12:02:50.000Z"))).toEqual({
      tone: "warning",
      text: "No answer for record #182 from score product v3 for 19m 9s. A call ends or is retried within 10 minutes, so the run may be stuck.",
    });
  });

  it("warns when there is no activity at all for 11 minutes", () => {
    const answered = call("call_succeeded", { durationMs: 1000 }, "2026-09-26T11:43:41.000Z");

    expect(currentStatus("running", activity([answered]), labels, at("2026-09-26T11:55:00.000Z")).tone).toBe("warning");
    expect(currentStatus("running", activity([answered]), labels, at("2026-09-26T11:44:00.000Z"))).toEqual({
      tone: "info",
      text: "Running. Last activity 19s ago",
    });
  });

  it("says that the run has not started yet when there are no events", () => {
    expect(currentStatus("running", activity([]), labels, at("2026-09-26T11:44:00.000Z"))).toEqual({
      tone: "info",
      text: "Waiting for the run to start",
    });
  });

  it("shows the error of a failed run and the duration of a finished run", () => {
    const failed = event({ type: "failed", details: { durationMs: 312000, error: "400 Invalid value" } });
    const finished = event({ type: "finished", details: { durationMs: 291779 } });

    expect(currentStatus("failed", activity([failed]), labels, 0)).toEqual({ tone: "error", text: "Failed after 5m 12s: 400 Invalid value" });
    expect(currentStatus("finished", activity([finished]), labels, 0)).toEqual({ tone: "success", text: "Finished in 4m 52s" });
  });
});
