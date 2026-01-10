import { useState } from "react";

export const calculateTooltipPosition = (
  barRect: DOMRect,
  estimatedHeight: number = 200
): 'below' | 'above' => {
  const viewportHeight = window.innerHeight;
  const wouldOverflowBottom = barRect.bottom + estimatedHeight + 8 > viewportHeight - 20;
  return wouldOverflowBottom ? 'above' : 'below';
};

interface TooltipPositionHook {
  tooltipPosition: 'below' | 'above';
  handleMouseEnterWithTooltip: (
    event: React.MouseEvent<HTMLDivElement>,
    onEnter: () => void,
    estimatedHeight?: number
  ) => void;
}

export const useTooltipPosition = (): TooltipPositionHook => {
  const [tooltipPosition, setTooltipPosition] = useState<'below' | 'above'>('below');

  const handleMouseEnterWithTooltip = (
    event: React.MouseEvent<HTMLDivElement>,
    onEnter: () => void,
    estimatedHeight: number = 200
  ): void => {
    onEnter();
    const barRect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition(calculateTooltipPosition(barRect, estimatedHeight));
  };

  return { tooltipPosition, handleMouseEnterWithTooltip };
};


export const normalizeTimestamp = (value: string | number): number => {
	if (typeof value === "number") {
		return value < 1_000_000_000_000 ? value * 1000 : value;
	}
	return new Date(value).getTime();
};

export const formatDuration = (ms: number): string => {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	return `${(ms / 1000).toFixed(2)}s`;
};

export const formatTime = (timestamp: number): string => {
	return new Date(timestamp).toLocaleTimeString(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		fractionalSecondDigits: 3,
	});
};
