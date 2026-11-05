import type { ReactNode } from "react";
import { Info, SlidersHorizontal } from "lucide-react";
import { Glyph } from "./Glyph";
import { ReplicaMatrix } from "./ReplicaMatrix";
import { loadState, type LabRole } from "./bench";

/** How the learner's design stands against the reference solution (the blueprint ghost). */
export interface NodeGhost {
  state: "matched" | "missing" | "diff";
  /** Short notes for a pill on an under-configured part: "Hit rate lower". */
  notes: string[];
}

export interface NodeCardProps {
  /** The part's name in the chosen naming mode. */
  name: string;
  /** Under the name: the size and count, or a short role word. */
  subtitle: string;
  role: LabRole;
  /** A CSS colour for the spine and ports, usually `var(--lab-compute)` and friends. */
  color: string;
  /** Machines running now (after any loss). */
  units?: number;
  /** How busy, 0 to 1 and beyond. Null when it does not apply (not linked, managed, down). */
  load?: number | null;
  /** One machine of a fleet is down and the others cover. */
  lost?: boolean;
  /** The whole part is down. */
  down?: boolean;
  /** Armed to break: it goes down when the learner presses Run, not before. */
  armed?: boolean;
  /** Connected into the request path. */
  linked?: boolean;
  /** A managed service that grows by itself. */
  managed?: boolean;
  selected?: boolean;
  /** Dimmed because something else is in focus. */
  dimmed?: boolean;
  /** The Tune key is open. */
  open?: boolean;
  /** Reference solution: the key explains the part instead of opening settings. */
  readOnly?: boolean;
  /** Shake once: a fault is playing on this part. */
  shaking?: boolean;
  ghost?: NodeGhost;
  /** A line under the meter, such as the model's note. */
  note?: string;
  /** Replaces the meter, for the client: "where requests start". */
  caption?: string;
  /** Tooltip for the whole card. */
  title?: string;
  /** Attribute for the Tune key, so a board can find it again after closing the cassette. */
  tuneFor?: string;
  tuneDisabled?: boolean;
  onTune?: () => void;
  /** Ports (React Flow handles on the board, nothing in a specimen). */
  children?: ReactNode;
}

/**
 * A part drawn as a patch-bay module: a role-colour spine, a schematic glyph, a name,
 * a replica core matrix for how busy it is, text tags for its state, and a Tune key
 * that appears on hover or focus (always on touch screens).
 */
export function NodeCard(p: NodeCardProps) {
  const { down = false, linked = true, selected = false, units = 1, load = null, lost = false, open = false } = p;
  const state = load != null ? loadState(load) : null;
  const ghost = p.ghost;
  const armed = Boolean(p.armed) && !down;
  const border = down
    ? "border-[color:var(--lab-down)]"
    : armed
      ? "border-dashed border-[color:var(--lab-down)]"
    : selected
      ? "border-[color:var(--lab-accent)] ring-[3px] ring-[color:var(--lab-accent)]/25"
      : ghost?.state === "missing"
        ? "border-dashed border-[color:var(--lab-accent)]"
        : ghost?.state === "matched"
          ? "border-[color:var(--lab-ok)]"
          : state?.key === "hot"
            ? "border-[color:var(--lab-hot)]"
            : !linked
              ? "border-dashed border-[color:var(--lab-ink2)]/60"
              : "border-[color:var(--lab-grid)]";
  return (
    <div
      title={p.title}
      className={`group/node relative min-h-[104px] w-[176px] rounded-[6px] border-[1.5px] bg-card py-2 pl-[13px] pr-2.5 text-card-foreground shadow-[0_2px_0_0_var(--lab-edge-shadow)] transition-[box-shadow,opacity,transform] duration-200 hover:-translate-y-px hover:shadow-[0_4px_0_0_var(--lab-edge-shadow)] ${border} ${p.dimmed ? "opacity-40" : ""} ${p.shaking ? "lab-shake" : ""} ${ghost?.state === "missing" ? "bg-[color:var(--lab-accent)]/10" : ""}`}
    >
      <span aria-hidden className="absolute bottom-0 left-0 top-0 w-[3px] rounded-l-[4px]" style={{ backgroundColor: down ? "var(--lab-down)" : p.color }} />
      {down ? <span aria-hidden className="lab-hatch absolute inset-x-[3px] top-0 h-[5px] opacity-70" /> : null}

      {p.onTune ? (
        <button
          type="button"
          data-settings-for={p.tuneFor}
          aria-label={p.readOnly ? `Why ${p.name} is in the solution` : `Settings for ${p.name}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? "lab-settings-drawer" : undefined}
          disabled={p.tuneDisabled}
          onClick={(e) => { e.stopPropagation(); p.onTune?.(); }}
          className={`nodrag nopan lab-mono absolute -top-5 right-3 z-10 flex h-5 items-center gap-1 rounded-t-[5px] border-x border-t border-[color:var(--lab-grid)] bg-[color:var(--lab-inspector)] px-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-100 transition-opacity hover:bg-[color:var(--lab-inspector-2)] focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--lab-accent)] disabled:hidden group-focus-within/node:opacity-100 group-hover/node:opacity-100 [@media(hover:none)]:opacity-100 ${open || selected ? "opacity-100" : "opacity-0"}`}
        >
          {p.readOnly ? <Info className="h-3 w-3" aria-hidden /> : <SlidersHorizontal className="h-3 w-3" aria-hidden />}
          {p.readOnly ? "Why" : "Tune"}
        </button>
      ) : null}

      {p.children}

      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-[color:var(--lab-recessed)]" style={{ color: p.color }}>
          <Glyph role={p.role} />
        </span>
        <div className="min-w-0 flex-1">
          <div title={p.name} className={`lab-display line-clamp-2 text-[13.5px] font-semibold leading-tight ${down ? "line-through" : ""}`}>{p.name}</div>
          <div className="lab-mono truncate text-[9.5px] uppercase tracking-wide text-muted-foreground">{p.subtitle}</div>
        </div>
      </div>

      <div className="mt-2 min-h-[20px]">
        {down ? (
          <span title="This part is down (offline). Requests through it fail." className="lab-mono inline-block -rotate-2 rounded-[3px] border-2 border-[color:var(--lab-down)] px-1.5 py-px text-[10px] font-bold uppercase tracking-widest text-[color:var(--lab-down-ink)]">Down</span>
        ) : !linked ? (
          <span className="text-[10px] text-muted-foreground">Not connected: link it into the path</span>
        ) : load != null ? (
          <div className="flex items-center gap-2">
            <ReplicaMatrix units={units} load={load} lost={lost} />
            <span className="lab-mono shrink-0 text-[11px] font-bold tabular-nums" style={{ color: state!.ink }}>{Math.round(load * 100)}%</span>
          </div>
        ) : p.caption ? (
          <span className="lab-mono text-[10px] uppercase tracking-wide text-muted-foreground">{p.caption}</span>
        ) : p.managed ? (
          <span className="lab-mono text-[10px] uppercase tracking-wide text-muted-foreground">grows by itself</span>
        ) : null}
      </div>
      <div className="mt-1 flex min-h-[13px] items-center gap-1.5">
        {state?.tag ? <span title={state.hint} className="lab-mono rounded-[3px] px-1 text-[9px] font-bold tracking-wider text-white" style={{ backgroundColor: state.key === "hot" ? "var(--lab-hot-ink)" : "var(--lab-warm-ink)" }}>{state.tag}</span> : null}
        {armed ? <span title="This part breaks when you press Run tests." className="lab-mono rounded-[3px] border border-dashed border-[color:var(--lab-down)] px-1 text-[9px] font-bold tracking-wider text-[color:var(--lab-down-ink)]" data-testid="armed-tag">ARMED</span> : null}
        {lost ? <span title="One machine is down. The others take over its work (failover)." className="lab-mono rounded-[3px] bg-[color:var(--lab-ok-ink)] px-1 text-[9px] font-bold tracking-wider text-white">1 DOWN, OTHERS COVER</span> : null}
        {ghost?.state === "missing" ? <span className="lab-mono rounded-[3px] bg-[color:var(--lab-accent)] px-1 text-[9px] font-bold tracking-wider text-[color:var(--lab-on-accent)]">MISSING IN YOUR DESIGN</span> : null}
        {ghost?.state === "matched" ? <span className="lab-mono text-[10px] font-bold text-[color:var(--lab-ok-ink)]">✓ matches yours</span> : null}
        {!down && !armed && linked && !state?.tag && !lost && !ghost && p.note ? <span className="truncate text-[10px] text-muted-foreground" title={p.note}>{p.note}</span> : null}
      </div>
      {ghost?.state === "diff" ? (
        <div className="lab-mono absolute -bottom-2.5 left-2 max-w-[160px] truncate rounded-[4px] border border-[color:var(--lab-warm)] bg-[color:var(--lab-warm-ink)] px-1.5 py-px text-[9px] font-bold text-white" title={ghost.notes.join("; ")}>
          {ghost.notes[0]}{ghost.notes.length > 1 ? ` +${ghost.notes.length - 1}` : ""}
        </div>
      ) : null}
    </div>
  );
}
