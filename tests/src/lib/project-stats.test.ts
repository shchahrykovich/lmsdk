import { describe, expect, it } from "vitest";
import {
  barHeightPercent,
  costDetail,
  formatCompact,
  formatCount,
  formatCost,
  formatDayLabel,
  formatRate,
  successRate,
} from "../../../src/lib/project-stats";

describe("project stats formatting", () => {
  it("formats counts with thousands separators", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1234567)).toBe("1,234,567");
  });

  it("formats large token counts in compact form", () => {
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(12_345)).toBe("12.3K");
    expect(formatCompact(4_200_000)).toBe("4.2M");
  });

  it("formats cost in US dollars with more digits for small amounts", () => {
    expect(formatCost(0)).toBe("$0.00");
    expect(formatCost(1234.5)).toBe("$1,234.50");
    expect(formatCost(0.0042)).toBe("$0.0042");
    expect(formatCost(0.00001)).toBe("<$0.0001");
  });

  it("says how many runs have no price", () => {
    expect(costDetail({ unpricedCount: 0 })).toBe("Total spend");
    expect(costDetail({ unpricedCount: 1200 })).toBe("1,200 runs without a price");
  });

  it("returns no success rate when there are no executions", () => {
    expect(successRate({ total: 0, succeeded: 0 })).toBeNull();
    expect(formatRate(null)).toBe("—");
  });

  it("formats the success rate as a percent", () => {
    expect(formatRate(successRate({ total: 4, succeeded: 4 }))).toBe("100%");
    expect(formatRate(successRate({ total: 3, succeeded: 2 }))).toBe("66.7%");
    expect(formatRate(successRate({ total: 2, succeeded: 0 }))).toBe("0%");
  });

  it("formats a day label in UTC", () => {
    expect(formatDayLabel("2026-09-01")).toBe("Sep 1");
  });

  it("scales bar height to the largest day and keeps small non-zero bars visible", () => {
    expect(barHeightPercent(0, 10)).toBe(0);
    expect(barHeightPercent(5, 0)).toBe(0);
    expect(barHeightPercent(10, 10)).toBe(100);
    expect(barHeightPercent(5, 10)).toBe(50);
    expect(barHeightPercent(1, 1000)).toBe(4);
  });
});
