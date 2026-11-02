import { useEffect, useRef, useState } from 'react';
import { filterCourses, isMyCourse, type Course } from '../domain/catalog';
import { CourseReader } from './learning/CourseReader';
import { CoursePreview } from './courses/CoursePreview';
import { CourseCatalog } from './courses/CourseCatalog';
import { Sidebar } from './layout/Sidebar';
import { WorkspaceHeader } from './layout/WorkspaceHeader';
import { useSession } from './auth/useSession';

export function App() {
  const [selected, setSelected] = useState<Course | null>(null);
  const [chapter, setChapter] = useState<string | undefined>();
  const [reading, setReading] = useState(false);
  const session = useSession();
  const { signedIn, setSignedIn, authBusy, authRevision, changeSession } =
    session;
  useEffect(() => {
    if (!signedIn) setReading(false);
  }, [signedIn]);
  const main = useRef<HTMLElement>(null);
  const catalogScroll = useRef(0);
  function openCourse(course: Course) {
    catalogScroll.current = main.current?.scrollTop || 0;
    setSelected(course);
    if (main.current) main.current.scrollTop = 0;
  }
  function backToCourses() {
    const id = selected?.id;
    setReading(false);
    setSelected(null);
    requestAnimationFrame(() => {
      if (main.current) main.current.scrollTop = catalogScroll.current;
      if (id)
        document
          .getElementById(`preview-${id}`)
          ?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    document.documentElement.dataset.appReady = 'true';
    document.getElementById('startup-status')?.setAttribute('hidden', '');
  }, []);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [tab, setTab] = useState<'all' | 'mine'>('all');

  const catalogGeneration = useRef(0);
  async function load() {
    const request = ++catalogGeneration.current;
    setLoading(courses.length === 0);
    setError('');
    try {
      const result = await window.buildment.listCourses();
      if (request !== catalogGeneration.current) return;
      if (result.ok) setCourses(result.courses);
      else setError(result.message);
    } catch {
      if (request !== catalogGeneration.current) return;
      setError(
        'The desktop connection is unavailable. Restart the app and try again.',
      );
    } finally {
      if (request === catalogGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    if (!selected) void load();
    return () => {
      catalogGeneration.current++;
    };
  }, [authRevision, signedIn, selected?.id]);
  const visible =
    tab === 'mine'
      ? courses.filter(isMyCourse)
      : filterCourses(courses, query, category);
  const categories = [...new Set(courses.map((course) => course.category))];

  function toggleSidebar() {
    setCollapsed((value) => {
      try {
        localStorage.setItem('sidebar-collapsed', String(!value));
      } catch {
        /* The sidebar still works if local preferences cannot be saved. */
      }
      return !value;
    });
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {!(reading && signedIn) && (
        <WorkspaceHeader
          selected={Boolean(selected)}
          courseTitle={selected?.title}
          backToCourses={backToCourses}
          session={session}
        />
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!(reading && signedIn) && (
          <Sidebar
            collapsed={collapsed}
            toggleSidebar={toggleSidebar}
            backToCourses={backToCourses}
          />
        )}

        <main ref={main} className="min-w-0 flex-1 overflow-y-auto">
          {selected && reading && signedIn ? (
            <CourseReader
              key={selected.slug + ':' + authRevision}
              courseSlug={selected.slug}
              courseTitle={selected.title}
              initialChapter={chapter}
              session={session}
              onBack={() => setReading(false)}
              onSignedOut={() => {
                setSignedIn(false);
                setReading(false);
              }}
            />
          ) : selected ? (
            <CoursePreview
              key={selected.slug}
              course={selected}
              signedIn={signedIn}
              busy={authBusy}
              authRevision={authRevision}
              onSignIn={() => void changeSession(true)}
              onSession={setSignedIn}
              onBack={backToCourses}
              onStart={(chapter) => {
                setChapter(chapter);
                setReading(true);
              }}
            />
          ) : (
            <CourseCatalog
              {...{
                courses,
                visible,
                categories,
                loading,
                error,
                query,
                category,
                setQuery,
                setCategory,
                load,
                openCourse,
                tab,
                setTab,
                signedIn,
                onSignIn: () => void changeSession(true),
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
