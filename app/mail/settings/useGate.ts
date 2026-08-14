"use client";

// Local copy of the gate inputs, for cards that manage their own flow instead
// of sharing the page-level Mode.
import { useState } from "react";
import type { GateState } from "./types";

export function useGate(hasTotp: boolean, onClose: () => void) {
  const [words, setWords] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = () => {
    setWords("");
    setTotpCode("");
    setError(null);
  };

  const gate: GateState = {
    words,
    setWords,
    totpCode,
    setTotpCode,
    hasTotp,
    busy,
    error,
    onCancel: () => {
      clear();
      onClose();
    },
  };

  return { gate, words, totpCode, busy, setBusy, setError, clear };
}
