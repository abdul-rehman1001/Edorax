"use client";

// The settings cassette. It opens from the Tune key that appears on a component when
// you hover or focus it, never by default, one at a time. On a wide board it grows
// out beside the component it belongs to; on a narrow one (a phone) it is a deck
// docked along the bottom while the component is panned into view above it. The
// frame and the tactile controls are shared UI (packages/learning-ui, lab-ui); this
// file only decides what goes inside, from the lab catalog.

import type { ComponentProps, CSSProperties } from "react";
import { Trash2 } from "lucide-react";
import {
  CASSETTE_FOCUS, Cassette as SharedCassette, CassetteReadout, CassetteSection, CassetteSlider, CassetteSwitch, SegmentedGroup, Stepper, anchorStyle,
} from "../lab-ui";
import type { ComponentKind, PropertyDef, PropertyGroup } from "./catalog";
import { COMPONENT_CATALOG, roleOf, sizesFor } from "./catalog";
import type { NodeConfig } from "./hld-board-model";
import type { TierLoad } from "./tiered-architecture";
import { colorOf } from "./board-style";
import { AWS_PARTS, AWS_PROPS, sizeLabel } from "./aws-names";
import { useNames } from "./names-context";

export { anchorStyle };

const GROUP_ORDER: PropertyGroup[] = ["Capacity", "Scaling", "Resilience", "Behaviour"];
const GROUP_LABEL: Record<PropertyGroup, string> = { Capacity: "Size and count", Scaling: "Grows by itself", Resilience: "Stays up", Behaviour: "How it acts" };
const FAMILY_NAME: Record<string, string> = { general: "balanced", compute: "CPU", memory: "memory" };
const FAMILY_TITLE: Record<string, string> = { general: "A balance of CPU and memory", compute: "More CPU for its memory", memory: "More memory for its CPU" };
const SCALING_FIELDS = new Set(["minCount", "maxCount", "targetUtil"]);

/** Plain words for what a cache did with the reads it was asked. */
export function cacheSentence(s: { hitRate: number; reads: number; hits: number; misses: number }): string {
  const n = (v: number) => Math.round(v).toLocaleString();
  return `Asked ${n(s.reads)}/s. Answered itself ${n(s.hits)}/s (${Math.round(s.hitRate * 100)}% hits). Went on to the database ${n(s.misses)}/s. A cache hit means the database is never asked.`;
}

/** The shared cassette frame, coloured and glyphed from a component kind. */
export function Cassette({ kind, ...rest }: Omit<ComponentProps<typeof SharedCassette>, "role" | "color"> & { kind: ComponentKind }) {
  return <SharedCassette role={roleOf(kind)} color={colorOf(kind)} {...rest} />;
}

/** One configurable property as a tactile control: segmented sizes, steppers, detent sliders, switches. */
function PropertyField({
  kind, p, value, onChange,
}: {
  kind: ComponentKind;
  p: PropertyDef;
  value: number | string | undefined;
  onChange: (key: string, v: number | string) => void;
}) {
  const { mode } = useNames();
  const v = value ?? p.default;
  const aws = AWS_PROPS[kind]?.[p.id];
  const label = aws && mode === "aws" ? aws.label : p.label;
  const help = aws && mode === "aws" ? aws.meaning : p.help;
  const row = "mb-2.5";
  const head = <div className="mb-1 flex items-center justify-between text-[12px] text-slate-200" title={help}>{label}</div>;
  const note = help && mode === "aws" ? <div className="mt-0.5 text-[10.5px] leading-snug text-slate-300">{help}</div> : null;

  if (p.type === "size") {
    const tiers = sizesFor(p.sizeSet ?? "generic");
    const current = tiers.find((t) => t.id === String(v)) ?? tiers[0]!;
    const families = [...new Set(tiers.map((t) => t.family))];
    const inFamily = tiers.filter((t) => t.family === current.family);
    const info = sizeLabel(kind, current.id, mode);
    const short = (id: string) => id.replace(/^(compute|memory|general)-/, "");
    return (
      <div className={row}>
        {head}
        {families.length > 1 ? (
          <div className="mb-1">
            <SegmentedGroup
              label="Family"
              options={families.map((f) => ({ id: f, label: FAMILY_NAME[f] ?? f, title: FAMILY_TITLE[f] }))}
              value={current.family}
              onChange={(f) => onChange(p.id, (tiers.find((t) => t.family === f && t.vcpu === current.vcpu) ?? tiers.find((t) => t.family === f)!).id)}
            />
          </div>
        ) : null}
        <SegmentedGroup
          label="Size"
          options={inFamily.map((t) => ({
            id: t.id,
            label: short(t.id) === "small" ? "S" : short(t.id) === "medium" ? "M" : short(t.id) === "large" ? "L" : short(t.id) === "xlarge" ? "XL" : t.id,
            title: `${t.vcpu} CPU cores, ${t.memoryGb} GB memory, $${t.pricePerHour}/h (illustrative)`,
          }))}
          value={current.id}
          onChange={(id) => onChange(p.id, id)}
        />
        <div className="lab-mono mt-1 text-[11px] font-bold text-slate-100" data-testid="size-label">{info.label}</div>
        <div className="text-[10.5px] leading-snug text-slate-300">{info.detail || `${current.vcpu} CPU cores, ${current.memoryGb} GB memory. ${current.capacityRule}`}</div>
      </div>
    );
  }
  if (p.type === "enum") {
    return (
      <div className={row}>
        {head}
        <SegmentedGroup label={label} options={(p.options ?? []).map((o) => ({ id: o, label: o }))} value={String(v)} onChange={(o) => onChange(p.id, o)} />
        {note}
      </div>
    );
  }
  if (p.type === "toggle") {
    return (
      <div className={row}>
        <div className="flex items-center justify-between gap-2 text-[12px] text-slate-200" title={help}>
          <span>{label}</span>
          <CassetteSwitch label={label} on={Number(v) > 0} onChange={(on) => onChange(p.id, on ? 1 : 0)} />
        </div>
        {note}
      </div>
    );
  }
  if (p.type === "ratio") {
    return (
      <div className={row}>
        <div className="mb-1 flex items-center justify-between text-[12px] text-slate-200" title={help}>
          <span>{label}</span>
          <span className="lab-mono font-bold text-white">{Math.round(Number(v) * 100)}%</span>
        </div>
        <CassetteSlider label={label} value={Number(v)} onChange={(n) => onChange(p.id, n)} />
        {note}
      </div>
    );
  }
  return (
    <div className={row}>
      <div className="flex items-center justify-between gap-2 text-[12px] text-slate-200" title={help}>
        <span>{label}</span>
        <Stepper label={label} value={Number(v)} min={p.min} max={p.max} step={p.step} onChange={(n) => onChange(p.id, n)} />
      </div>
      {note}
    </div>
  );
}

export function SettingsDrawer({
  id, kind, cfg, tier, anchor, floating, armed = false, onChange, onToggleDown, onRemove, onClose,
}: {
  id: string;
  kind: ComponentKind;
  cfg: NodeConfig;
  tier?: TierLoad;
  anchor?: CSSProperties;
  floating?: boolean;
  /** Armed to break on the next run. Break it only arms a part; Run tests is what breaks it. */
  armed?: boolean;
  onChange: (key: string, value: number | string) => void;
  /** Arms or disarms a working part, or restores a part that is down. */
  onToggleDown: () => void;
  onRemove: () => void;
  onClose?: () => void;
}) {
  const def = COMPONENT_CATALOG[kind];
  const { mode, nameOf } = useNames();
  const part = mode === "aws" ? AWS_PARTS[kind] : undefined;
  const busy = tier ? Math.round(tier.utilisation * 100) : 0;
  const tone = !tier || tier.utilisation < 0.7 ? "ok" : tier.utilisation < 0.9 ? "warm" : "hot";

  return (
    <Cassette
      id={id}
      kind={kind}
      label={`Settings for ${nameOf(kind)}`}
      title={nameOf(kind)}
      subtitle={mode === "aws" ? def.label : def.vendor}
      anchor={anchor}
      floating={floating}
      onClose={onClose}
    >
      {part ? <p className="mb-2 text-[11px] leading-snug text-slate-300" data-testid="aws-meaning">{part.meaning}</p> : null}

      {armed && !cfg.down ? (
        <div className="lab-mono mb-2.5 rounded-[5px] border border-dashed border-red-400/70 bg-black/30 px-2 py-1.5 text-[11px] font-bold leading-snug text-red-200" data-testid="armed-note">Armed. It breaks when you press Run tests.</div>
      ) : null}

      {cfg.down ? (
        <div className="lab-mono mb-2.5 rounded-[5px] bg-black/40 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">Down. Requests through it fail.</div>
      ) : tier && tier.reachable ? (
        <CassetteReadout tone={tone} items={[{ label: "Can serve", value: tier.managed ? "grows itself" : `${Math.round(tier.capacity).toLocaleString()}/s`, tone: "plain" }, { label: "How busy", value: tier.managed ? "n/a" : `${busy}%`, tone: "last" }, { label: "Cost", value: `$${tier.cost.toFixed(2)}/h`, tone: "plain" }]} />
      ) : (
        <div className="lab-mono mb-2.5 rounded-[5px] bg-black/40 px-2 py-1.5 text-[11px] text-slate-300">Not linked into the request path yet.</div>
      )}

      {tier?.cacheStats && !cfg.down ? (
        <div className="lab-mono mb-2.5 rounded-[5px] bg-black/30 px-2 py-1.5 text-[10.5px] leading-snug text-slate-200" data-testid="cache-stats">
          <div className="flex justify-between gap-3"><span>asked of it</span><b>{Math.round(tier.cacheStats.reads).toLocaleString()}/s</b></div>
          <div className="flex justify-between gap-3 text-emerald-300"><span>● found here (hit)</span><b>{Math.round(tier.cacheStats.hits).toLocaleString()}/s</b></div>
          <div className="flex justify-between gap-3 text-amber-300"><span>◇ not here (miss)</span><b>{Math.round(tier.cacheStats.misses).toLocaleString()}/s</b></div>
          <div className="mt-0.5 font-sans text-[10.5px] text-slate-300">A cache hit means the database is never asked.</div>
        </div>
      ) : null}

      {GROUP_ORDER.map((group) => {
        const fields = def.properties.filter(
          (p) => (p.group ?? "Capacity") === group && (!SCALING_FIELDS.has(p.id) || Number(cfg.autoscale ?? 0) > 0),
        );
        if (fields.length === 0) return null;
        return (
          <CassetteSection key={group} title={GROUP_LABEL[group]}>
            {fields.map((p) => <PropertyField key={p.id} kind={kind} p={p} value={cfg[p.id]} onChange={onChange} />)}
          </CassetteSection>
        );
      })}

      {part ? <p className="mb-2 mt-1 rounded-[5px] border border-dashed border-slate-500 px-2 py-1 text-[10.5px] leading-snug text-slate-200" data-testid="aws-remember"><b className="lab-mono text-[9px] uppercase tracking-wider text-slate-300">Remember </b>{part.remember}</p> : null}

      <div className="mt-2 flex gap-2">
        <button type="button" onClick={onToggleDown} aria-pressed={Boolean(cfg.down) || armed} data-testid="break-button"
          title={cfg.down ? "Bring this part back up" : armed ? "Keep this part working on the next run" : "Arm this part to break on the next run. Nothing happens until you press Run tests."}
          className={`lab-mono flex-1 rounded-[5px] border-2 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide ${CASSETTE_FOCUS} ${cfg.down ? "border-emerald-400 text-emerald-300 hover:bg-emerald-400/10" : armed ? "border-dashed border-red-400 bg-red-400/15 text-red-200 hover:bg-red-400/25" : "border-red-400 text-red-300 hover:bg-red-400/10"}`}>
          {cfg.down ? "Restore" : armed ? "Disarm" : "Break it"}
        </button>
        {kind !== "client" ? (
          <button type="button" onClick={onRemove} aria-label={`Remove ${nameOf(kind)}`}
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-[5px] border border-slate-500 text-slate-300 hover:border-red-400 hover:text-red-300 ${CASSETTE_FOCUS}`}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </Cassette>
  );
}
