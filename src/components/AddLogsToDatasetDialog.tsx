import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Plus } from "lucide-react";
import type { JSX } from "react";
import {
  NEW_DATASET_VALUE,
  initialDatasetSelection,
  isDatasetChoiceComplete,
  isNewDatasetChoice,
  resolveDatasetChoice,
  type DatasetOption,
} from "@/lib/dataset-choice";

interface AddLogsToDatasetDialogProps {
  readonly projectId: number;
  readonly logIds: number[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

function addButtonLabel(isAdding: boolean, isNewDataset: boolean): string {
  if (isAdding) return "Adding...";
  return isNewDataset ? "Create and add logs" : "Add logs";
}

export function AddLogsToDatasetDialog({
  projectId,
  logIds,
  open,
  onOpenChange,
  onSuccess,
}: AddLogsToDatasetDialogProps): JSX.Element {
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [newDatasetName, setNewDatasetName] = useState("");
  const newDatasetNameRef = useRef<HTMLInputElement>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addProgress, setAddProgress] = useState({ current: 0, total: 0 });

  const choice = { selectedValue: selectedDatasetId, newName: newDatasetName };
  const isNewDataset = isNewDatasetChoice(choice);

  // Fetch datasets when dialog opens
  useEffect(() => {
    if (open) {
      void fetchDatasets();
    }
  }, [open, projectId]);

  const fetchDatasets = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/datasets`);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.statusText}`);
      }

      const data = await response.json();
      const loaded: DatasetOption[] = data.datasets ?? [];
      setDatasets(loaded);
      setSelectedDatasetId((current) => current || initialDatasetSelection(loaded));
    } catch (err) {
      console.error("Error fetching datasets:", err);
    }
  };

  const sendLogsToDataset = async (datasetId: string, batchLogIds: number[]): Promise<void> => {
    const response = await fetch(
      `/api/projects/${projectId}/datasets/${datasetId}/logs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logIds: batchLogIds }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error ?? "Failed to add logs to dataset");
    }
  };

  const handleAddToDataset = async () => {
    if (!isDatasetChoiceComplete(choice)) return;

    const BATCH_SIZE = 10;

    try {
      setIsAdding(true);
      setAddError(null);

      const { datasetId, created } = await resolveDatasetChoice(projectId, choice);
      if (created) {
        setDatasets((current) => [...current, created]);
        setSelectedDatasetId(datasetId);
        setNewDatasetName("");
      }

      setAddProgress({ current: 0, total: logIds.length });

      // If 10 or fewer logs, send in a single request
      if (logIds.length <= BATCH_SIZE) {
        await sendLogsToDataset(datasetId, logIds);
        setAddProgress({ current: logIds.length, total: logIds.length });
      } else {
        // Split into batches of 10 for larger selections
        const batches = [];
        for (let i = 0; i < logIds.length; i += BATCH_SIZE) {
          batches.push(logIds.slice(i, i + BATCH_SIZE));
        }

        let processedCount = 0;
        for (const batch of batches) {
          await sendLogsToDataset(datasetId, batch);
          processedCount += batch.length;
          setAddProgress({ current: processedCount, total: logIds.length });
        }
      }

      // Success - close dialog and reset state
      onOpenChange(false);
      setSelectedDatasetId("");
      setNewDatasetName("");
      setAddProgress({ current: 0, total: 0 });
      onSuccess?.();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add logs to dataset");
    } finally {
      setIsAdding(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setAddError(null);
    setAddProgress({ current: 0, total: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add logs to dataset</DialogTitle>
          <DialogDescription>
            Add {logIds.length} log{logIds.length === 1 ? "" : "s"} to a dataset.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dataset-select">Dataset</Label>
            <Select
              value={selectedDatasetId}
              onValueChange={setSelectedDatasetId}
              disabled={isAdding}
            >
              <SelectTrigger id="dataset-select">
                <SelectValue placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent
                onCloseAutoFocus={(event) => {
                  if (isNewDataset) {
                    event.preventDefault();
                    newDatasetNameRef.current?.focus();
                  }
                }}
              >
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={String(dataset.id)}>
                    {dataset.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_DATASET_VALUE}>
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    New dataset
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isNewDataset && (
            <div className="space-y-2">
              <Label htmlFor="new-dataset-name">New dataset name</Label>
              <Input
                id="new-dataset-name"
                ref={newDatasetNameRef}
                placeholder="Enter dataset name"
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleAddToDataset();
                  }
                }}
                disabled={isAdding}
              />
            </div>
          )}

          {isAdding && addProgress.total > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Copying logs...</span>
                <span>{addProgress.current} / {addProgress.total}</span>
              </div>
              <Progress
                value={(addProgress.current / addProgress.total) * 100}
                className="w-full"
              />
            </div>
          )}

          {addError && <div className="text-sm text-red-500">{addError}</div>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isAdding}
          >
            Cancel
          </Button>
          <Button
            onClick={() => { void handleAddToDataset(); }}
            disabled={!isDatasetChoiceComplete(choice) || isAdding}
          >
            {addButtonLabel(isAdding, isNewDataset)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
