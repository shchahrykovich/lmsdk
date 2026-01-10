import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import type { JSX } from "react";

interface DataSet {
  id: number;
  name: string;
}

interface AddLogsToDatasetDialogProps {
  readonly projectId: number;
  readonly logIds: number[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess?: () => void;
}

export function AddLogsToDatasetDialog({
  projectId,
  logIds,
  open,
  onOpenChange,
  onSuccess,
}: AddLogsToDatasetDialogProps): JSX.Element {
  const [datasets, setDatasets] = useState<DataSet[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addProgress, setAddProgress] = useState({ current: 0, total: 0 });

  // Fetch datasets when dialog opens
  useEffect(() => {
    if (open) {
      void fetchDatasets();
    }
  }, [open, projectId]);

  // Auto-select first dataset
  useEffect(() => {
    if (!selectedDatasetId && datasets.length > 0) {
      setSelectedDatasetId(String(datasets[0].id));
    }
  }, [datasets, selectedDatasetId]);

  const fetchDatasets = async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/datasets`);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.statusText}`);
      }

      const data = await response.json();
      setDatasets(data.datasets ?? []);
    } catch (err) {
      console.error("Error fetching datasets:", err);
    }
  };

  const sendLogsToDataset = async (batchLogIds: number[]): Promise<void> => {
    const response = await fetch(
      `/api/projects/${projectId}/datasets/${selectedDatasetId}/logs`,
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
    if (!selectedDatasetId) return;

    const BATCH_SIZE = 10;

    try {
      setIsAdding(true);
      setAddError(null);
      setAddProgress({ current: 0, total: logIds.length });

      // If 10 or fewer logs, send in a single request
      if (logIds.length <= BATCH_SIZE) {
        await sendLogsToDataset(logIds);
        setAddProgress({ current: logIds.length, total: logIds.length });
      } else {
        // Split into batches of 10 for larger selections
        const batches = [];
        for (let i = 0; i < logIds.length; i += BATCH_SIZE) {
          batches.push(logIds.slice(i, i + BATCH_SIZE));
        }

        let processedCount = 0;
        for (const batch of batches) {
          await sendLogsToDataset(batch);
          processedCount += batch.length;
          setAddProgress({ current: processedCount, total: logIds.length });
        }
      }

      // Success - close dialog and reset state
      onOpenChange(false);
      setSelectedDatasetId("");
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
              disabled={datasets.length === 0 || isAdding}
            >
              <SelectTrigger id="dataset-select">
                <SelectValue
                  placeholder={
                    datasets.length === 0 ? "No datasets available" : "Select dataset"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={String(dataset.id)}>
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            disabled={!selectedDatasetId || isAdding}
          >
            {isAdding ? "Adding..." : "Add logs"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
