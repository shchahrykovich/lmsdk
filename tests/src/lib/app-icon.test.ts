import { describe, expect, it } from "vitest";
import { type DevBadgeContext, drawDevBadge, PROD_ICON_PATH } from "../../../src/lib/app-icon";

const recordingContext = () => {
  const calls: unknown[][] = [];
  const context: DevBadgeContext = {
    fillStyle: "",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillRect: (...args) => {
      calls.push(["fillRect", context.fillStyle, ...args]);
    },
    fillText: (...args) => {
      calls.push(["fillText", context.fillStyle, context.font, context.textAlign, context.textBaseline, ...args]);
    },
  };
  return { context, calls };
};

describe("PROD_ICON_PATH", () => {
  it("points at the production icon", () => {
    expect(PROD_ICON_PATH).toBe("/icon.png");
  });
});

describe("drawDevBadge", () => {
  it("draws a red strip across the bottom of the icon", () => {
    const { context, calls } = recordingContext();

    drawDevBadge(context, 64);

    expect(calls[0]).toEqual(["fillRect", "#dc2626", 0, 41, 64, 23]);
  });

  it("writes DEV in white, centred in the strip", () => {
    const { context, calls } = recordingContext();

    drawDevBadge(context, 64);

    expect(calls[1]).toEqual([
      "fillText",
      "#ffffff",
      "bold 18px Arial, Helvetica, sans-serif",
      "center",
      "middle",
      "DEV",
      32,
      52.5,
    ]);
  });

  it("draws only the strip and the text, so the icon above stays unchanged", () => {
    const { context, calls } = recordingContext();

    drawDevBadge(context, 64);

    expect(calls).toHaveLength(2);
  });
});
