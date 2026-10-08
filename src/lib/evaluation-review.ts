export interface ComparisonReview {
  recordId: number;
  leftVersionId: number;
  rightVersionId: number;
  description: string | null;
  score: number | null;
  updatedAt: string;
}

export interface ComparisonPairKey {
  recordId: number;
  leftVersionId: number;
  rightVersionId: number;
}

export interface ScoreOption {
  value: number;
  label: string;
  hint: string;
}

export const SCORE_OPTIONS: readonly ScoreOption[] = [
  { value: -2, label: "-2", hint: "Left much better" },
  { value: -1, label: "-1", hint: "Left better" },
  { value: 0, label: "0", hint: "Equal" },
  { value: 1, label: "+1", hint: "Right better" },
  { value: 2, label: "+2", hint: "Right much better" },
];

export const scoreHint = (score: number | null): string =>
  SCORE_OPTIONS.find((option) => option.value === score)?.hint ?? "Not scored";

const samePair = (a: ComparisonPairKey, b: ComparisonPairKey): boolean =>
  a.recordId === b.recordId && a.leftVersionId === b.leftVersionId && a.rightVersionId === b.rightVersionId;

export const findReview = (reviews: readonly ComparisonReview[], key: ComparisonPairKey): ComparisonReview | undefined =>
  reviews.find((review) => samePair(review, key));

export const withSavedReview = (reviews: readonly ComparisonReview[], saved: ComparisonReview): ComparisonReview[] => [
  ...reviews.filter((review) => !samePair(review, saved)),
  saved,
];

const errorFrom = async (response: Response, fallback: string): Promise<Error> => {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return new Error(data?.error ?? fallback);
};

export async function saveComparisonReview(
  projectId: number,
  evaluationId: number,
  key: ComparisonPairKey,
  review: { description: string | null; score: number | null }
): Promise<ComparisonReview> {
  const response = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/comparisons`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...key, ...review }),
  });
  if (!response.ok) {
    throw await errorFrom(response, "Failed to save the review");
  }
  return ((await response.json()) as { comparison: ComparisonReview }).comparison;
}

export async function saveEvaluationSummary(
  projectId: number,
  evaluationId: number,
  summary: string | null
): Promise<string | null> {
  const response = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
  });
  if (!response.ok) {
    throw await errorFrom(response, "Failed to save the summary");
  }
  return ((await response.json()) as { evaluation: { summary: string | null } }).evaluation.summary;
}

export const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT" || target.isContentEditable);
