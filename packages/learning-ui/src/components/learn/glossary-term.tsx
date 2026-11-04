"use client";

import { useId, useState } from "react";

/** Inline, keyboard- and touch-accessible explanation. It deliberately is not
 * a database block: a definition belongs next to the word it explains. The
 * closed tooltip is display:none, not just invisible, so a term near the
 * right edge cannot widen the page on a phone. */
export function GlossaryTerm({ term, definition }: { term: string; definition: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="group/glossary relative inline-block">
      <button
        type="button"
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="cursor-help rounded-sm border-b border-dashed border-foreground/40 px-0.5 font-medium text-foreground decoration-foreground/40 outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {term}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute bottom-full left-0 z-30 mb-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover px-3 py-2 text-left text-sm font-normal leading-relaxed text-popover-foreground ${
          open ? "block" : "hidden group-hover/glossary:block group-focus-within/glossary:block"
        }`}
      >
        {definition}
      </span>
    </span>
  );
}
