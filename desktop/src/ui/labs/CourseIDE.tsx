import {
  TheiaWorkspace,
  focusTheiaHost,
  type LessonSnippetRequest,
} from './TheiaWorkspace';
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Code2, Maximize2, Minimize2, X } from 'lucide-react';

const Editor = lazy(() => import('./CourseCodeEditor'));
type IDEState = {
  snippet: LessonSnippetRequest | null;
  lastExercise: string | null;
  forget: (id: string) => void;
  openSnippet: (source: string, language: string) => void;
  language: string;
  filename: string;
  source: string;
  setSource: (source: string) => void;
  open: boolean;
  focused: boolean;
  selected: string;
  host: HTMLDivElement | null;
  show: (id?: string) => void;
  close: () => void;
  toggleFocus: () => void;
  setHost: (host: HTMLDivElement | null) => void;
};
const Context = createContext<IDEState | null>(null);
export function useCourseIDE() {
  const value = useContext(Context);
  if (!value) throw new Error('Course IDE provider missing');
  return value;
}
export function CourseIDEProvider({ children }: { children: ReactNode }) {
  const [snippet, setSnippet] = useState<LessonSnippetRequest | null>(null);
  const snippetId = useRef(0);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState('scratch');
  const [lastExercise, setLastExercise] = useState<string | null>(null);
  const [source, setSource] = useState(
    '// Course workspace\nconsole.log("Ready to learn");\n',
  );
  const [language, setLanguage] = useState('javascript');
  const [filename, setFilename] = useState('exercise.js');
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <Context.Provider
      value={{
        snippet,
        open,
        focused,
        selected,
        host,
        setHost,
        source,
        setSource,
        language,
        filename,
        openSnippet: (code, lang) => {
          const aliases: Record<string, string> = {
            js: 'javascript',
            ts: 'typescript',
            sh: 'shell',
            bash: 'shell',
            py: 'python',
            md: 'markdown',
          };
          const normalized = aliases[lang] || lang;
          const extensions: Record<string, string> = {
            javascript: 'js',
            typescript: 'ts',
            shell: 'sh',
            python: 'py',
            html: 'html',
            css: 'css',
            json: 'json',
            markdown: 'md',
          };
          const filename = 'snippet.' + (extensions[normalized] || 'txt');
          setSnippet({ id: ++snippetId.current, source: code, filename });
          setSource(code);
          setLanguage(normalized);
          setFilename('snippet.' + (extensions[normalized] || 'txt'));
          setSelected('scratch');
          setOpen(true);
        },
        lastExercise,
        forget: (id) => {
          if (lastExercise === id) setLastExercise(null);
          if (selected === id) setSelected('scratch');
        },
        show: (id) => {
          if (id) {
            setSelected(id);
            if (id !== 'scratch') setLastExercise(id);
          }
          setOpen(true);
        },
        close: () => {
          setOpen(false);
          setFocused(false);
        },
        toggleFocus: () => setFocused((value) => !value),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function OpenIDEButton() {
  const ide = useCourseIDE();
  return (
    <button
      aria-expanded={ide.open}
      aria-controls="course-ide-panel"
      onClick={() => (ide.open ? ide.close() : ide.show())}
      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
    >
      <Code2 size={15} />
      {ide.open ? 'Hide IDE' : 'Open IDE'}
    </button>
  );
}
export function CourseIDEPanel({
  courseSlug,
  courseTitle,
  smallWindow,
  widthPercent,
}: {
  courseSlug: string;
  courseTitle: string;
  smallWindow: boolean;
  widthPercent?: number;
}) {
  const ide = useCourseIDE();
  const [visited, setVisited] = useState(false);
  const { source, setSource } = ide;
  useEffect(() => {
    if (ide.open && !ide.focused) {
      const timer = setTimeout(() => {
        focusTheiaHost();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [ide.open, ide.focused]);

  // Preserve previous behavior: mark the IDE as visited when opened
  useEffect(() => {
    if (ide.open) setVisited(true);
  }, [ide.open]);

  useEffect(() => {
    if (!ide.open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) ide.close();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [ide.open, ide.close]);
  return (
    <aside
      id="course-ide-panel"
      aria-label="Course IDE"
      style={
        !ide.focused && !smallWindow && ide.open && widthPercent
          ? { width: `${widthPercent}%` }
          : undefined
      }
      className={`${!ide.open ? 'hidden' : 'flex'} ${ide.focused || smallWindow ? 'min-w-0 flex-1' : widthPercent ? 'min-w-[320px] max-w-[80%]' : 'w-[52%] min-w-[380px] max-w-[900px]'} shrink-0 flex-col border-l border-border bg-background`}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border p-3">
        <div className="mr-auto min-w-0">
          {!ide.focused && (
            <>
              <h2 className="text-sm font-semibold">Course IDE</h2>
              <p className="truncate text-xs text-muted-foreground">
                {courseTitle}
              </p>
            </>
          )}
        </div>
        <button
          aria-label={ide.focused ? 'Exit IDE focus mode' : 'Focus IDE'}
          title={ide.focused ? 'Exit focus mode' : 'Focus mode'}
          onClick={ide.toggleFocus}
          className="rounded p-2 hover:bg-muted"
        >
          {ide.focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button
          aria-label="Close IDE"
          onClick={ide.close}
          className="rounded p-2 hover:bg-muted"
        >
          <X size={16} />
        </button>
      </header>
      {!ide.focused && ide.lastExercise && (
        <nav
          aria-label="IDE workspace"
          className="flex shrink-0 gap-2 border-b border-border bg-muted/40 p-2 text-xs"
        >
          <button
            aria-pressed={ide.selected === 'scratch'}
            onClick={() => ide.show('scratch')}
            className="rounded-lg px-3 py-1.5 hover:bg-muted aria-pressed:bg-background aria-pressed:shadow-sm"
          >
            Project IDE
          </button>
          <button
            aria-pressed={ide.selected === ide.lastExercise}
            onClick={() => ide.show(ide.lastExercise!)}
            className="rounded-lg px-3 py-1.5 hover:bg-muted aria-pressed:bg-background aria-pressed:shadow-sm"
          >
            Lesson exercise
          </button>
        </nav>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <div hidden={ide.selected !== 'scratch'} className="h-full">
          {visited && window.buildment.ide ? (
            <TheiaWorkspace
              active={ide.open && ide.selected === 'scratch'}
              focused={ide.focused}
              snippet={ide.snippet}
            />
          ) : (
            visited && (
              <div className="h-full p-3 overflow-y-auto">
                <Suspense fallback={<p role="status">Opening IDE…</p>}>
                  <Editor
                    blockId={`course:${courseSlug}`}
                    filename={ide.filename}
                    language={ide.language}
                    value={source}
                    onChange={setSource}
                    practice
                  />
                </Suspense>
              </div>
            )
          )}
        </div>
        <div
          ref={ide.setHost}
          className="h-full overflow-y-auto p-3"
          hidden={ide.selected === 'scratch'}
        />
      </div>
    </aside>
  );
}
export function IDEExercise({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const ide = useCourseIDE();
  const [visited, setVisited] = useState(false);
  const active = ide.selected === id;
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);
  const currentIDE = useRef(ide);
  currentIDE.current = ide;
  useEffect(
    () => () => {
      currentIDE.current.forget(id);
    },
    [id],
  );
  return (
    <>
      <section className="my-6 rounded-xl border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Code exercise
        </p>
        <p className="mt-2 font-medium">{title}</p>
        <button
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => ide.show(id)}
        >
          Open in IDE
        </button>
        <p className="mt-2 text-xs text-muted-foreground">
          Edit, run and check your code in the course workspace.
        </p>
      </section>
      {visited &&
        ide.host &&
        createPortal(<div hidden={!active}>{children}</div>, ide.host, id)}
    </>
  );
}
