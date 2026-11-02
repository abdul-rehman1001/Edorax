import { IDEExercise } from '../labs/CourseIDE';
import { playFeedback } from '../../lib/sound-feedback';
import { lazy, Suspense, useEffect, useState } from 'react';
import { lessonBlocks } from './blocks/registry';
import { lessonAsset } from './blocks/assets';
import type { BlockState } from '../../domain/learning';
import { AiInterviewClient } from '@buildment/learning-ui/blocks/ai-interview/AiInterviewClient';
import { MustReadCard } from '@buildment/learning-ui/blocks/must-read/MustReadCard';
import { QuizClient } from '@buildment/learning-ui/blocks/exercises/QuizClient';
import { PredictClient } from '@buildment/learning-ui/blocks/exercises/PredictClient';
import { OpenQuestionClient } from '@buildment/learning-ui/blocks/exercises/OpenQuestionClient';
import { CodeExerciseClient } from '@buildment/learning-ui/blocks/exercises/CodeExerciseClient';

const CourseCodeEditor = lazy(() => import('../labs/CourseCodeEditor'));

export function Exercise({
  id,
  onSaved,
  quizAnswers,
  onQuizAnswer,
}: {
  id: string;
  onSaved: () => void;
  quizAnswers?: Record<string, string[]>;
  onQuizAnswer?: (id: string, selected: string[]) => void;
}) {
  const [block, setBlock] = useState<BlockState | null>(null);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    window.buildment.learning
      .block(id)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setError(result.message);
          return;
        }
        const value = result.data;
        setBlock(value);
        if (value.type === 'MUST_READ') setRead(value.initialRead);
      })
      .catch(
        () =>
          active &&
          setError('Could not load the exercise. Reload the lesson to retry.'),
      );
    return () => {
      active = false;
    };
  }, [id]);
  async function submit() {
    if (!block || block.type !== 'MUST_READ' || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await window.buildment.learning.answer(id, {
        complete: true,
      });
      if (!result.ok) setError(result.message);
      else {
        setRead(true);
        onSaved();
      }
    } catch {
      setError('Could not save your answer. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!block)
    return (
      <div
        className="my-5 rounded-xl border border-border p-5"
        role={error ? 'alert' : 'status'}
      >
        {error || 'Loading exercise…'}
      </div>
    );
  const presentation = {
    VIDEO: 'Video',
    STEPS: 'Steps',
    VISUAL_DIAGRAM: 'VisualDiagram',
    PROJECT_PREVIEW: 'ProjectPreview',
    LEARNING_OBJECTIVES: 'LearningObjectives',
    CHAPTER_RECAP: 'ChapterRecap',
    VISUAL_WALKTHROUGH: 'VisualWalkthrough',
    ROADMAP: 'Roadmap',
  }[block.type as string];
  if (presentation) {
    const Component = lessonBlocks[presentation];
    return (
      <Component
        {...lessonAsset(block.config)}
        src={'sourceUrl' in block.config ? block.config.sourceUrl : undefined}
      />
    );
  }
  if (block.type === 'MUST_READ')
    return (
      <MustReadCard
        title={block.config.title}
        href={block.config.url}
        summary={block.config.description}
        source={block.config.source}
        readMinutes={block.config.readMinutes}
        blockId={id}
        required={block.required}
        read={read}
        disabled={busy}
        error={error}
        onReadChange={() => void submit()}
      />
    );
  if (block.type === 'AI_INTERVIEW')
    return (
      <AiInterviewClient
        config={block.config}
        initialState={block.initialState}
        request={async (action, payload) => {
          const result = await window.buildment.learning.aiInterview(
            id,
            action,
            payload,
          );
          if (!result.ok)
            throw Object.assign(new Error(result.message), {
              code: result.code,
            });
          return result.data.session;
        }}
        onComplete={onSaved}
      />
    );
  async function respond(payload: Record<string, unknown>) {
    const { type: _type, ...answer } = payload;
    const result = await window.buildment.learning.answer(id, answer);
    if (!result.ok) throw new Error(result.message);
    return result.data;
  }
  if (block.type === 'QUIZ')
    return (
      <QuizClient
        onFeedback={playFeedback}
        id={id}
        config={block.config}
        initialState={
          quizAnswers
            ? {
                selected: quizAnswers[id] ?? block.initialState?.selected ?? [],
                isCorrect: block.initialState?.isCorrect ?? null,
                score: block.initialState?.score ?? null,
                maxScore: block.initialState?.maxScore ?? null,
                explanation: block.initialState?.explanation,
              }
            : block.initialState
        }
        presentation={quizAnswers === undefined ? 'standalone' : 'wizard'}
        onAnswerChange={(answers) => onQuizAnswer?.(id, answers)}
        onRespond={respond}
        onComplete={onSaved}
      />
    );
  if (block.type === 'PREDICT')
    return (
      <PredictClient
        id={id}
        config={block.config}
        initialState={block.initialState}
        onRespond={respond}
        onComplete={onSaved}
      />
    );
  if (block.type === 'OPEN_QUESTION')
    return (
      <OpenQuestionClient
        id={id}
        config={block.config}
        initialState={block.initialState}
        groupPosition={block.group.position}
        questionIndex={block.group.index}
        questionTotal={block.group.total}
        onRespond={respond}
        onComplete={onSaved}
      />
    );
  if (block.type === 'CODE')
    return (
      <IDEExercise id={id} title={block.config.prompt}>
        <CodeExerciseClient
          renderEditor={(props) => (
            <Suspense fallback={<p role="status">Opening code editor…</p>}>
              <CourseCodeEditor key={id} blockId={id} {...props} />
            </Suspense>
          )}
          id={id}
          config={block.config}
          initialState={block.initialState}
          onRespond={respond}
          onComplete={onSaved}
        />
      </IDEExercise>
    );
  return null;
}
