export function formatDate(
  date: Date | string | number | undefined,
  opts: Intl.DateTimeFormatOptions = {},
): string {
  if (!date) return "";

  try {
    return new Intl.DateTimeFormat("en-US", {
      month: opts.month ?? "long",
      day: opts.day ?? "numeric",
      year: opts.year ?? "numeric",
      ...opts,
    }).format(new Date(date));
  } catch {
    return "";
  }
}

interface DurationUnit {
  ms: number;
  label: string;
}

const SECOND: DurationUnit = { ms: 1000, label: "s" };
const MINUTE: DurationUnit = { ms: 60 * SECOND.ms, label: "m" };
const HOUR: DurationUnit = { ms: 60 * MINUTE.ms, label: "h" };
const DAY: DurationUnit = { ms: 24 * HOUR.ms, label: "d" };

function roundsBelow(ms: number, precision: DurationUnit, limit: DurationUnit): boolean {
  return Math.round(ms / precision.ms) * precision.ms < limit.ms;
}

function formatPair(ms: number, big: DurationUnit, small: DurationUnit): string {
  const smallCount = Math.round(ms / small.ms);
  const smallPerBig = big.ms / small.ms;
  const bigValue = Math.floor(smallCount / smallPerBig);
  const smallValue = smallCount % smallPerBig;
  const bigText = `${bigValue}${big.label}`;
  return smallValue === 0 ? bigText : `${bigText} ${smallValue}${small.label}`;
}

export function formatDuration(ms: number): string {
  if (Math.round(ms) < SECOND.ms) return `${Math.round(ms)}ms`;
  const tenthsOfSecond = Math.round(ms / 100);
  if (tenthsOfSecond < 600) return `${Number((tenthsOfSecond / 10).toFixed(1))}s`;
  if (roundsBelow(ms, SECOND, HOUR)) return formatPair(ms, MINUTE, SECOND);
  if (roundsBelow(ms, MINUTE, DAY)) return formatPair(ms, HOUR, MINUTE);
  return formatPair(ms, DAY, HOUR);
}
