import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inlineMarkdownToText, parseInlineMarkdown } from "@/lib/inline-markdown";

const html = (text: string) => renderToStaticMarkup(createElement(Fragment, null, ...parseInlineMarkdown(text)));

const STRONG = '<strong class="font-semibold text-foreground">';
const CODE = '<code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground">';

describe("parseInlineMarkdown", () => {
  it("renders bold with theme tokens", () => {
    expect(html("Ship the **cart** today")).toBe(`Ship the ${STRONG}cart</strong> today`);
  });

  it("renders inline code with theme tokens", () => {
    expect(html("Run `pnpm test` first")).toBe(`Run ${CODE}pnpm test</code> first`);
  });

  it("leaves an unmatched ** literal", () => {
    expect(html("2 ** 8 is 256")).toBe("2 ** 8 is 256");
    expect(html("**open but never closed")).toBe("**open but never closed");
    expect(html("**done** and **dangling")).toBe(`${STRONG}done</strong> and **dangling`);
  });

  it("leaves a lone backtick literal", () => {
    expect(html("a ` b")).toBe("a ` b");
  });

  it("renders code nested inside bold", () => {
    expect(html("**Use `findOne` here**")).toBe(`${STRONG}Use ${CODE}findOne</code> here</strong>`);
  });

  it("keeps bold markers inside code literal", () => {
    expect(html("`a ** b` and `**x**`")).toBe(`${CODE}a ** b</code> and ${CODE}**x**</code>`);
  });

  it("does not close bold on a ** inside a nested code span", () => {
    expect(html("**pow is `a ** b` in JS**")).toBe(`${STRONG}pow is ${CODE}a ** b</code> in JS</strong>`);
  });

  it("renders italic nested inside bold and bold nested inside italic", () => {
    expect(html("**a *b* c**")).toBe(`${STRONG}a <em>b</em> c</strong>`);
    expect(html("*a **b** c*")).toBe(`<em>a ${STRONG}b</strong> c</em>`);
  });

  it("does not treat spaced asterisks as italic", () => {
    expect(html("2 * 3 * 4")).toBe("2 * 3 * 4");
  });

  it("escapes HTML instead of injecting it", () => {
    expect(html("**<img src=x>**")).toBe(`${STRONG}&lt;img src=x&gt;</strong>`);
  });

  it("leaves a chapter reference as text until the reader can link it", () => {
    expect(html("See chapter 1.2")).toBe("See chapter 1.2");
    expect(inlineMarkdownToText("See chapter 01.02")).toBe("See chapter 01.02");
  });
});

describe("inlineMarkdownToText", () => {
  it("strips bold and code markers for aria labels", () => {
    expect(inlineMarkdownToText("Why does **`findOne`** return null?")).toBe("Why does findOne return null?");
  });

  it("drops stray markers but keeps code span content exact", () => {
    expect(inlineMarkdownToText("**dangling and `a ** b`")).toBe("dangling and a ** b");
  });
});
