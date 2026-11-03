import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'course-ide-pane-width';
const MIN_LEFT = 280; // min article pane width (px)
const MIN_RIGHT = 320; // min IDE pane width (px)

/** Read persisted IDE pane width (percentage 20–80, default 52). */
export function loadPaneWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value = Number(raw);
      if (value >= 20 && value <= 80) return value;
    }
  } catch {
    /* ignore */
  }
  return 52;
}

/** Persist IDE pane width percentage. */
function savePaneWidth(percent: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.round(percent)));
  } catch {
    /* ignore */
  }
}

/**
 * A vertical draggable divider between the course article pane and the IDE panel.
 * `onResize` receives the new IDE‑pane width as a percentage of the parent container.
 */
export function ResizeDivider({
  onResize,
}: {
  onResize: (percent: number) => void;
}) {
  const dragging = useRef(false);
  const parentRef = useRef<HTMLElement | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    parentRef.current = (e.currentTarget as HTMLElement).parentElement;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current || !parentRef.current) return;
      const parent = parentRef.current;
      const parentRect = parent.getBoundingClientRect();
      const parentWidth = parentRect.width;
      const relativeX = e.clientX - parentRect.left;

      // IDE width = distance from cursor to right edge
      let ideWidth = parentWidth - relativeX;

      // Enforce minimums
      if (ideWidth < MIN_RIGHT) ideWidth = MIN_RIGHT;
      if (parentWidth - ideWidth < MIN_LEFT) ideWidth = parentWidth - MIN_LEFT;

      const percent = (ideWidth / parentWidth) * 100;
      const clamped = Math.max(20, Math.min(80, percent));
      onResize(clamped);
    },
    [onResize],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !parentRef.current) return;
    dragging.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Persist
    const parent = parentRef.current;
    const parentRect = parent.getBoundingClientRect();
    const ideWidth = parentRect.width - (e.clientX - parentRect.left);
    const percent = Math.max(
      20,
      Math.min(80, (ideWidth / parentRect.width) * 100),
    );
    savePaneWidth(percent);
  }, []);

  // Clean up cursor style if component unmounts while dragging
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const onDoubleClick = useCallback(() => {
    onResize(52);
    savePaneWidth(52);
  }, [onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize course and IDE panes"
      title="Drag left or right to resize split view (double-click to reset)"
      className="group relative z-20 flex w-3 shrink-0 cursor-col-resize select-none items-center justify-center border-x border-border/80 bg-muted/40 transition-colors hover:bg-primary/10 active:bg-primary/20"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      {/* Continuous center track line */}
      <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-border transition-colors group-hover:bg-primary/60 group-active:bg-primary" />
      {/* Always-visible center grab pill so users immediately see the split handle */}
      <div className="pointer-events-none relative z-10 flex h-12 w-2.5 flex-col items-center justify-center gap-1 rounded-full border border-border bg-card shadow-sm transition-all group-hover:scale-110 group-hover:border-primary group-active:scale-110 group-active:border-primary group-active:bg-primary/10">
        <span className="size-1 rounded-full bg-muted-foreground/70 group-hover:bg-primary" />
        <span className="size-1 rounded-full bg-muted-foreground/70 group-hover:bg-primary" />
        <span className="size-1 rounded-full bg-muted-foreground/70 group-hover:bg-primary" />
      </div>
    </div>
  );
}
