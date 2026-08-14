"use client";

// Numbered 12-word recovery-code entry. Space or enter hops to the next row,
// backspace on an empty row goes back, and pasting the whole code into any row
// spreads it across the rest. The value is the space-joined words, so callers
// still treat it as one string.
import { useRef, useState } from "react";
import { isRecoveryWord } from "@/lib/client/crypto";

const COUNT = 12;

// Cells read from HeroUI's field tokens so the grid matches the InputGroups
// around it, focus ring included.
const CELL = {
  bg: "var(--field-background)",
  border: "var(--border)",
  badBorder: "rgba(239,68,68,0.5)",
  number: "var(--muted)",
  badNumber: "#f87171",
  text: "var(--foreground)",
};

// BIP39 words are plain lowercase a-z.
const clean = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

function toSlots(value: string): string[] {
  const arr = value.split(" ");
  return Array.from({ length: COUNT }, (_, i) => arr[i] ?? "");
}

export default function RecoveryWordsInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const slots = toSlots(value);

  const commit = (next: string[]) => onChange(next.join(" "));

  // Flag a finished word that isn't on the recovery word list. Skipped for the
  // row being typed in, so it doesn't nag mid-word.
  const isBad = (i: number) => !!slots[i] && focused !== i && !isRecoveryWord(slots[i]);

  function focusSlot(i: number) {
    const el = refs.current[Math.max(0, Math.min(COUNT - 1, i))];
    el?.focus();
    el?.select();
  }

  // Spread multiple words across consecutive rows (paste or autofill).
  function spread(from: number, words: string[]) {
    const next = [...slots];
    let k = 0;
    for (; k < words.length && from + k < COUNT; k++) next[from + k] = clean(words[k]);
    commit(next);
    focusSlot(from + k);
  }

  function handleChange(i: number, raw: string) {
    // Whitespace reaching onChange means a space/enter that keydown didn't
    // intercept — common on mobile keyboards and IMEs, which don't report a
    // usable `key`. Treat it as "word finished" rather than silently eating it.
    if (/\s/.test(raw)) {
      const parts = raw.trim().split(/\s+/).filter(Boolean);
      if (parts.length > 1) return spread(i, parts);
      const next = [...slots];
      next[i] = clean(parts[0] ?? "");
      commit(next);
      if (next[i] && i < COUNT - 1) focusSlot(i + 1);
      return;
    }
    const next = [...slots];
    next[i] = clean(raw);
    commit(next);
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === " ") {
      // Space never belongs inside a word — use it to advance.
      e.preventDefault();
      if (slots[i] && i < COUNT - 1) focusSlot(i + 1);
      return;
    }
    if (e.key === "Enter") {
      // Advance while there are rows left; on the last row let the form submit.
      if (slots[i] && i < COUNT - 1) {
        e.preventDefault();
        focusSlot(i + 1);
      }
      return;
    }
    if (e.key === "Backspace" && !slots[i] && i > 0) {
      e.preventDefault();
      focusSlot(i - 1);
    }
    if (e.key === "ArrowLeft" && !slots[i] && i > 0) focusSlot(i - 1);
    if (e.key === "ArrowRight" && i < COUNT - 1) focusSlot(i + 1);
  }

  function handlePaste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    const parts = text.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      e.preventDefault();
      spread(i, parts);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
      {slots.map((w, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: CELL.bg,
            border: `1px solid ${isBad(i) ? CELL.badBorder : CELL.border}`,
            borderRadius: "var(--field-radius)",
            boxShadow: focused === i ? "0 0 0 2px var(--focus)" : undefined,
            padding: "6px 8px",
            // Grid items default to min-width:auto and won't shrink below the
            // input's intrinsic width, which overflows the page on narrow
            // screens. minWidth:0 lets the columns actually divide the row.
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: isBad(i) ? CELL.badNumber : CELL.number,
              fontSize: "11px",
              minWidth: "1.6em",
              textAlign: "right",
              fontFamily: "ui-monospace, monospace",
              userSelect: "none",
            }}
          >
            {i + 1}.
          </span>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            size={1}
            value={w}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused((f) => (f === i ? null : f))}
            disabled={disabled}
            title={isBad(i) ? "Not a word from the recovery list. Check for a typo." : undefined}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`Recovery word ${i + 1}`}
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: CELL.text,
              fontFamily: "ui-monospace, monospace",
              fontSize: "13px",
              padding: 0,
            }}
          />
        </div>
      ))}
    </div>
  );
}
