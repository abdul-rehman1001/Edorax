import { useEffect, useState } from "react";
import { Code2 } from "lucide-react";
import { CodeToolbar } from "@buildment/learning-ui/components/learn/code-toolbar";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import { createHighlighter, bundledLanguages } from "shiki/bundle/web";
import { useCourseIDE } from "./CourseIDE";

const highlighter = createHighlighter({
  themes: ["github-light", "github-dark"],
  langs: [],
  engine: createJavaScriptRegexEngine(),
});

export function LessonSnippet({ source, language }: { source: string; language: string }) {
  const ide = useCourseIDE();
  const [html, setHtml] = useState("");
  useEffect(() => {
    let alive = true;
    setHtml("");
    // Shiki escapes the source; lesson code is never evaluated.
    void highlighter
      .then(async (highlighter) => {
        const lang = language in bundledLanguages ? language : "text";
        if (lang !== "text") await highlighter.loadLanguage(lang as keyof typeof bundledLanguages);
        const result = highlighter.codeToHtml(source, {
          lang,
          themes: { light: "github-light", dark: "github-dark" },
        });
        if (alive) setHtml(result);
      })
      .catch((error) => console.error("Snippet highlighting failed", error));
    return () => {
      alive = false;
    };
  }, [source, language]);
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-border shadow-sm">
      <CodeToolbar language={language} getText={() => source}>
        <button
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs hover:bg-muted"
          onClick={() => ide.openSnippet(source, language)}
        >
          <Code2 size={14} />
          Open in IDE
        </button>
      </CodeToolbar>
      {html ? (
        <div className="lesson-snippet" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-4 text-[13px] leading-6">
          <code>{source}</code>
        </pre>
      )}
    </figure>
  );
}
