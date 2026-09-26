import type * as React from "react";
import { PROD_ICON_PATH } from "@/lib/app-icon";

export function AppLogo(): React.JSX.Element {
  return (
    <span className="relative block">
      <img alt="LM SDK" src={PROD_ICON_PATH} />
      {import.meta.env.DEV && (
        <span className="absolute inset-x-0 bottom-0 bg-red-600 text-center text-[8px] font-bold leading-[10px] text-white">
          DEV
        </span>
      )}
    </span>
  );
}
