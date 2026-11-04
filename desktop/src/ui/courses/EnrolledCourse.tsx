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
  const [download, setDownload] = useState<{ available: boolean; downloadedAt: string | null; chapters: number; pending: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');
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
    void window.buildment.offline.status(slug).then(setDownload);
    void window.buildment
      .webOrigin()
      .then(setAssetBase)
      .catch(() => {});
    return () => {
      generation.current++;
    };
  }, [slug]);

  async function downloadLessons() {
    setDownloading(true);
    setDownloadMessage('');
    try {
      const result = await window.buildment.offline.download(slug);
      if (!result.ok) setDownloadMessage(result.message);
      else {
        setDownloadMessage(`${result.data.chapters} lessons saved for offline reading${result.data.locked ? `; ${result.data.locked} locked lessons need to be unlocked online first` : ''}.`);
        setDownload(await window.buildment.offline.status(slug));
      }
    } catch {
      setDownloadMessage('Could not save this course. Check your connection and try again.');
    } finally {
      setDownloading(false);
    }
  }

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
        {overview?.access === 'active' && <section className="mx-6 mt-5 rounded-xl border border-border bg-card p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Study offline</p>
              <p className="mt-1 text-muted-foreground">
                {download?.downloadedAt
                  ? `${download.chapters} lessons saved on this device. Last updated ${new Date(download.downloadedAt).toLocaleDateString()}.`
                  : 'Save unlocked lessons and exercises to read without internet.'}
              </p>
            </div>
            <div className="flex gap-2">
              {Boolean(download?.pending) && <button className="rounded-lg border border-border px-3 py-2" onClick={async () => { const result = await window.buildment.offline.sync(); setDownload(await window.buildment.offline.status(slug)); setDownloadMessage(result.message ?? 'Saved changes synced.'); }}>Sync changes</button>}
              {download?.downloadedAt && <button className="rounded-lg border border-border px-3 py-2" onClick={async () => { try { await window.buildment.offline.remove(slug); setDownload(await window.buildment.offline.status(slug)); } catch (error) { setDownloadMessage(error instanceof Error ? error.message : 'Could not remove download.'); } }}>Remove download</button>}
              <button className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" disabled={downloading || download?.available === false} onClick={() => void downloadLessons()}>{downloading ? 'Saving lessons…' : download?.downloadedAt ? 'Update download' : 'Download lessons'}</button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Videos, AI activities, graded answers, quizzes, and chapter completion need internet. Notes and checklists saved offline will sync when you reconnect. Saved lessons are available until your sign-in expires.</p>
          {Boolean(download?.pending) && <p role="status" className="mt-2 text-xs">{download!.pending} offline note or checklist changes waiting to sync. They remain encrypted on this device.</p>}
          {download?.available === false && <p role="alert" className="mt-2">Enable your system keyring to protect offline course data.</p>}
          {downloadMessage && <p role="status" className="mt-2">{downloadMessage}</p>}
        </section>}
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
