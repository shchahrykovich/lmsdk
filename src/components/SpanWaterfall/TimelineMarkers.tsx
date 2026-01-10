/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";

export default function TimelineMarkers(): React.ReactNode {
  return (
    <>
      <div className="absolute left-0 h-full border-l border-border/50" />
      <div className="absolute h-full border-l border-border/30" style={{ left: "25%" }} />
      <div className="absolute h-full border-l border-border/30" style={{ left: "50%" }} />
      <div className="absolute h-full border-l border-border/30" style={{ left: "75%" }} />
      <div className="absolute right-0 h-full border-r border-border/50" />
    </>
  );
}
