import type * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CHANGELOG } from "@/lib/changelog";

type ChangelogDialogProps = Readonly<{
  currentVersion: string;
  compact: boolean;
}>;

export function ChangelogDialog({ currentVersion, compact }: ChangelogDialogProps): React.JSX.Element {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          title="See what changed in each version"
          className={`w-full text-center hover:text-foreground hover:underline transition-colors ${
            compact ? "text-[10px]" : ""
          }`}
        >
          v{currentVersion}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>What&apos;s new</DialogTitle>
          <DialogDescription>Changes in each version of LM SDK.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-5 pr-1">
          {CHANGELOG.map((entry) => (
            <section key={entry.version}>
              <div className="flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-foreground">v{entry.version}</h3>
                {entry.version === currentVersion && (
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    current
                  </span>
                )}
                <span className="text-xs text-muted-foreground">{entry.date}</span>
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
