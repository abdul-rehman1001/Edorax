import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkGfm from 'remark-gfm';
import { readerRemarkPlugins } from '../../../server/src/shared/mdx/reader-plugins';
import { restoreInteractiveBlockTags } from '../../../server/src/shared/mdx/restore-block-tags';
import { chapterBodyForReader } from '../../../server/src/shared/lib/mdx-frontmatter';
import type { LessonNode } from '../domain/learning';
import { literalValue } from './literal-value';

// Parse content as data. Never compile or execute author-provided JavaScript.
export function parseLesson(source: string): LessonNode {
  const parser = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMdx)
    // The same plugins as the web reader, so ```flow, ```sequence and ```mermaid
    // fences become the shared Diagram and MermaidDiagram blocks here too.
    .use(readerRemarkPlugins);
  const body = restoreInteractiveBlockTags(chapterBodyForReader(source));
  const tree = parser.runSync(parser.parse(body));
  function clean(node: any): LessonNode {
    if (
      node.type === 'code' &&
      (node.lang === 'canvas' || node.lang === 'lab') &&
      typeof node.value === 'string'
    ) {
      try {
        const parsed = JSON.parse(node.value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const {
            renderer,
            version,
            presentation,
            data: nestedData,
            ...rest
          } = parsed as Record<string, unknown>;
          const payload =
            nestedData &&
            typeof nestedData === 'object' &&
            !Array.isArray(nestedData)
              ? { ...rest, ...(nestedData as Record<string, unknown>) }
              : rest;
          if (node.lang === 'canvas' && typeof renderer === 'string') {
            return {
              type: 'mdxJsxFlowElement',
              name: 'InteractiveCanvas',
              attributes: {
                renderer,
                ...(typeof version === 'number' ? { version } : {}),
                ...(presentation && typeof presentation === 'object'
                  ? { presentation }
                  : {}),
                data: payload,
              },
            };
          }
          if (node.lang === 'lab' && typeof payload.family === 'string') {
            return {
              type: 'mdxJsxFlowElement',
              name: 'Lab',
              attributes: {
                ...(typeof version === 'number' ? { version } : {}),
                ...(presentation && typeof presentation === 'object'
                  ? { presentation }
                  : {}),
                spec: payload,
              },
            };
          }
        }
      } catch {
        /* Falls back to code block if not valid JSON. */
      }
    }
    const result: LessonNode = { type: node.type };
    for (const key of [
      'value',
      'name',
      'depth',
      'url',
      'ordered',
      'lang',
      'meta',
    ] as const) {
      if (node[key] !== undefined) (result as any)[key] = node[key];
    }
    if (node.attributes) {
      result.attributes = {};
      for (const attribute of node.attributes) {
        if (attribute.type !== 'mdxJsxAttribute') continue;
        if (typeof attribute.value === 'string')
          result.attributes[attribute.name] = attribute.value;
        else if (attribute.value === null)
          result.attributes[attribute.name] = true;
        else if (attribute.value?.type === 'mdxJsxAttributeValueExpression') {
          try {
            result.attributes[attribute.name] = literalValue(
              attribute.value.data?.estree?.body?.[0]?.expression,
            );
          } catch {
            /* Executable expressions are never evaluated. */
          }
        }
      }
    }
    if (node.type === 'image') result.attributes = { alt: node.alt || '' };
    if (node.children) result.children = node.children.map(clean);
    return result;
  }
  return clean(tree);
}
