/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState } from "react";
import { Ban, CircleStop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { canCancelBatch, canFinishBatch, runBatchAction, type Batch, type BatchDetails } from "@/lib/batches";

type BatchAction = "cancel" | "finish";

const CONFIRM_TEXT: Record<BatchAction, { title: string; description: string; confirmText: string }> = {
  cancel: {
    title: "Cancel this batch?",
    description:
      "LM SDK asks the providers to cancel. Items that already finished keep their results. A running batch becomes cancelled after the background run sees the providers confirm, usually within minutes. If the background run has stopped, use Finish now instead.",
    confirmText: "Cancel batch",
  },
  finish: {
    title: "Finish this batch now?",
    description:
      "LM SDK stops the background run, cancels the provider batches that are still open, and marks every item without a result as cancelled. Results that already arrived are kept. Results a provider finished but LM SDK has not imported yet are lost. You cannot undo this.",
    confirmText: "Finish now",
  },
};

type BatchActionButtonsProps = Readonly<{
  projectId: number;
  batch: Batch;
  size?: "sm" | "default";
  onChanged: (details: BatchDetails) => void;
  onError: (message: string) => void;
}>;

export default function BatchActionButtons({
  projectId,
  batch,
  size = "sm",
  onChanged,
  onError,
}: BatchActionButtonsProps): React.ReactNode {
  const [pending, setPending] = useState<BatchAction | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!pending) return;
    try {
      setRunning(true);
      onChanged(await runBatchAction(projectId, batch.id, pending));
      setPending(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : `Failed to ${pending} batch`);
      setPending(null);
    } finally {
      setRunning(false);
    }
  };

  const ask = (action: BatchAction) => (event: React.MouseEvent) => {
    event.stopPropagation();
    setPending(action);
  };

  return (
    <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
      {canCancelBatch(batch) && (
        <Button variant="outline" size={size} className="gap-1.5" onClick={ask("cancel")}>
          <Ban size={14} />
          Cancel
        </Button>
      )}
      {canFinishBatch(batch) && (
        <Button variant="outline" size={size} className="gap-1.5 text-destructive hover:text-destructive" onClick={ask("finish")}>
          <CircleStop size={14} />
          Finish now
        </Button>
      )}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !running) setPending(null);
          }}
          {...CONFIRM_TEXT[pending]}
          cancelText="Back"
          onConfirm={() => void run()}
          loading={running}
          variant="destructive"
        />
      )}
    </div>
  );
}
