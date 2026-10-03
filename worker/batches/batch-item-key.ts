export interface ItemLine {
  partKey: string;
  lineIndex: number;
}

export const itemKey = ({ partKey, lineIndex }: ItemLine): string => `${partKey}-${lineIndex}`;

export function parseItemKey(key: string): ItemLine | null {
  const separator = key.lastIndexOf("-");
  if (separator <= 0) return null;
  const lineIndex = Number(key.slice(separator + 1));
  if (!Number.isInteger(lineIndex) || lineIndex < 0) return null;
  return { partKey: key.slice(0, separator), lineIndex };
}

export const newPartKey = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 24);
