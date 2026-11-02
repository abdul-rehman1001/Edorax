import { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  FolderOpen,
  FolderPlus,
  Code2,
  Square,
  Terminal,
} from 'lucide-react';
import type { IDESession } from '../../domain/ide';
export type LessonSnippetRequest = {
  id: number;
  source: string;
  filename: string;
};

// Module-level ref so CourseIDE can call focusTheiaHost() without going through contextBridge
let _theiaHost: HTMLDivElement | null = null;
export function focusTheiaHost() {
  _theiaHost?.focus();
}

export function TheiaWorkspace({
  active,
  focused,
  snippet,
}: {
  active: boolean;
  focused: boolean;
  snippet: LessonSnippetRequest | null;
}) {
  const api = window.buildment.ide!;
  const host = useRef<HTMLDivElement>(null);

  // Keep the module-level ref in sync with the DOM ref
  useEffect(() => {
    _theiaHost = host.current;
    return () => {
      _theiaHost = null;
    };
  }, []);
  const imported = useRef<number | null>(null);
  const [session, setSession] = useState<IDESession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const report = (error: unknown) =>
    setError(
      (error instanceof Error ? error.message : String(error)).replace(
        /^(Error: )?Error invoking remote method '[^']+': (Error: )?/,
        '',
      ),
    );

  useEffect(() => {
    let alive = true;
    const check = () => {
      void api
        .status()
        .then((value) => {
          if (!alive) return;
          setSession((prev) => {
            if (prev?.folder === value?.folder && prev?.url === value?.url)
              return prev;
            return value;
          });
        })
        .catch((error) => {
          if (alive) report(error);
        });
    };
    check();
    const timer = window.setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [api]);

  useEffect(() => {
    return () => {
      void api.bounds(null);
    };
  }, [api]);

  useEffect(() => {
    const update = () => {
      const rect = host.current?.getBoundingClientRect();
      if (
        !active ||
        busy ||
        !session ||
        !rect ||
        !host.current?.getClientRects().length
      ) {
        void api.bounds(null);
        return;
      }
      void api
        .bounds({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        })
        .catch(report);
    };
    const observer = new ResizeObserver(update);
    if (host.current) observer.observe(host.current);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [api, active, session, busy]);
  useEffect(() => {
    if (
      !active ||
      !session ||
      busy ||
      !snippet ||
      imported.current === snippet.id
    )
      return;
    imported.current = snippet.id;
    setError('');
    void api
      .importSnippet(snippet.source, snippet.filename)
      .then(() => setMessage('Lesson snippet added as a new project file.'))
      .catch(report);
  }, [api, active, session, snippet, busy]);
  useEffect(() => {
    if (!active || !session) return;
    void api.revealExplorer().catch(report);
  }, [api, active, session]);
  async function open(create: boolean) {
    if (
      session &&
      !window.confirm(
        'Switch projects? Save any unsaved files in the IDE first.',
      )
    )
      return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await api.open(create);
      if (next) {
        setSession(next);
        imported.current = null;
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Project IDE"
      className="flex h-full min-h-[400px] min-w-0 flex-col overflow-hidden bg-background"
    >
      {!focused && (
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-3 text-xs">
          <span
            className="mr-auto flex min-w-0 items-center gap-2 font-medium"
            title={session?.folder}
          >
            <span
              className={`size-2 rounded-full ${session ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
            />
            {session ? session.folder.split(/[/\\]/).pop() : 'Local project'}
          </span>
          <button
            disabled={busy}
            onClick={() => void open(true)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 hover:bg-muted"
          >
            <FolderPlus size={14} />
            New project
          </button>
          <button
            disabled={busy}
            onClick={() => void open(false)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 hover:bg-muted"
          >
            <FolderOpen size={14} />
            Open folder
          </button>
          {session && (
            <button
              disabled={busy}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                void api
                  .openWithMenu({ x: rect.left, y: rect.bottom })
                  .catch(report);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 hover:bg-muted"
            >
              <ExternalLink size={14} />
              Open
            </button>
          )}
          {session && (
            <button
              disabled={busy}
              onClick={() => void api.newTerminal().catch(report)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 hover:bg-muted"
            >
              <Terminal size={14} />
              Terminal
            </button>
          )}
          {session && (
            <button
              aria-label="Close project"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    'Close this project? Save unsaved files first.',
                  )
                )
                  void api
                    .stop()
                    .then(() => setSession(null))
                    .catch(report);
              }}
              className="rounded-lg p-2 hover:bg-muted"
            >
              <Square size={14} />
            </button>
          )}
        </header>
      )}
      {!focused && (error || message || busy) && (
        <p
          role={error ? 'alert' : 'status'}
          className={`shrink-0 border-b border-border px-4 py-2 text-xs ${error ? 'text-red-600' : 'text-muted-foreground'}`}
        >
          {error || (busy ? 'Opening your local workspace…' : message)}
        </p>
      )}
      <div ref={host} className="min-h-0 flex-1" tabIndex={-1}>
        {!session && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <Code2 size={30} className="text-muted-foreground" />
            <h3 className="text-xl font-medium tracking-tight">
              A project of your own
            </h3>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              Create a project or open a folder on your computer. Edit files,
              search your code, and use the terminal without leaving your
              lesson.
            </p>
            {snippet && (
              <p className="text-xs text-muted-foreground">
                Your lesson snippet will open after you choose a project.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
