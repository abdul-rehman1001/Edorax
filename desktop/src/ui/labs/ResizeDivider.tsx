import { useCallback, useEffect, useRef } from 'react';

const STORAGE_KEY = 'course-ide-pane-width';
const MIN_LEFT = 280;   // min article pane width (px)
const MIN_RIGHT = 320;  // min IDE pane width (px)

/** Read persisted IDE pane width (percentage 20–80, default 52). */
export function loadPaneWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const value = Number(raw);
      if (value >= 20 && value <= 80) return value;
    }
  } catch { /* ignore */ }
  return 52;
}

/** Persist IDE pane width percentage. */
function savePaneWidth(percent: number) {
  try { localStorage.setItem(STORAGE_KEY, String(Math.round(percent))); } catch { /* ignore */ }
}

/**
 * A vertical draggable divider between the course article pane and the IDE panel.
 * `onResize` receives the new IDE‑pane width as a percentage of the parent container.
 */
export function ResizeDivider({ onResize }: { onResize: (percent: number) => void }) {
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

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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
  }, [onResize]);

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
    const percent = Math.max(20, Math.min(80, (ideWidth / parentRect.width) * 100));
    savePaneWidth(percent);
  }, []);

  // Clean up cursor style if component unmounts while dragging
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize course and IDE panes"
      className="group relative z-10 flex w-0 shrink-0 cursor-ew-resize items-center justify-center"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Visible handle line */}
      <div className="absolute inset-y-0 -left-[2px] -right-[2px] w-[5px]" />
      <div className="pointer-events-none absolute inset-y-0 w-[3px] rounded-full bg-border opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100 group-active:bg-primary" />
    </div>
  );
}

