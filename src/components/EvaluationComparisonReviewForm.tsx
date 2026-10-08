import type { JSX } from "react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SCORE_OPTIONS, type ComparisonReview } from "@/lib/evaluation-review";

interface EvaluationComparisonReviewFormProps {
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly review: ComparisonReview | undefined;
  readonly onSave: (review: { description: string | null; score: number | null }) => Promise<void>;
}

type SaveStatus = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const statusText = (status: SaveStatus): string => {
  switch (status.kind) {
    case "idle":
      return "Saved when you pick a score or leave the text field";
    case "saving":
      return "Saving...";
    case "saved":
      return "Saved";
    case "error":
      return status.message;
  }
};

export default function EvaluationComparisonReviewForm({
  leftLabel,
  rightLabel,
  review,
  onSave,
}: EvaluationComparisonReviewFormProps): JSX.Element {
  const [description, setDescription] = useState(review?.description ?? "");
  const [score, setScore] = useState<number | null>(review?.score ?? null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const save = (next: { description: string; score: number | null }): Promise<void> => {
    setStatus({ kind: "saving" });
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        await onSave({ description: next.description.trim() ? next.description : null, score: next.score });
        setStatus({ kind: "saved" });
      } catch (error) {
        setStatus({ kind: "error", message: error instanceof Error ? error.message : "Failed to save the review" });
      }
    });
    return saveQueue.current;
  };

  const handleScore = (value: number) => {
    const next = score === value ? null : value;
    setScore(next);
    void save({ description, score: next });
  };

  const handleBlur = () => {
    if (description !== (review?.description ?? "")) {
      void save({ description, score });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="space-y-2">
        <Label>
          Manual score: {leftLabel} (left) vs {rightLabel} (right)
        </Label>
        <div className="flex flex-wrap gap-2">
          {SCORE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={score === option.value ? "default" : "outline"}
              onClick={() => handleScore(option.value)}
              title={option.hint}
            >
              {option.label} {option.hint}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="comparison-description">Manual description</Label>
        <textarea
          id="comparison-description"
          className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
          placeholder="What is better or worse in this pair for this record"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={handleBlur}
        />
      </div>
      <p className={`text-xs ${status.kind === "error" ? "text-red-500" : "text-muted-foreground"}`}>
        {statusText(status)}
      </p>
    </div>
  );
}
