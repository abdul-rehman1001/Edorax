import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DotMood } from "@buildment/learning-ui/brand-dot";
import { Dot } from "@/components/brand/dot";
import { STATUS_LABEL, type AreaStatus } from "@/lib/learn-areas";
import { cn } from "@/lib/utils";
import { AreaTabs } from "./area-tabs";

// Building blocks for the learner area overview pages (/learn, /labs, /practice,
// /puzzles, /voice). Theme tokens only, so every page works in light and dark.

export function AreaPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
      <AreaTabs />
      {children}
    </div>
  );
}

export function StatusBadge({ status, className }: { status: AreaStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-sm font-bold",
        status === "live"
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          : status === "partly-live"
            ? "bg-secondary text-primary"
            : "bg-brand-yellow/25 text-foreground dark:bg-brand-yellow/15",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 rounded-full", status === "live" ? "bg-emerald-600" : status === "partly-live" ? "bg-primary" : "bg-brand-yellow")}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function AreaHero({
  eyebrow,
  title,
  intro,
  status,
  mood,
  children,
}: {
  eyebrow?: string;
  title: string;
  intro: ReactNode;
  status?: AreaStatus;
  mood: DotMood;
  /** Actions under the intro. */
  children?: ReactNode;
}) {
  return (
    <header className="mt-8 flex flex-col-reverse gap-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          {eyebrow ? <span className="text-sm font-bold uppercase tracking-wider text-primary">{eyebrow}</span> : null}
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <h1 className="mt-2 text-[32px] leading-tight tracking-[-0.035em] sm:text-[40px]">{title}</h1>
        <div className="mt-3 max-w-2xl text-lg text-muted-foreground">{intro}</div>
        {children ? <div className="mt-6 flex flex-wrap gap-3">{children}</div> : null}
      </div>
      <div className="shrink-0 self-start sm:self-center">
        <Dot mood={mood} size={120} />
      </div>
    </header>
  );
}

export function AreaSection({ id, title, intro, children }: { id?: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="mt-12 scroll-mt-24">
      <h2 id={id ? `${id}-title` : undefined} className="text-2xl tracking-[-0.02em]">
        {title}
      </h2>
      {intro ? <div className="mt-1 max-w-3xl text-base text-muted-foreground">{intro}</div> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function CardGrid({ children, columns = 3 }: { children: ReactNode; columns?: 2 | 3 }) {
  return <ul className={cn("grid gap-5", columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "md:grid-cols-2")}>{children}</ul>;
}

/** A card about one thing in an area. With an href the whole card is a link. */
export function InfoCard({
  title,
  body,
  href,
  status,
  icon,
  cta,
  meta,
}: {
  title: string;
  body: ReactNode;
  href?: string;
  status?: AreaStatus;
  icon?: ReactNode;
  cta?: string;
  meta?: ReactNode;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        {icon ? (
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-secondary text-primary">
            {icon}
          </span>
        ) : null}
        {status ? <StatusBadge status={status} className="ml-auto" /> : null}
      </div>
      <h3 className={cn("text-xl tracking-[-0.02em]", icon || status ? "mt-4" : "")}>{title}</h3>
      <div className="mt-2 flex-1 text-base text-muted-foreground">{body}</div>
      {meta ? <div className="mt-3 text-sm text-muted-foreground">{meta}</div> : null}
      {href && cta ? (
        <span className="mt-4 inline-flex items-center gap-1.5 text-base font-bold text-primary">
          {cta}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      ) : null}
    </>
  );
  const box = "flex h-full flex-col border border-border bg-card p-5";
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(
            box,
            "group outline-none transition-colors hover:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
          )}
        >
          {inner}
        </Link>
      ) : (
        <div className={box}>{inner}</div>
      )}
    </li>
  );
}

/** Numbered steps: how a feature will work, in order. */
export function StepList({ steps }: { steps: { title: string; body: ReactNode }[] }) {
  return (
    <ol className="grid gap-4 md:grid-cols-2">
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-4 border border-border bg-card p-5">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground">
            {i + 1}
          </span>
          <div className="min-w-0">
            <h3 className="text-lg tracking-[-0.01em]">{step.title}</h3>
            <div className="mt-1 text-base text-muted-foreground">{step.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The honest "not built yet" panel, with Dot and a way to keep learning today. */
export function ComingSoonPanel({ title, children, action }: { title: string; children: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="mt-12 flex flex-col gap-5 border-2 border-dashed border-border bg-card p-6 sm:flex-row sm:items-center">
      <Dot mood="think" size={88} />
      <div className="min-w-0 flex-1">
        <h2 className="text-xl tracking-[-0.02em]">{title}</h2>
        <div className="mt-1 text-base text-muted-foreground">{children}</div>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-primary px-5 text-base font-bold text-primary outline-none transition-colors hover:bg-secondary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow"
        >
          {action.label}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}
