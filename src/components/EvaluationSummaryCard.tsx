import type { JSX } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface EvaluationSummaryCardProps {
  readonly summary: string | null;
  readonly onSave: (summary: string | null) => Promise<void>;
}

export default function EvaluationSummaryCard({ summary, onSave }: EvaluationSummaryCardProps): JSX.Element {
  const [draft, setDraft] = useState(summary ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = draft !== (summary ?? "");

  useEffect(() => {
    if (!isDirty) {
      setDraft(summary ?? "");
    }
  }, [summary]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft.trim() ? draft : null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save the summary");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <Label htmlFor="evaluation-summary">Result summary</Label>
      <textarea
        id="evaluation-summary"
        className="w-full min-h-[80px] px-3 py-2 text-sm rounded-md border border-input bg-background"
        placeholder="Describe the result of this evaluation: what changed, which version is better, what to try next"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => { void handleSave(); }} disabled={!isDirty || saving}>
          {saving ? "Saving..." : "Save summary"}
        </Button>
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
