"use client";

// The lab component gallery: every presentational piece of the lab on its own, in
// every state, in both themes and both naming modes. A dev-only specimen sheet
// (route /zz-lab-gallery) and the reference for anyone reusing the shared pieces in
// packages/learning-ui (lab-ui). It uses only the shared components plus the
// catalog-bound cassette, with made-up numbers.

import type { ComponentProps, ReactNode } from "react";
import {
  BOARD_CSS, CheckSlot, FAMILY_LABEL, LAB_FAMILIES, NodeCard, PhaseTimeline, ReplicaMatrix, WireTag, familyColor, roleColor,
  type CheckView, type LabRole,
} from "../lab-ui";
import { COMPONENT_CATALOG, kindsInFamily, roleOf, type ComponentKind } from "./catalog";
import type { NodeConfig } from "./hld-board-model";
import type { TierLoad } from "./tiered-architecture";
import { KindGlyph } from "./Glyph";
import { ConfirmBar, PartExplainer } from "./SolutionPanel";
import { SettingsDrawer } from "./SettingsDrawer";
import { StaticNames } from "./names-context";
import { AWS_PARTS, awsInstance, instanceMeaning, partName, type NameMode } from "./aws-names";
import { colorOf, ROLE_LABEL, tint } from "./board-style";
import type { SolutionDef } from "./types";

const noop = () => undefined;

function Specimen({ title, note, children, wide = false }: { title: string; note?: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`min-w-0 rounded-[8px] border-[1.5px] border-border bg-[color:var(--lab-canvas)] p-3 ${wide ? "col-span-full" : ""}`}>
      <figcaption className="mb-2">
        <div className="lab-display text-[13px] font-semibold text-foreground">{title}</div>
        {note ? <div className="text-[11.5px] leading-snug text-muted-foreground">{note}</div> : null}
      </figcaption>
      <div className="flex flex-wrap items-start gap-4 pt-5">{children}</div>
    </figure>
  );
}

const HLD_KINDS = kindsInFamily("hld");
const CORE: ComponentKind[] = ["client", "load-balancer", "app-server", "cache", "database", "queue", "worker"];

function tierFor(kind: ComponentKind, over: Partial<TierLoad> = {}): TierLoad {
  return { id: kind, kind, capacity: 4800, utilisation: 0.62, down: false, reachable: true, units: 3, managed: false, cost: 0.36, waitMs: 6, ...over };
}
function cfgFor(kind: ComponentKind, over: NodeConfig = {}): NodeConfig {
  const cfg: NodeConfig = {};
  for (const p of COMPONENT_CATALOG[kind].properties) cfg[p.id] = p.default;
  return { ...cfg, ...over };
}

function Node({ kind, mode, ...rest }: { kind: ComponentKind; mode: NameMode } & Partial<ComponentProps<typeof NodeCard>>) {
  const size = kind === "client" || kind === "queue" ? ROLE_LABEL[roleOf(kind)] : mode === "aws" ? "c6i.large x3" : "compute-small x3";
  return (
    <NodeCard
      name={partName(kind, mode)}
      subtitle={rest.subtitle ?? size}
      role={roleOf(kind)}
      color={colorOf(kind)}
      units={3}
      load={kind === "client" || kind === "queue" ? null : 0.42}
      caption={kind === "client" ? "where requests start" : kind === "queue" ? "grows by itself" : undefined}
      {...rest}
    />
  );
}

const SAMPLE_CHECKS: CheckView[] = [
  { id: "a", label: "Shortening works", pass: true, measured: "Client > App server > Database", target: "a new link can be saved" },
  { id: "b", label: "Slowest 1 in 100 redirects is fast enough (p99)", pass: true, measured: "58 ms", target: "at most 65 ms" },
  { id: "c", label: "Everyone is still served when the cache dies", pass: false, measured: "80.6%", target: "at least 99.9%", reason: "Database is 124% busy while the cache dies, so it cannot serve the whole load. Add machines, read-only copies or a cache in front of it." },
  { id: "d", label: "Cost per hour", pass: true, measured: "$2.39/h", target: "at most $2.50/h" },
];

const SAMPLE_SOLUTION: SolutionDef["parts"][string] = {
  why: "At a 95% hit rate the cache answers 2,850 of the 3,000 lookups a second itself. A cache hit (the answer was there) means the database is never asked.",
  checks: ["p99", "cache-dies"],
  without: "With no cache the database does all 3,000 lookups, is 62% busy, and the slowest 1 in 100 takes 71 ms, over the 65 ms target.",
};

function Sheet({ mode }: { mode: NameMode }) {
  return (
    <StaticNames mode={mode}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Specimen title="The six colour families" note="A link and a part's spine use the colour of its family, so colour tells you what kind of part you are looking at." wide>
          {LAB_FAMILIES.map((f) => (
            <div key={f} className="flex items-center gap-2 text-[12px]">
              <span aria-hidden className="inline-block h-3 w-8 rounded-[2px]" style={{ backgroundColor: familyColor(f) }} />
              {FAMILY_LABEL[f]}
            </div>
          ))}
        </Specimen>

        <Specimen title="A part in every state" note="Left to right, top to bottom: at rest, selected (the Tune key shows), getting busy, nearly full, down, one machine down and the others cover, not connected, grows by itself." wide>
          <Node kind="app-server" mode={mode} />
          <Node kind="app-server" mode={mode} selected />
          <Node kind="app-server" mode={mode} load={0.78} />
          <Node kind="app-server" mode={mode} load={0.96} />
          <Node kind="app-server" mode={mode} down />
          <Node kind="app-server" mode={mode} units={2} load={0.63} lost />
          <Node kind="app-server" mode={mode} linked={false} load={null} />
          <Node kind="queue" mode={mode} managed />
        </Specimen>

        <Specimen title="Tune key and Why key" note="On the board the key appears when you hover or focus a part. Here it is held open. The Why key is the same key in the reference solution." wide>
          <Node kind="cache" mode={mode} selected onTune={noop} tuneFor="x" open subtitle={mode === "aws" ? "cache.r6g.large x1" : "memory-small x1"} load={0.1} units={1} />
          <Node kind="cache" mode={mode} selected onTune={noop} tuneFor="y" readOnly subtitle={mode === "aws" ? "cache.r6g.large x1" : "memory-small x1"} load={0.1} units={1} />
        </Specimen>

        <Specimen title="Every kind of part" note="The same module for each part the lab can use. Each has its own schematic glyph." wide>
          {HLD_KINDS.map((k) => (
            <Node key={k} kind={k} mode={mode} load={k === "client" ? null : 0.35} subtitle={ROLE_LABEL[roleOf(k)]} />
          ))}
        </Specimen>

        <Specimen title="The glyphs, drawn small" note="Eighteen units, square line ends, a faint fill and small terminal squares.">
          {(["client", "dns", "cdn", "firewall", "limiter", "balancer", "gateway", "compute", "function", "worker", "cache", "database", "nosql", "search", "queue", "stream", "storage"] as LabRole[]).map((r) => (
            <span key={r} className="flex h-9 w-9 items-center justify-center rounded-[5px] bg-[color:var(--lab-recessed)]" style={{ color: roleColor(r) }} title={r}>
              <KindGlyph kind={(HLD_KINDS.find((k) => roleOf(k) === r) ?? "client") as ComponentKind} size={22} />
            </span>
          ))}
        </Specimen>

        <Specimen title="Replica core matrix" note="One cell per machine. Three machines share the load, so each cell fills less than one machine would alone. A crossed cell is a machine that is down.">
          {[
            { label: "1 machine, 30%", units: 1, load: 0.3 },
            { label: "1 machine, 75%", units: 1, load: 0.75 },
            { label: "1 machine, 96%", units: 1, load: 0.96 },
            { label: "3 machines, 42%", units: 3, load: 0.42 },
            { label: "3 machines, 90%", units: 3, load: 0.9 },
            { label: "2 machines + 1 down", units: 2, load: 0.63, lost: true },
          ].map((m) => (
            <div key={m.label} className="w-[150px]">
              <div className="mb-1 text-[11px] text-muted-foreground">{m.label}</div>
              <div className="flex"><ReplicaMatrix units={m.units} load={m.load} lost={m.lost} /></div>
            </div>
          ))}
        </Specimen>

        <Specimen title="Wire tags" note="One tag per link. Each kind of traffic has its own mark: a dot for lookups sent to the cache, a hollow diamond for lookups the cache did not have, an arrow for clicks being saved." wide>
          <WireTag color={familyColor("compute")} flow={3000} parts={[]} />
          <WireTag color={familyColor("compute")} flow={3000} parts={[{ label: "reads, 95% answered by the cache", rate: 3000 }]} />
          <WireTag color={familyColor("compute")} flow={3150} parts={[{ label: "cache misses", rate: 150 }, { label: "click writes", rate: 3000 }]} />
          <WireTag color={familyColor("compute")} flow={6} parts={[{ label: "click writes, 500 per trip", rate: 6 }]} />
        </Specimen>

        <Specimen title="A link, drawn as a cable" note="A wide casing, a core trace in the colour of the part it leaves, and small packets. A busy link uses a double-dash pattern and a dead link uses dots, so the state never depends on colour alone." wide>
          {([
            { label: "Healthy", dash: "8 5", color: familyColor("compute") },
            { label: "Busy", dash: "10 3 2 3", color: "var(--lab-hot)" },
            { label: "Dead", dash: "2 5", color: "var(--lab-down)" },
          ]).map((l) => (
            <svg key={l.label} width="220" height="44" viewBox="0 0 220 44" role="img" aria-label={`${l.label} link`}>
              <path d="M8 22 H212" stroke="var(--lab-grid)" strokeWidth="6" opacity="0.35" strokeLinecap="square" />
              <path d="M8 22 H212" stroke={l.color} strokeWidth="2" strokeDasharray={l.dash} fill="none" />
              {l.label !== "Dead" ? [50, 110, 170].map((x) => <rect key={x} x={x} y="20.75" width="6" height="2.5" rx="1" fill={l.color} />) : null}
              <text x="8" y="12" fontSize="10" fill="var(--lab-ink2)">{l.label}</text>
            </svg>
          ))}
        </Specimen>

        <Specimen title="Settings cassette: a server" note="Grows beside the part it belongs to. Segmented sizes, steppers for counts, a switch for autoscaling, and a Break it key that arms the part to fail on the next run.">
          <SettingsDrawer id="g1" kind="app-server" floating={false} cfg={cfgFor("app-server", { count: 3, azs: 2 })} tier={tierFor("app-server")} onChange={noop} onToggleDown={noop} onRemove={noop} />
        </Specimen>
        <Specimen title="Settings cassette: a cache" note="Shows what the cache was asked, what it answered itself (hit) and what it passed on (miss).">
          <SettingsDrawer id="g2" kind="cache" floating={false} cfg={cfgFor("cache", { hitRate: 0.95 })} tier={tierFor("cache", { units: 1, utilisation: 0.1, cacheStats: { hitRate: 0.95, reads: 3000, hits: 2850, misses: 150 } })} onChange={noop} onToggleDown={noop} onRemove={noop} />
        </Specimen>
        <Specimen title="Settings cassette: a database" note="The read-only copies and the extra copy that takes over, with their plain names first.">
          <SettingsDrawer id="g3" kind="database" floating={false} cfg={cfgFor("database", { replicas: 1, multiAz: 1, readRatio: 0.99 })} tier={tierFor("database", { units: 2, utilisation: 0.03, cost: 0.9 })} onChange={noop} onToggleDown={noop} onRemove={noop} />
        </Specimen>
        <Specimen title="Explanation cassette (reference solution)" note="The same frame, read-only: why a part is there, which checks it helps pass, and what goes wrong without it.">
          <PartExplainer id="g4" floating={false} kind="cache" part={SAMPLE_SOLUTION} cfg={cfgFor("cache", { hitRate: 0.95 })} tier={tierFor("cache", { units: 1, utilisation: 0.1, cacheStats: { hitRate: 0.95, reads: 3000, hits: 2850, misses: 150 } })} checkLabels={{ p99: "Slowest 1 in 100 redirects is fast enough (p99)", "cache-dies": "Everyone is still served when the cache dies" }} />
        </Specimen>

        <Specimen title="Run strip" note="One segment per scenario. The bar under the playing segment fills while it runs; the bolt marks a fault." wide>
          <div className="w-full max-w-[640px] space-y-3">
            <PhaseTimeline steps={[{ id: "1", title: "Peak traffic" }, { id: "2", title: "An app server dies" }, { id: "3", title: "The cache dies" }, { id: "4", title: "The click worker dies" }]} playing={null} activeId="2" />
            <PhaseTimeline steps={[{ id: "1", title: "Peak traffic" }, { id: "2", title: "An app server dies" }, { id: "3", title: "The cache dies" }, { id: "4", title: "The click worker dies" }]} playing={1} />
          </div>
        </Specimen>

        <Specimen title="Verification grid" note="Each check is stamped. Not run yet, pass, and fail with a fix tip and an Inspect key that replays the scene." wide>
          <ul className="w-full max-w-[640px] space-y-1.5">
            <CheckSlot check={SAMPLE_CHECKS[0]!} revealed={false} />
            <CheckSlot check={SAMPLE_CHECKS[1]!} revealed />
            <CheckSlot check={SAMPLE_CHECKS[2]!} revealed onShow={noop} />
            <CheckSlot check={SAMPLE_CHECKS[3]!} revealed onShow={noop} />
          </ul>
        </Specimen>

        <Specimen title="Reference solution: the blueprint ghost" note="Compare with mine marks each reference part: it matches yours, it is missing from your design, or it is under-configured (an amber pill says how)." wide>
          <Node kind="load-balancer" mode={mode} ghost={{ state: "matched", notes: [] }} />
          <Node kind="app-server" mode={mode} ghost={{ state: "diff", notes: ["Machines (instances) lower"] }} />
          <Node kind="cache" mode={mode} ghost={{ state: "missing", notes: [] }} load={null} />
        </Specimen>

        <Specimen title="Palette cards" note="Drag a card onto the board or tap it to add the part. The price is the model's illustrative price per hour." wide>
          {CORE.filter((k) => k !== "client").map((k) => (
            <span key={k} className="flex w-[190px] items-center gap-2 rounded-[6px] border-[1.5px] border-border bg-card px-2 py-1.5 shadow-[0_2px_0_0_var(--lab-edge-shadow)]">
              <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-[4px]" style={{ backgroundColor: tint(colorOf(k), 14), color: colorOf(k) }}><KindGlyph kind={k} size={16} /></span>
              <span className="flex-1 text-[12px] font-medium leading-tight">{partName(k, mode)}</span>
              <span className="lab-mono text-[10px] text-muted-foreground">$0.12</span>
            </span>
          ))}
        </Specimen>

        <Specimen title="Confirm bar" note="Asked before the solution opens or before a copy replaces your design. Never locked behind a score." wide>
          <div className="w-full overflow-hidden rounded-[6px] border border-border"><ConfirmBar message="Try once more, or see how it is solved?" no="Try once more" yes="Show the solution" onNo={noop} onYes={noop} /></div>
        </Specimen>

        {mode === "aws" ? (
          <Specimen title="What the AWS names mean" note="Shown on hover or tap in the board, and in the cassette. Real vCPU and memory; prices stay the model's illustrative ones." wide>
            {(["load-balancer", "app-server", "cache", "database", "queue"] as ComponentKind[]).map((k) => (
              <div key={k} className="w-[250px] rounded-[6px] border-[1.5px] border-border bg-card p-2 text-[11.5px] leading-snug">
                <div className="lab-display text-[12.5px] font-semibold">{partName(k, "aws")}</div>
                <div className="text-muted-foreground">{AWS_PARTS[k]?.meaning}</div>
                {awsInstance(k, "memory-medium") || awsInstance(k, "compute-small") ? (
                  <div className="mt-1 border-t border-border pt-1">
                    <span className="lab-mono font-bold">{(awsInstance(k, "memory-medium") ?? awsInstance(k, "compute-small"))!.type}</span>
                    <span className="text-muted-foreground"> {instanceMeaning((awsInstance(k, "memory-medium") ?? awsInstance(k, "compute-small"))!.type)}</span>
                  </div>
                ) : null}
                <div className="mt-1 rounded-[4px] border border-dashed border-border px-1.5 py-0.5"><b className="lab-mono text-[9px] uppercase tracking-wider text-muted-foreground">Remember </b>{AWS_PARTS[k]?.remember}</div>
              </div>
            ))}
          </Specimen>
        ) : null}
      </div>
    </StaticNames>
  );
}

/** The whole specimen sheet in one theme and one naming mode. */
export function LabGallery({ theme = "both", mode = "generic" }: { theme?: "light" | "dark" | "both"; mode?: NameMode }) {
  const panels: ("light" | "dark")[] = theme === "both" ? ["light", "dark"] : [theme];
  return (
    <div className={`grid grid-cols-1 gap-6 ${panels.length > 1 ? "xl:grid-cols-2" : ""}`}>
      <style>{BOARD_CSS}</style>
      {panels.map((t) => (
        <section key={t} className={t === "dark" ? "dark" : ""} aria-label={`${t} theme`}>
          <div className="lab-board @container rounded-[10px] border-[1.5px] border-border bg-[color:var(--lab-canvas)] p-4 text-foreground" data-theme-panel={t}>
            <h2 className="lab-display mb-3 text-[16px] font-semibold">{t === "dark" ? "Dark: anodised slate" : "Light: drafting vellum"}</h2>
            <Sheet mode={mode} />
          </div>
        </section>
      ))}
    </div>
  );
}
