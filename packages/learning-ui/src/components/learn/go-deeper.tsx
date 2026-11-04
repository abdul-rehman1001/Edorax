import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * <GoDeeper> in chapter MDX: the fold under a beat that holds the full
 * mechanism, trade-offs, failure modes, sources and code. A native <details>,
 * so it works before any script loads and keeps the chapter's prose styling
 * for whatever is inside it. See agent-ip/03-authoring-standards.md
 * "Visual-first Learn chapters".
 */
export function GoDeeper({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group/deeper my-5 rounded-xl border border-border bg-muted/20 px-4 open:pb-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[15px] font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 transition-transform duration-200 group-open/deeper:rotate-90 motion-reduce:transition-none" />
        {title ?? "Go deeper"}
      </summary>
      <div className="pt-1 [&>*:first-child]:mt-2">{children}</div>
    </details>
  );
}
