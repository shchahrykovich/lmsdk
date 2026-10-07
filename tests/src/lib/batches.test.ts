import { describe, expect, it } from "vitest";
import {
  canCancelBatch,
  canFinishBatch,
  completedPercent,
  formatCost,
  isStuckBatch,
  stateFilterQuery,
} from "../../../src/lib/batches";

const counts = { total: 8, pending: 2, succeeded: 5, errored: 1, expired: 0, cancelled: 0 };

describe("batch helpers", () => {
  it("offers cancel for a draft and for an active batch that was not asked to cancel yet", () => {
    expect(canCancelBatch({ state: "draft", cancel_requested: false })).toBe(true);
    expect(canCancelBatch({ state: "running", cancel_requested: false })).toBe(true);
    expect(canCancelBatch({ state: "running", cancel_requested: true })).toBe(false);
    expect(canCancelBatch({ state: "finished", cancel_requested: false })).toBe(false);
  });

  it("offers finish only while the batch is submitting or running", () => {
    expect(canFinishBatch({ state: "submitting" })).toBe(true);
    expect(canFinishBatch({ state: "running" })).toBe(true);
    expect(canFinishBatch({ state: "draft" })).toBe(false);
    expect(canFinishBatch({ state: "cancelled" })).toBe(false);
  });

  it("calls an active batch stuck when its run has stopped", () => {
    expect(isStuckBatch({ state: "running" }, "errored")).toBe(true);
    expect(isStuckBatch({ state: "submitting" }, "terminated")).toBe(true);
    expect(isStuckBatch({ state: "running" }, "complete")).toBe(true);
    expect(isStuckBatch({ state: "running" }, "running")).toBe(false);
    expect(isStuckBatch({ state: "running" }, null)).toBe(false);
    expect(isStuckBatch({ state: "finished" }, "complete")).toBe(false);
  });

  it("computes the share of items that are done", () => {
    expect(completedPercent(counts)).toBe(75);
    expect(completedPercent({ ...counts, total: 0, pending: 0 })).toBe(0);
  });

  it("formats small and incomplete costs", () => {
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.0021)).toBe("$0.0021");
    expect(formatCost(1.234)).toBe("$1.23");
    expect(formatCost(1.234, false)).toBe("$1.23+");
  });

  it("sends no state for the all filter", () => {
    expect(stateFilterQuery("all")).toEqual({});
    expect(stateFilterQuery("active")).toEqual({ state: "active" });
  });
});
