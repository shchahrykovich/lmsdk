import { describe, it, expect } from "vitest";
import { findReview, scoreHint, withSavedReview, type ComparisonReview } from "../../../src/lib/evaluation-review";

const review = (recordId: number, leftVersionId: number, rightVersionId: number, score: number | null): ComparisonReview => ({
  recordId,
  leftVersionId,
  rightVersionId,
  description: null,
  score,
  updatedAt: "2026-10-08T10:00:00.000Z",
});

describe("evaluation-review", () => {
  it("finds the review of one record and one pair, not of another pair", () => {
    const reviews = [review(5, 100, 101, 1), review(5, 101, 102, -1), review(6, 100, 101, 0)];

    expect(findReview(reviews, { recordId: 5, leftVersionId: 101, rightVersionId: 102 })?.score).toBe(-1);
    expect(findReview(reviews, { recordId: 5, leftVersionId: 100, rightVersionId: 102 })).toBeUndefined();
  });

  it("replaces a saved review of the same pair and keeps the others", () => {
    const reviews = [review(5, 100, 101, 1), review(6, 100, 101, 0)];

    const next = withSavedReview(reviews, review(5, 100, 101, 2));

    expect(next).toHaveLength(2);
    expect(findReview(next, { recordId: 5, leftVersionId: 100, rightVersionId: 101 })?.score).toBe(2);
  });

  it("describes each score in words", () => {
    expect(scoreHint(-2)).toBe("Left much better");
    expect(scoreHint(0)).toBe("Equal");
    expect(scoreHint(2)).toBe("Right much better");
    expect(scoreHint(null)).toBe("Not scored");
  });
});
