"use client";
import { useMemo } from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { ChapterRefText } from './chapter-refs';

// Quiz prompts are Markdown, not executable MDX or HTML.
export function MarkdownText({ text }: { text: string }) {
  const tree = useMemo(
    () => unified().use(remarkParse).use(remarkGfm).parse(text),
    [text],
  );
  return (
    <span className="reader-markdown">
      <MarkdownNode node={tree} />
    </span>
  );
}
function MarkdownNode({ node }: { node: any }) {
  const children = node.children?.map((child: any, index: number) => (
    <MarkdownNode key={index} node={child} />
  ));
  switch (node.type) {
    case 'root':
      return <>{children}</>;
    case 'text':
      return <ChapterRefText text={String(node.value ?? '')} />;
    case 'paragraph':
      return (
        <span className="mb-2 block whitespace-pre-wrap leading-7 last:mb-0">
          {children}
        </span>
      );
    case 'strong':
      return <strong className="font-semibold">{children}</strong>;
    case 'emphasis':
      return <em>{children}</em>;
    case 'inlineCode':
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
          {node.value}
        </code>
      );
    case 'code':
      return (
        <span className="my-4 block overflow-x-auto rounded-xl border border-border bg-muted p-4">
          <code className="whitespace-pre font-mono text-sm">{node.value}</code>
        </span>
      );
    case 'list':
      return <span className="my-2 block space-y-2 pl-4">{children}</span>;
    case 'listItem':
      return <span className="block">• {children}</span>;
    case 'heading':
      return <strong className="my-3 block text-lg">{children}</strong>;
    case 'link':
      return (
        <span>
          {children}{' '}
          <span className="select-all text-xs text-muted-foreground">
            ({node.url})
          </span>
        </span>
      );
    default:
      return <>{children}</>;
  }
}
