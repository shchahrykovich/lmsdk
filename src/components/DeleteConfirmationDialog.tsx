/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Reusable delete confirmation dialog component
 *
 * @example
 * ```tsx
 * <DeleteConfirmationDialog
 *   open={!!itemToDelete}
 *   onOpenChange={(open) => { if (!open) setItemToDelete(null); }}
 *   onConfirm={handleDelete}
 *   title="Delete Item"
 *   description="This action cannot be undone."
 *   itemName={itemToDelete?.name}
 *   isDeleting={isDeleting}
 * />
 * ```
 */
interface DeleteConfirmationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void | Promise<void>;
  readonly title?: string;
  readonly description: string;
  readonly itemName?: string;
  readonly isDeleting?: boolean;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

export default function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Delete Item",
  description,
  itemName,
  isDeleting = false,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
}: DeleteConfirmationDialogProps): React.ReactNode {
  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    void onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {itemName ? (
              <>
                Are you sure you want to delete "{itemName}"? {description}
              </>
            ) : (
              description
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Deleting..." : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
