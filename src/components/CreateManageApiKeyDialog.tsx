/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Access = "read" | "write";

interface CreatedKey {
  key: string;
  name: string;
  permissions: Record<string, string[]>;
  expiresAt: string | null;
}

type CreateManageApiKeyDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}>;

const DEFAULT_EXPIRY_DAYS = 90;

export default function CreateManageApiKeyDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateManageApiKeyDialogProps): React.ReactNode {
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("read");
  const [expiresInDays, setExpiresInDays] = useState(String(DEFAULT_EXPIRY_DAYS));
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setAccess("read");
      setExpiresInDays(String(DEFAULT_EXPIRY_DAYS));
      setError(null);
      setCreated(null);
      setCopied(false);
    }
  }, [open]);

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      setError(null);

      const response = await fetch("/api/users/management-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), access, expiresInDays: Number(expiresInDays) }),
      });
      const data = (await response.json()) as CreatedKey | { error?: string };

      if (!response.ok || !("key" in data)) {
        throw new Error(("error" in data ? data.error : undefined) ?? "Failed to create the key");
      }

      setCreated(data);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create the key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.key);
    setCopied(true);
  };

  const expiryIsValid = /^\d+$/.test(expiresInDays) && Number(expiresInDays) >= 1 && Number(expiresInDays) <= 365;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Copy Your Manage API Key" : "Create Manage API Key"}</DialogTitle>
          <DialogDescription>
            {created
              ? "This is the only time the full key is shown. Store it now."
              : "A manage API key lets an AI agent use the management API (/api/v1/manage) with your access to this tenant."}
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="manage-key-value">Key</Label>
              <div className="flex gap-2">
                <Input id="manage-key-value" readOnly value={created.key} className="font-mono" />
                <Button variant="outline" onClick={() => { void handleCopy(); }}>
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Access: {created.permissions.manage?.join(", ")}.{" "}
              {created.expiresAt ? `Expires on ${new Date(created.expiresAt).toLocaleDateString()}.` : "Never expires."}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="manage-key-name">Name</Label>
              <Input
                id="manage-key-name"
                placeholder="for example claude-code"
                maxLength={32}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manage-key-access">Access</Label>
              <Select value={access} onValueChange={(value) => setAccess(value as Access)}>
                <SelectTrigger id="manage-key-access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read only</SelectItem>
                  <SelectItem value="write">Read and write (can change the active prompt version)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manage-key-expiry">Expires in (days, 1 to 365)</Label>
              <Input
                id="manage-key-expiry"
                inputMode="numeric"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
            </div>
            {error && <div className="text-sm text-red-500">{error}</div>}
          </div>
        )}

        <DialogFooter>
          {created ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => { void handleCreate(); }}
                disabled={!name.trim() || !expiryIsValid || isCreating}
              >
                {isCreating ? "Creating..." : "Create key"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
