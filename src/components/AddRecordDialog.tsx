"use client";

/* eslint-disable sonarjs/function-return-type */

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle } from "lucide-react";

type SchemaFields = Record<string, { type: string }>;

type AddRecordDialogProps = Readonly<{
  projectId: number;
  datasetId: number;
  schema: SchemaFields;
  onRecordAdded: () => void;
}>;

const getInputType = (fieldType: string): string => {
  switch (fieldType) {
    case "number":
      return "number";
    case "boolean":
      return "text";
    default:
      return "text";
  }
};

const getPlaceholder = (fieldType: string): string => {
  if (fieldType === "boolean") {
    return "true or false";
  }
  if (fieldType === "array" || fieldType === "object") {
    return "JSON or comma-separated";
  }
  return `Enter ${fieldType}...`;
};

const parseValue = (value: string, fieldType: string): unknown => {
  if (!value.trim()) return null;

  switch (fieldType) {
    case "number": {
      const num = Number(value);
      return isNaN(num) ? null : num;
    }
    case "boolean":
      return value.toLowerCase() === "true" || value === "1";
    case "null":
      return null;
    case "array":
      try {
        return JSON.parse(value);
      } catch {
        return value.split(",").map((v) => v.trim());
      }
    case "object":
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
};

const buildVariablesFromFormData = (
  formData: Record<string, string>,
  schema: SchemaFields
): Record<string, unknown> => {
  const variables: Record<string, unknown> = {};

  for (const [fieldPath, fieldValue] of Object.entries(formData)) {
    if (!fieldValue.trim()) continue;

    const fieldType = schema[fieldPath]?.type ?? "string";
    const parsedValue = parseValue(fieldValue, fieldType);

    const parts = fieldPath.split(".");
    let current = variables;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = parsedValue;
  }

  return variables;
};

export function AddRecordDialog({
  projectId,
  datasetId,
  schema,
  onRecordAdded,
}: AddRecordDialogProps): React.ReactNode {
  const [open, setOpen] = React.useState(false);
  const [formData, setFormData] = React.useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const schemaFields = React.useMemo(() => {
    return Object.keys(schema).sort((a, b) => a.localeCompare(b));
  }, [schema]);

  const handleInputChange = (fieldPath: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [fieldPath]: value,
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      const variables = buildVariablesFromFormData(formData, schema);

      const response = await fetch(
        `/api/projects/${projectId}/datasets/${datasetId}/records`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ variables }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Failed to create record");
      }

      setFormData({});
      setOpen(false);
      onRecordAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create record");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setFormData({});
    setError(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusCircle className="h-4 w-4 mr-2" />
          Add Record
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Record</DialogTitle>
          <DialogDescription>
            Fill in the fields below to create a new record. Leave fields empty for null values.
          </DialogDescription>
        </DialogHeader>
        {schemaFields.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground">
            No schema fields available. Add logs to define the schema first.
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            {schemaFields.map((fieldPath) => {
              const fieldType = schema[fieldPath]?.type ?? "string";
              return (
                <div key={fieldPath} className="grid gap-2">
                  <Label htmlFor={fieldPath}>
                    <span className="font-mono text-xs">{fieldPath}</span>
                    <span className="text-muted-foreground text-xs ml-2">({fieldType})</span>
                  </Label>
                  <Input
                    id={fieldPath}
                    type={getInputType(fieldType)}
                    placeholder={getPlaceholder(fieldType)}
                    value={formData[fieldPath] ?? ""}
                    onChange={(e) => handleInputChange(fieldPath, e.target.value)}
                  />
                </div>
              );
            })}
            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || schemaFields.length === 0}
          >
            {isSubmitting ? "Creating..." : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
