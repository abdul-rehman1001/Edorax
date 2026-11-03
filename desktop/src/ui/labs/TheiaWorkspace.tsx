import { useEffect, useRef, useState } from 'react';
import { FolderOpen, FolderPlus, Code2 } from 'lucide-react';
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
  snippet,
}: {
  active: boolean;
  focused?: boolean;
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
    void api.importSnippet(snippet.source, snippet.filename).catch(report);
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
      className="flex h-full min-h-[400px] min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <div ref={host} className="min-h-0 flex-1" tabIndex={-1}>
        {!session && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-muted/40">
              <Code2 size={24} className="text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-semibold tracking-tight">
                Open your workspace
              </h3>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Create a new project or select an existing folder on your
                computer to launch the full IDE.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <button
                disabled={busy}
                onClick={() => void open(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <FolderPlus size={16} />
                Create a new project
              </button>
              <button
                disabled={busy}
                onClick={() => void open(false)}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
              >
                <FolderOpen size={16} />
                Select folder
              </button>
            </div>
            {snippet && (
              <p className="text-xs text-muted-foreground">
                Your lesson snippet will open automatically once you select a
                folder.
              </p>
            )}
            {(error || busy) && (
              <p
                role={error ? 'alert' : 'status'}
                className={`mt-2 text-xs ${error ? 'text-red-600' : 'text-muted-foreground'}`}
              >
                {error || 'Starting IDE workspace…'}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
