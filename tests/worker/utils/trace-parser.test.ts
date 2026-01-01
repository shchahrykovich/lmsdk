import { describe, it, expect } from "vitest";
import { parseTraceParent, formatTraceParent, type TraceParent } from "../../../worker/utils/trace-parser";

describe("Trace Parser", () => {
  describe("parseTraceParent", () => {
    it("should parse a valid traceparent header with sampled flag", () => {
      const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const result = parseTraceParent(traceparent);

      expect(result).toEqual({
        version: "00",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        parentSpanId: "00f067aa0ba902b7",
        traceFlags: "01",
        sampled: true,
      });
    });

    it("should parse a valid traceparent header without sampled flag", () => {
      const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00";
      const result = parseTraceParent(traceparent);

      expect(result).toEqual({
        version: "00",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        parentSpanId: "00f067aa0ba902b7",
        traceFlags: "00",
        sampled: false,
      });
    });

    it("should parse traceparent with uppercase hex characters", () => {
      const traceparent = "00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01";
      const result = parseTraceParent(traceparent);

      expect(result).toEqual({
        version: "00",
        traceId: "4BF92F3577B34DA6A3CE929D0E0E4736",
        parentSpanId: "00F067AA0BA902B7",
        traceFlags: "01",
        sampled: true,
      });
    });

    it("should parse traceparent with mixed case hex characters", () => {
      const traceparent = "00-4bF92f3577B34dA6a3Ce929d0e0E4736-00F067aA0bA902b7-01";
      const result = parseTraceParent(traceparent);

      expect(result).not.toBeNull();
      expect(result?.traceId).toBe("4bF92f3577B34dA6a3Ce929d0e0E4736");
    });

    it("should handle traceparent with leading/trailing whitespace", () => {
      const traceparent = "  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  ";
      const result = parseTraceParent(traceparent);

      expect(result).toEqual({
        version: "00",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        parentSpanId: "00f067aa0ba902b7",
        traceFlags: "01",
        sampled: true,
      });
    });

    it("should parse sampled flag from traceFlags bit 0", () => {
      // Test various traceFlags values to verify sampled bit extraction
      const testCases = [
        { traceFlags: "00", sampled: false },  // 0b00000000
        { traceFlags: "01", sampled: true },   // 0b00000001
        { traceFlags: "02", sampled: false },  // 0b00000010
        { traceFlags: "03", sampled: true },   // 0b00000011
        { traceFlags: "ff", sampled: true },   // 0b11111111
        { traceFlags: "fe", sampled: false },  // 0b11111110
      ];

      testCases.forEach(({ traceFlags, sampled }) => {
        const traceparent = `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-${traceFlags}`;
        const result = parseTraceParent(traceparent);
        expect(result?.sampled).toBe(sampled);
      });
    });

    describe("invalid inputs", () => {
      it("should return null for undefined input", () => {
        expect(parseTraceParent(undefined)).toBeNull();
      });

      it("should return null for null input", () => {
        expect(parseTraceParent(null)).toBeNull();
      });

      it("should return null for empty string", () => {
        expect(parseTraceParent("")).toBeNull();
      });

      it("should return null for whitespace-only string", () => {
        expect(parseTraceParent("   ")).toBeNull();
      });

      it("should return null for non-string input", () => {
        // @ts-expect-error Testing runtime behavior
        expect(parseTraceParent(123)).toBeNull();
        // @ts-expect-error Testing runtime behavior
        expect(parseTraceParent({})).toBeNull();
        // @ts-expect-error Testing runtime behavior
        expect(parseTraceParent([])).toBeNull();
      });

      it("should return null when missing parts (less than 4)", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736")).toBeNull();
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7")).toBeNull();
        expect(parseTraceParent("00")).toBeNull();
      });

      it("should return null when extra parts (more than 4)", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01-extra")).toBeNull();
      });

      it("should return null for invalid version length", () => {
        expect(parseTraceParent("0-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
        expect(parseTraceParent("000-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
      });

      it("should return null for invalid version characters", () => {
        expect(parseTraceParent("zz-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
        expect(parseTraceParent("0g-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBeNull();
      });

      it("should return null for invalid traceId length", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e473-00f067aa0ba902b7-01")).toBeNull();
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e47366-00f067aa0ba902b7-01")).toBeNull();
      });

      it("should return null for invalid traceId characters", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e473z-00f067aa0ba902b7-01")).toBeNull();
        expect(parseTraceParent("00-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz-00f067aa0ba902b7-01")).toBeNull();
      });

      it("should return null for all-zero traceId", () => {
        expect(parseTraceParent("00-00000000000000000000000000000000-00f067aa0ba902b7-01")).toBeNull();
      });

      it("should return null for invalid parentSpanId length", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b-01")).toBeNull();
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b777-01")).toBeNull();
      });

      it("should return null for invalid parentSpanId characters", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902bz-01")).toBeNull();
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-zzzzzzzzzzzzzzzz-01")).toBeNull();
      });

      it("should return null for all-zero parentSpanId", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01")).toBeNull();
      });

      it("should return null for invalid traceFlags length", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-0")).toBeNull();
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-001")).toBeNull();
      });

      it("should return null for invalid traceFlags characters", () => {
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-0z")).toBeNull();
        expect(parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-zz")).toBeNull();
      });
    });

    describe("edge cases", () => {
      it("should accept different version numbers", () => {
        const traceparent = "ff-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
        const result = parseTraceParent(traceparent);
        expect(result?.version).toBe("ff");
      });

      it("should accept maximum valid traceId", () => {
        const traceparent = "00-ffffffffffffffffffffffffffffffff-00f067aa0ba902b7-01";
        const result = parseTraceParent(traceparent);
        expect(result?.traceId).toBe("ffffffffffffffffffffffffffffffff");
      });

      it("should accept maximum valid parentSpanId", () => {
        const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-ffffffffffffffff-01";
        const result = parseTraceParent(traceparent);
        expect(result?.parentSpanId).toBe("ffffffffffffffff");
      });

      it("should accept traceId with only one non-zero character", () => {
        const traceparent = "00-00000000000000000000000000000001-00f067aa0ba902b7-01";
        const result = parseTraceParent(traceparent);
        expect(result?.traceId).toBe("00000000000000000000000000000001");
      });

      it("should accept parentSpanId with only one non-zero character", () => {
        const traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000001-01";
        const result = parseTraceParent(traceparent);
        expect(result?.parentSpanId).toBe("0000000000000001");
      });
    });
  });

  describe("formatTraceParent", () => {
    it("should format a TraceParent object into a valid traceparent header", () => {
      const traceParent: TraceParent = {
        version: "00",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        parentSpanId: "00f067aa0ba902b7",
        traceFlags: "01",
        sampled: true,
      };

      const result = formatTraceParent(traceParent);
      expect(result).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    });

    it("should format a TraceParent with uppercase hex", () => {
      const traceParent: TraceParent = {
        version: "00",
        traceId: "4BF92F3577B34DA6A3CE929D0E0E4736",
        parentSpanId: "00F067AA0BA902B7",
        traceFlags: "01",
        sampled: true,
      };

      const result = formatTraceParent(traceParent);
      expect(result).toBe("00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01");
    });

    it("should format a TraceParent with sampled=false", () => {
      const traceParent: TraceParent = {
        version: "00",
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        parentSpanId: "00f067aa0ba902b7",
        traceFlags: "00",
        sampled: false,
      };

      const result = formatTraceParent(traceParent);
      expect(result).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00");
    });

    it("should roundtrip parse and format", () => {
      const original = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
      const parsed = parseTraceParent(original);
      expect(parsed).not.toBeNull();

      const formatted = formatTraceParent(parsed!);
      expect(formatted).toBe(original);
    });

    it("should roundtrip with different traceFlags values", () => {
      const testCases = [
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-ff",
        "ff-ffffffffffffffffffffffffffffffff-ffffffffffffffff-fe",
      ];

      testCases.forEach((original) => {
        const parsed = parseTraceParent(original);
        expect(parsed).not.toBeNull();
        const formatted = formatTraceParent(parsed!);
        expect(formatted).toBe(original);
      });
    });
  });
});
