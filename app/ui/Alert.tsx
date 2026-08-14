"use client";

import type { ComponentProps } from "react";
import { AlertMessage } from "@/components/ui/alert-message";

// White/black alert for the auth pages. AlertMessage styles inline, so no
// stylesheet can reach it; `rgb` and `style` are the override hooks it exposes,
// which keeps the shared component in components/ui unforked.
export function Alert({ style, ...props }: ComponentProps<typeof AlertMessage>) {
  return (
    <AlertMessage
      {...props}
      rgb="255, 255, 255"
      style={{
        backgroundColor: "#ffffff",
        color: "#000000",
        border: "0.7px solid rgba(0, 0, 0, 0.14)",
        ...style,
      }}
    />
  );
}
