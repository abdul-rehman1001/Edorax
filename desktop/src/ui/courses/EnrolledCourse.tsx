import { useEffect, useRef, useState } from 'react';
import type { CourseOverview } from '../../../../server/src/shared/api/catalog';
import { CourseOverviewContent } from '@buildment/learning-ui/components/learn/course-overview-content';
import { CourseVariantContent } from '@buildment/learning-ui/components/learn/course-variant-content';
import { CourseNavigationProvider } from '@buildment/learning-ui/components/learn/course-navigation';

export function EnrolledCourse({
  slug,
  onStart,
  onBack,
  onSession,
}: {
  slug: string;
  onStart: (chapter?: string) => void;
  onBack: () => void;
  onSession: (signedIn: boolean) => void;
}) {
  const [overview, setOverview] = useState<CourseOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [assetBase, setAssetBase] = useState('');
  const generation = useRef(0);

  async function load() {
    const request = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const result = await window.buildment.learning.overview(slug);
      if (request !== generation.current) return;
      if (!result.ok) {
        setError(result.message);
        if (result.code === 'AUTH_REQUIRED') onSession(false);
        return;
      }
      setOverview(result.data);
      const { track, enrollment } = result.data;
      setPicking(
        Boolean(
          track &&
          !track.variantChosen &&
          !track.variantLocked &&
          enrollment?.chaptersCompleted === 0,
        ),
      );
    } catch {
      if (request === generation.current)
        setError('Could not load your course. Please try again.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void window.buildment
      .webOrigin()
      .then(setAssetBase)
      .catch(() => {});
    return () => {
      generation.current++;
    };
  }, [slug]);

  function navigate(href: string) {
    const path = href.split(/[?#]/)[0];
    const coursePath = `/courses/${slug}`;
    if (path === '/dashboard' || path === '/my-courses') return onBack();
    if (path === coursePath) return setPicking(false);
    if (path === coursePath + '/variant') return setPicking(true);
    if (path.startsWith(coursePath + '/')) {
      const chapter = path.slice(coursePath.length + 1);
      if (chapter && !chapter.includes('/'))
        onStart(decodeURIComponent(chapter));
    }
  }
  async function choose(data: FormData, kind: 'variant' | 'specialisation') {
    const request = generation.current;
    setError('');
    try {
      const result = await window.buildment.learning.updateTrack(
        slug,
        kind,
        String(data.get(kind + 'Slug') || ''),
      );
      if (request !== generation.current) return;
      if (!result.ok) {
        setError(result.message);
        if (result.code === 'AUTH_REQUIRED') onSession(false);
        return;
      }
      await load();
      if (kind === 'variant') onStart();
    } catch {
      if (request === generation.current)
        setError('Could not save your choice. Please try again.');
    }
  }
  return (
    <CourseNavigationProvider onNavigate={navigate} assetBase={assetBase}>
      <div className="course-overview-surface">
        {error && (
          <div
            role="alert"
            className="m-6 rounded-xl border border-border bg-card p-5"
          >
            <p>{error}</p>
            <button className="mt-3 underline" onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <CourseLoading />
        ) : overview?.access === 'active' &&
          overview.enrollment &&
          overview.syllabus ? (
          picking ? (
            <CourseVariantContent
              overview={overview}
              onChoose={(data) => choose(data, 'variant')}
            />
          ) : (
            <CourseOverviewContent
              overview={overview}
              onChooseSpecialisation={(data) => choose(data, 'specialisation')}
              onUpgradeCurriculum={async () => {
                await window.buildment.learning.upgradeCurriculum(slug);
                await load();
              }}
            />
          )
        ) : !error ? (
          <div
            role="status"
            className="m-6 rounded-xl border border-border p-6"
          >
            <h1 className="text-xl font-semibold">
              {overview?.access === 'payment_required'
                ? 'Payment required'
                : 'Course access unavailable'}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {overview?.access === 'payment_required'
                ? 'Complete checkout on the website to unlock your lessons.'
                : 'Your enrollment may have changed. Return to courses to check your access.'}
            </p>
            <button className="mt-4 underline" onClick={onBack}>
              Back to courses
            </button>
          </div>
        ) : null}
      </div>
    </CourseNavigationProvider>
  );
}

export function CourseLoading() {
  return (
    <div role="status" className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <p className="text-sm text-muted-foreground">Loading your course…</p>
      <div
        aria-hidden
        className="h-64 rounded-xl bg-muted motion-safe:animate-pulse"
      />
      <div
        aria-hidden
        className="h-40 rounded-xl bg-muted motion-safe:animate-pulse"
      />
    </div>
  );
}
