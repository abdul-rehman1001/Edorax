"use client";
import type { ReactNode } from "react";
import { CopyCodeButton } from "./copy-code-button";
const labels: Record<string, string> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  bash: "Shell",
  sh: "Shell",
  shell: "Shell",
  json: "JSON",
  md: "Markdown",
  plaintext: "Text",
};
export function CodeToolbar({
  language,
  getText,
  children,
}: {
  language: string;
  getText: () => string;
  children?: ReactNode;
}) {
  return (
    <div className="code-block-toolbar flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
      <span className="code-block-lang font-mono text-[11px] font-semibold uppercase tracking-wider">
        {labels[language] || language.toUpperCase()}
      </span>
      <div className="flex items-center gap-2">
        {children}
        <CopyCodeButton getText={getText} />
      </div>
    </div>
  );
}
