/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type JsonSchemaDialogProps = Readonly<{
  isSchemaDialogOpen: boolean;
  setIsSchemaDialogOpen: (value: boolean) => void;
  schemaEditValue: string;
  setSchemaEditValue: (value: string) => void;
  jsonSchema: string;
  setJsonSchema: (value: string) => void;
}>;

export function JsonSchemaDialog({
  isSchemaDialogOpen,
  setIsSchemaDialogOpen,
  schemaEditValue,
  setSchemaEditValue,
  jsonSchema,
  setJsonSchema,
}: JsonSchemaDialogProps): React.ReactNode {
  return (
    <Dialog open={isSchemaDialogOpen} onOpenChange={setIsSchemaDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit JSON Schema</DialogTitle>
          <DialogDescription>
            Define the structure for JSON responses. Enter a valid JSON schema
            object.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <textarea
            className="w-full min-h-[400px] px-3 py-2 text-sm rounded-md border border-input bg-background font-mono resize-y"
            placeholder={`{\n  "name": "response_schema",\n  "strict": true,\n  "schema": {\n    "type": "object",\n    "properties": {\n      "answer": {\n        "type": "string"\n      }\n    },\n    "required": ["answer"],\n    "additionalProperties": false\n  }\n}`}
            value={schemaEditValue}
            onChange={(event) => setSchemaEditValue(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsSchemaDialogOpen(false);
              setSchemaEditValue(jsonSchema);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              // Validate JSON
              try {
                JSON.parse(schemaEditValue);
                setJsonSchema(schemaEditValue);
                setIsSchemaDialogOpen(false);
              } catch {
                alert("Invalid JSON format. Please check your schema.");
              }
            }}
          >
            Save Schema
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
