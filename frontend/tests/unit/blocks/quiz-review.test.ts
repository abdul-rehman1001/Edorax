import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QuizClient } from "@/blocks/quiz/QuizClient";
import { QuizSessionContext, type QuizSessionContextValue } from "@buildment/learning-ui/components/learn/quiz-session-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const config = {
  quizType: "single" as const,
  prompt: "Choose an option",
  options: [{ id: "a", label: "First" }, { id: "b", label: "Second" }],
  allowRetry: true,
};

function renderReview(isCorrect: boolean, dirty = false) {
  const value: QuizSessionContextValue = {
    chapterTitle: "Quiz", questionTotal: 1, reviewMode: true,
    dirtyBlockIds: new Set(dirty ? ["question"] : []),
    blockGrades: { question: { selected: ["b"], isCorrect, explanation: "Review feedback" } },
  };
  return renderToStaticMarkup(createElement(QuizSessionContext.Provider, { value },
    createElement(QuizClient, { id: "question", config, presentation: "wizard", draftStorageKey: "draft" })));
}

describe("quiz review rendering", () => {
  it("renders a saved correct answer and locks its options immediately", () => {
    const html = renderReview(true);
    expect(html).toContain("Correct. Well done.");
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Review feedback");
    expect(html).toContain("rounded-full bg-white");
  });

  it("renders an incorrect answer without locking retries", () => {
    const html = renderReview(false);
    expect(html).toContain("Not quite");
    expect(html).not.toContain('disabled=""');
  });

  it("hides the previous grade while an answer is being edited", () => {
    const html = renderReview(true, true);
    expect(html).not.toContain("Correct. Well done.");
    expect(html).not.toContain("Review feedback");
    expect(html).not.toContain('disabled=""');
  });
});
