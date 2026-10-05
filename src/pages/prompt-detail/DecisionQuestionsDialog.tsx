/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DECISION_QUESTIONS_EXAMPLE, parseDecisionQuestions } from "@/lib/decision-questions";

type DecisionQuestionsDialogProps = Readonly<{
  open: boolean;
  setOpen: (value: boolean) => void;
  decisionQuestions: string;
  setDecisionQuestions: (value: string) => void;
}>;

export function DecisionQuestionsDialog({
  open,
  setOpen,
  decisionQuestions,
  setDecisionQuestions,
}: DecisionQuestionsDialogProps): React.ReactNode {
  const [editValue, setEditValue] = useState(decisionQuestions);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEditValue(decisionQuestions);
      setError(null);
    }
  }, [open, decisionQuestions]);

  const save = () => {
    const result = parseDecisionQuestions(editValue);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDecisionQuestions(JSON.stringify(result.questions, null, 2));
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit decision questions</DialogTitle>
          <DialogDescription>
            A JSON object of questions by name. Types: &quot;noul&quot; (yes/no probability), &quot;choice&quot; (one
            option key) and &quot;score&quot; (a position on an ordered list, lowest first).
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto space-y-2">
          <textarea
            className="w-full min-h-[400px] px-3 py-2 text-sm rounded-md border border-input bg-background font-mono resize-y"
            placeholder={DECISION_QUESTIONS_EXAMPLE}
            value={editValue}
            onChange={(event) => setEditValue(event.target.value)}
          />
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          {!editValue.trim() && (
            <Button variant="outline" onClick={() => setEditValue(DECISION_QUESTIONS_EXAMPLE)}>
              Insert example
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save questions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
