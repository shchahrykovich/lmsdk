/**
 * Trace Parser Utility
 *
 * Parses W3C Trace Context traceparent headers into structured data.
 * Specification: https://www.w3.org/TR/trace-context/
 *
 * Format: version-traceId-parentSpanId-traceFlags
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */

export type TraceParent = {
  version: string;      // 2 hex chars
  traceId: string;      // 32 hex chars
  parentSpanId: string; // 16 hex chars
  traceFlags: string;   // 2 hex chars
  sampled: boolean;     // derived from traceFlags bit0
};

/**
 * Parse a W3C traceparent header into its components
 *
 * @param traceparent - The traceparent header value
 * @returns Parsed TraceParent object or null if invalid
 *
 * @example
 * const result = parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
 * // {
 * //   version: "00",
 * //   traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
 * //   parentSpanId: "00f067aa0ba902b7",
 * //   traceFlags: "01",
 * //   sampled: true
 * // }
 */
export function parseTraceParent(traceparent: string | undefined | null): TraceParent | null {
  if (!traceparent || typeof traceparent !== 'string') {
    return null;
  }

  // Trim whitespace
  const trimmed = traceparent.trim();

  // Split by hyphen
  const parts = trimmed.split('-');

  // Must have exactly 4 parts
  if (parts.length !== 4) {
    return null;
  }

  const [version, traceId, parentSpanId, traceFlags] = parts;

  // Validate version: 2 hex characters
  if (!isValidHex(version, 2)) {
    return null;
  }

  // Validate traceId: 32 hex characters and not all zeros
  if (!isValidHex(traceId, 32) || isAllZeros(traceId)) {
    return null;
  }

  // Validate parentSpanId: 16 hex characters and not all zeros
  if (!isValidHex(parentSpanId, 16) || isAllZeros(parentSpanId)) {
    return null;
  }

  // Validate traceFlags: 2 hex characters
  if (!isValidHex(traceFlags, 2)) {
    return null;
  }

  // Parse sampled flag from traceFlags bit 0
  const flagsValue = parseInt(traceFlags, 16);
  const sampled = (flagsValue & 0x01) === 0x01;

  return {
    version,
    traceId,
    parentSpanId,
    traceFlags,
    sampled,
  };
}

/**
 * Validate that a string contains only hex characters and has the expected length
 */
function isValidHex(value: string, expectedLength: number): boolean {
  if (value.length !== expectedLength) {
    return false;
  }
  return /^[0-9a-fA-F]+$/.test(value);
}

/**
 * Check if a hex string contains all zeros
 */
function isAllZeros(value: string): boolean {
  return /^0+$/.test(value);
}

/**
 * Format a TraceParent object back into a traceparent header string
 *
 * @param traceParent - The TraceParent object to format
 * @returns Formatted traceparent header string
 *
 * @example
 * const trace = {
 *   version: "00",
 *   traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
 *   parentSpanId: "00f067aa0ba902b7",
 *   traceFlags: "01",
 *   sampled: true
 * };
 * const header = formatTraceParent(trace);
 * // "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
 */
export function formatTraceParent(traceParent: TraceParent): string {
  return `${traceParent.version}-${traceParent.traceId}-${traceParent.parentSpanId}-${traceParent.traceFlags}`;
}
