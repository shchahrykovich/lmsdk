import type { JSX } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ReusableEvaluation {
  id: number;
  name: string;
  state: string;
  datasetId: number | null;
  prompts: { promptId: number; versionId: number; promptName: string; version: number }[];
}

export const NO_REUSE = "none";

interface EvaluationReuseSelectProps {
  readonly evaluations: ReusableEvaluation[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled: boolean;
}

const describeVersions = (evaluation: ReusableEvaluation): string =>
  evaluation.prompts.map((prompt) => `${prompt.promptName} v${prompt.version}`).join(", ");

export default function EvaluationReuseSelect({
  evaluations,
  value,
  onChange,
  disabled,
}: EvaluationReuseSelectProps): JSX.Element {
  return (
    <div className="space-y-2">
      <Label htmlFor="reuse-select">Reuse results from</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="reuse-select">
          <SelectValue placeholder="Run every prompt version" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REUSE}>None: run every prompt version</SelectItem>
          {evaluations.map((evaluation) => (
            <SelectItem key={evaluation.id} value={String(evaluation.id)}>
              {evaluation.name} ({describeVersions(evaluation)}, {evaluation.state})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Prompt versions that the chosen evaluation already ran are copied, not run again. Only the
        other versions call the model.
      </p>
    </div>
  );
}
