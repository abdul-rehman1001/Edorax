import { CourseLink } from '@buildment/learning-ui/components/learn/course-navigation';
import { cloneElement, createElement, isValidElement } from 'react';
import type { Lesson, LessonNode } from '../../domain/learning';
import { LessonSnippet } from '../labs/LessonSnippet';
import { Exercise } from './Exercise';
import { lessonBlocks } from './blocks/registry';
import { lessonAsset } from './blocks/assets';
import { BlockBoundary } from './blocks/BlockBoundary';
import { Checklist } from '@buildment/learning-ui/components/learn/checklist';
import { LearningLog } from '@buildment/learning-ui/components/learn/learning-log';

type Props = {
  node: LessonNode;
  lesson: Lesson;
  onSaved: () => void;
  quizAnswers?: Record<string, string[]>;
  onQuizAnswer?: (id: string, selected: string[]) => void;
};
export function LessonContent(props: Props): React.ReactNode {
  const { node, lesson, onSaved, quizAnswers, onQuizAnswer } = props;
  const children = node.children?.map((child, index) => {
    const rendered = LessonContent({ ...props, node: child });
    return isValidElement(rendered)
      ? cloneElement(rendered, { key: index })
      : rendered;
  });
  const attributes = lessonAsset(node.attributes || {});
  if (node.type === 'text') return <>{node.value}</>;
  if (node.type === 'root')
    return (
      <>
        {children?.map((child, index) => (
          <BlockBoundary key={index}>{child}</BlockBoundary>
        ))}
      </>
    );
  if (
    node.type === 'paragraph' &&
    node.children?.some(
      (child) => child.name && !['GlossaryTerm'].includes(child.name),
    )
  )
    return <div className="my-5 text-[17px] leading-8">{children}</div>;
  if (node.type === 'paragraph')
    return (
      <p className="my-5 whitespace-pre-wrap text-[17px] leading-8 text-foreground/90">
        {children}
      </p>
    );
  if (node.type === 'heading')
    return createElement(
      'h' + Math.min(6, Math.max(2, node.depth || 2)),
      {
        id: typeof attributes.id === 'string' ? attributes.id : undefined,
        className:
          (node.depth === 2
            ? 'mt-12 mb-5 border-b border-border pb-4 text-2xl'
            : 'mt-8 mb-4 text-xl') +
          ' font-semibold leading-snug tracking-tight',
      },
      children,
    );
  if (node.type === 'strong') return <strong>{children}</strong>;
  if (node.type === 'emphasis') return <em>{children}</em>;
  if (node.type === 'delete') return <del>{children}</del>;
  if (node.type === 'inlineCode')
    return <code className="rounded bg-muted px-1 py-0.5">{node.value}</code>;
  if (node.type === 'code')
    return (
      <LessonSnippet
        source={node.value || ''}
        language={node.lang || 'plaintext'}
      />
    );
  if (node.type === 'blockquote')
    return (
      <blockquote className="my-6 rounded-r-xl border-l-4 border-primary/40 bg-muted/40 px-6 py-1 text-foreground/90">
        {children}
      </blockquote>
    );
  if (node.type === 'list')
    return node.ordered ? (
      <ol className="my-4 list-decimal space-y-2 pl-7">{children}</ol>
    ) : (
      <ul className="my-4 list-disc space-y-2 pl-7">{children}</ul>
    );
  if (node.type === 'listItem') return <li>{children}</li>;
  if (node.type === 'thematicBreak')
    return <hr className="my-8 border-border" />;
  if (node.type === 'break') return <br />;
  if (node.type === 'table')
    return (
      <div className="my-5 overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>{children}</tbody>
        </table>
      </div>
    );
  if (node.type === 'tableRow') return <tr>{children}</tr>;
  if (node.type === 'tableCell')
    return <td className="border border-border p-3">{children}</td>;
  if (node.type === 'link') {
    const href = node.url || '';
    const className = 'font-medium underline underline-offset-4';
    if (/^https:\/\//i.test(href))
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {children}
        </a>
      );
    if (
      href.startsWith(`/courses/${lesson.course.slug}/`) ||
      href === `/courses/${lesson.course.slug}`
    )
      return (
        <CourseLink href={href} className={className}>
          {children}
        </CourseLink>
      );
    if (href.startsWith('#'))
      return (
        <a
          href={href}
          className={className}
          onClick={(event) => {
            event.preventDefault();
            document
              .getElementById(href.slice(1))
              ?.scrollIntoView({ block: 'start' });
          }}
        >
          {children}
        </a>
      );
    return <span>{children}</span>;
  }
  if (node.type === 'image' && node.url?.startsWith('https://'))
    return (
      <img
        src={node.url}
        alt={String(attributes.alt || '')}
        referrerPolicy="no-referrer"
        className="my-6 max-w-full rounded-xl"
      />
    );
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    const id = attributes.id || attributes.blockId;
    if (
      typeof id === 'string' &&
      [
        'Quiz',
        'Predict',
        'Code',
        'CodeExercise',
        'OpenQuestion',
        'MustRead',
        'AiInterview',
        'Video',
        'VideoBlock',
        'Steps',
        'ChapterRecap',
        'LearningObjectives',
        'ProjectPreview',
        'Roadmap',
        'VisualDiagram',
        'VisualWalkthrough',
      ].includes(node.name || '')
    )
      return (
        <Exercise
          id={id}
          onSaved={onSaved}
          quizAnswers={quizAnswers}
          onQuizAnswer={onQuizAnswer}
        />
      );
    let questions = attributes.questions;
    if (typeof questions === 'string') {
      try {
        questions = JSON.parse(questions);
      } catch {
        questions = [];
      }
    }
    if (
      node.name === 'LearningLog' &&
      (Array.isArray(questions) || typeof questions === 'string')
    )
      return (
        <LearningLog
          questions={questions}
          initialAnswers={lesson.content?.learningLogAnswers || {}}
          onSave={async (answers) => {
            const result = await window.buildment.learning.saveLog(
              lesson.chapter.id,
              answers,
            );
            if (result.ok) onSaved();
            return { ok: result.ok };
          }}
        />
      );
    if (node.name === 'Checklist' && Array.isArray(attributes.items))
      return (
        <Checklist
          items={attributes.items}
          initialChecks={lesson.content?.checklistState || {}}
          onToggle={async (itemId, checked) => {
            const result = await window.buildment.learning.checklist(
              lesson.chapter.id,
              itemId,
              checked,
            );
            if (!result.ok) throw new Error(result.message);
            onSaved();
          }}
        />
      );
    const Component = lessonBlocks[node.name || ''];
    if (Component)
      return (
        <Component
          {...attributes}
          onSaved={onSaved}
          src={attributes.src || attributes.sourceUrl}
        >
          {children?.length ? children : undefined}
        </Component>
      );
    if (node.name === 'Steps')
      return (
        <section className="my-8 rounded-2xl border border-border bg-card p-6">
          <h3 className="mb-6 text-lg font-semibold">
            {String(attributes.title || 'Step by step')}
          </h3>
          <ol>{children}</ol>
        </section>
      );
    if (children?.length)
      return (
        <section className="my-4">
          {typeof attributes.title === 'string' && (
            <h3 className="font-semibold">{String(attributes.title)}</h3>
          )}
          {children}
        </section>
      );
    return (
      <p className="my-4 rounded border border-border p-4 text-sm">
        This lesson includes a {node.name || 'custom'} activity that is not yet
        supported in the desktop reader.
      </p>
    );
  }
  // Imports, scripts, and MDX expressions are never executed or injected as HTML.
  return <>{children}</>;
}
