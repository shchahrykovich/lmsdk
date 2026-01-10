/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CreateDatasetDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  onSuccess?: (dataset: { id: number; name: string; slug: string }) => void;
  initialSchema?: Record<string, { type: string }>;
  defaultName?: string;
}>;

export default function CreateDatasetDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
  initialSchema,
  defaultName,
}: CreateDatasetDialogProps): React.ReactNode {
  const [datasetName, setDatasetName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setDatasetName(defaultName ?? "");
      setCreateError(null);
    } else {
      setDatasetName("");
      setCreateError(null);
    }
  }, [open, defaultName]);

  const handleCreateDataset = async () => {
    if (!datasetName.trim()) return;

    try {
      setIsCreating(true);
      setCreateError(null);

      const requestBody: { name: string; schema?: string } = {
        name: datasetName,
      };

      // If initial schema is provided, wrap it in fields object and include in the request
      if (initialSchema && Object.keys(initialSchema).length > 0) {
        requestBody.schema = JSON.stringify({ fields: initialSchema });
      }

      const response = await fetch(`/api/projects/${projectId}/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Failed to create dataset");
      }

      const data = await response.json();
      onOpenChange(false);

      if (onSuccess && data.dataset) {
        onSuccess(data.dataset);
      }
    } catch (error) {
      console.error("Error creating dataset:", error);
      setCreateError(error instanceof Error ? error.message : "Failed to create dataset");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Dataset</DialogTitle>
          <DialogDescription>
            {initialSchema && Object.keys(initialSchema).length > 0
              ? "Create a dataset with schema based on the prompt variables."
              : "Create an empty dataset for prompt evaluation. You can add records later."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dataset-name">Dataset Name</Label>
            <Input
              id="dataset-name"
              placeholder="Enter dataset name"
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleCreateDataset();
                }
              }}
            />
          </div>

          {initialSchema && Object.keys(initialSchema).length > 0 && (
            <div className="space-y-2">
              <Label>Initial Schema</Label>
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                <div className="space-y-1">
                  {Object.keys(initialSchema).map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="font-mono">{key}</span>
                      <span className="text-xs">({initialSchema[key].type})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {createError && (
            <div className="text-sm text-red-500">{createError}</div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => { void handleCreateDataset(); }}
            disabled={!datasetName.trim() || isCreating}
          >
            {isCreating ? "Creating..." : "Create Dataset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
