"use client";

import { useRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { CodeToolbar } from "@buildment/learning-ui/components/learn/code-toolbar";
import { CopyCodeButton } from "@/mdx/copy-code-button";

type CodeProps = ComponentProps<"code"> & {
  "data-theme"?: string;
  "data-language"?: string;
};

type PreProps = ComponentProps<"pre"> & {
  "data-language"?: string;
};

type FigureProps = ComponentProps<"figure"> & {
  "data-rehype-pretty-code-figure"?: string;
};

function isPrettyFigure(className: string | undefined, props: FigureProps) {
  if (props["data-rehype-pretty-code-figure"] != null) return true;
  return typeof className === "string" && className.split(/\s+/).includes("shiki-figure");
}

/** Wrapper from rehype-pretty-code (Shiki). */
export function MdxCodeFigure({ className, children, ...props }: FigureProps) {
  const isPretty = isPrettyFigure(className, props);
  if (!isPretty) {
    return (
      <figure className={className} {...props}>
        {children}
      </figure>
    );
  }

  return (
    <figure
      className={cn(
        "not-prose shiki-figure my-6 overflow-hidden rounded-xl border shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </figure>
  );
}

export function MdxCodePre({ className, children, ...props }: PreProps) {
  const preRef = useRef<HTMLPreElement>(null);
  // The text to copy, from the rendered element: what the user sees is what the button copies.
  const getCodeText = () => preRef.current?.textContent ?? "";
  const language = props["data-language"];
  if (language) {
    return (
      <>
        <CodeToolbar language={language} getText={getCodeText} />
        <pre
          ref={preRef}
          className={cn(
            "code-block-pre m-0 overflow-x-auto px-4 py-4 font-mono text-[0.8125rem] leading-[1.7]",
            className,
          )}
          tabIndex={0}
          {...props}
        >
          {children}
        </pre>
      </>
    );
  }

  const dataMeta = (props as { "data-meta"?: string })["data-meta"];
  return (
    <div
      className={cn(
        "not-prose my-6 overflow-hidden rounded-xl border border-border bg-muted shadow-sm",
        "[&_code]:block [&_code]:whitespace-pre [&_code]:bg-transparent [&_code]:p-0",
        "[&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:leading-relaxed",
      )}
    >
      {dataMeta ? (
        <div className="flex items-center justify-between border-b border-border bg-muted/80 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">{dataMeta}</span>
          <CopyCodeButton getText={getCodeText} />
        </div>
      ) : (
        <div className="flex justify-end border-b border-border bg-muted/80 px-4 py-2">
          <CopyCodeButton getText={getCodeText} />
        </div>
      )}
      <pre
        ref={preRef}
        className={cn(
          "m-0 overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed",
          className,
        )}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

export function MdxCodeElement({ className, children, style, ...props }: CodeProps) {
  const isShiki = Boolean(props["data-theme"] || props["data-language"]);

  if (isShiki) {
    return (
      <code
        className={cn(
          "shiki-code block min-w-full font-mono text-[0.8125rem] leading-[1.7]",
          "bg-transparent p-0 before:content-none after:content-none",
          className,
        )}
        style={style}
        {...props}
      >
        {children}
      </code>
    );
  }

  const isFenced = Boolean(className && /language-/.test(className));
  if (isFenced) {
    return (
      <code
        className={cn(
          "block whitespace-pre font-mono text-[0.875em] font-normal leading-relaxed",
          "bg-transparent p-0 before:content-none after:content-none",
          className,
        )}
        style={style}
        {...props}
      >
        {children}
      </code>
    );
  }

  return (
    <code
      className="rounded bg-muted px-1.5 py-0.5 text-[0.85em] font-normal text-foreground before:content-none after:content-none"
      {...props}
    >
      {children}
    </code>
  );
}
