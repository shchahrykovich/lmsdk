/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseDecisionQuestions } from "@/lib/decision-questions";

type DecisionQuestionsSectionProps = Readonly<{
  decisionQuestions: string;
  onEdit: () => void;
}>;

const summarize = (decisionQuestions: string): string => {
  if (!decisionQuestions.trim()) return "No questions yet";
  const result = parseDecisionQuestions(decisionQuestions);
  if ("error" in result) return result.error;
  return Object.entries(result.questions)
    .map(([name, question]) => `${name} (${(question as { type: string }).type})`)
    .join(", ");
};

export function DecisionQuestionsSection({ decisionQuestions, onEdit }: DecisionQuestionsSectionProps): React.ReactNode {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">Decision questions</Label>
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm text-foreground truncate">{summarize(decisionQuestions)}</p>
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit questions
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">
        The user message is sent as the state. If it is a JSON object or array, it is sent as structured state.
      </p>
    </div>
  );
}
