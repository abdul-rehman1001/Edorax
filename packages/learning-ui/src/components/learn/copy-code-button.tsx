"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

// Copy button for a code block toolbar. It is its own client component so the MDX renderer can stay
// server-capable; only this button needs state and the clipboard. The text comes from a getter the
// renderer wires to the rendered <pre>, so what is copied is exactly what is on screen.

export function CopyCodeButton({
  getText,
  label = "Copy code",
}: {
  getText: () => string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const reset = () => {
    window.setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2000);
  };

  const handleCopy = () => {
    const text = getText();
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        reset();
      })
      .catch(() => {
        // Give feedback either way: a silent dead button reads as broken. Chrome refuses
        // clipboard-write without a trusted gesture, which a copy request always satisfies; anything
        // else surfaces here as a brief error so the user can use the fallback.
        setFailed(true);
        reset();
      });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={failed ? "Copy failed" : copied ? "Copied" : label}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
    >
      {failed ? (
        <X className="size-3.5 text-red-500" aria-hidden />
      ) : copied ? (
        <Check className="size-3.5 text-emerald-500" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
      {failed ? "Failed" : copied ? "Copied" : "Copy"}
    </button>
  );
}
