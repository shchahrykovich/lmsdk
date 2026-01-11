import { createTwoFilesPatch } from "diff";
import { html } from "diff2html";

const sortObjectKeys = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sortObjectKeys(item));
  }

  if (typeof obj === "object") {
    return Object.keys(obj)
      .sort((a, b) => a.localeCompare(b))
      .reduce(
        (sorted, key) => {
          sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
          return sorted;
        },
        {} as Record<string, unknown>
      );
  }

  return obj;
};

export function normalizeOutput(output: unknown): string {
  if (typeof output === "string") {
    try {
      const parsed = JSON.parse(output);
      const sorted = sortObjectKeys(parsed);
      return JSON.stringify(sorted, null, 2);
    } catch {
      return output;
    }
  }

  const sorted = sortObjectKeys(output);
  return JSON.stringify(sorted, null, 2);
}

export function generateDiffHtml(
  leftContent: string,
  rightContent: string,
  leftLabel: string,
  rightLabel: string
): string {
  const patch = createTwoFilesPatch(
    leftLabel,
    rightLabel,
    leftContent,
    rightContent,
    "",
    ""
  );

  return html(patch, {
    drawFileList: false,
    matching: "lines",
    outputFormat: "side-by-side",
  });
}
