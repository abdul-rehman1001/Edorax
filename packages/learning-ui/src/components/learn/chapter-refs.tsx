"use client";

import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { useChapterLink } from "./chapter-link-context";

const CHAPTER_REF = /\b((?:chapter|lesson)\s+)(\d{1,2})\.(\d{1,2})\b/gi;

const SKIP_TAGS = new Set(["a", "button", "code", "input", "pre", "script", "style", "textarea"]);

function lessonLabel(modulePart: string, chapterPart: string) {
  return `${Number(modulePart)}.${Number(chapterPart)}`;
}

/** Turns "chapter 1.2" in a plain string into a link when the reader knows that lesson. */
export function ChapterRefText({ text }: { text: string }) {
  const chapterLink = useChapterLink();
  const nodes: ReactNode[] = [];
  let last = 0;
  CHAPTER_REF.lastIndex = 0;
  for (const match of text.matchAll(CHAPTER_REF)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const visible = match[0];
    const url = chapterLink?.resolveChapterUrl(lessonLabel(match[2]!, match[3]!)) ?? null;
    nodes.push(
      url ? (
        <a
          key={`${index}-${visible}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary"
        >
          {visible}
        </a>
      ) : (
        visible
      )
    );
    last = index + visible.length;
  }
  if (last === 0) return <>{text}</>;
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}

function mapNode(node: ReactNode): ReactNode {
  return Children.map(node, (child, index) => {
    if (typeof child === "string") return <ChapterRefText key={index} text={child} />;
    if (!isValidElement(child)) return child;
    if (typeof child.type === "string" && SKIP_TAGS.has(child.type)) return child;
    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;
    return cloneElement(child, { key: child.key ?? index }, mapNode(props.children));
  });
}

/** Link chapter references in rendered prose without touching code, buttons, or existing links. */
export function ChapterRefChildren({ children }: { children: ReactNode }) {
  return <>{mapNode(children)}</>;
}
