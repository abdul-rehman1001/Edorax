import { getLabSpec } from "@buildment/learning-ui/labs/registry";
import { LAB_SLUGS, type LabSlug } from "@/shared/lab/slugs";
import { VISUAL_LAB_GROUPS } from "@/lib/learn-areas";

export interface VisualLabSummary {
  slug: LabSlug;
  title: string;
  purpose: string;
  /** A full challenge: checks, scenarios and a budget. */
  challenge: boolean;
  checks: number;
}

export function visualLabSummary(slug: LabSlug): VisualLabSummary | null {
  const spec = getLabSpec(slug);
  if (!spec) return null;
  const challenge = spec.family === "hld" ? spec.challenge : undefined;
  return { slug, title: spec.title, purpose: spec.purpose, challenge: Boolean(challenge), checks: challenge?.checks.length ?? 0 };
}

/** Every registered lab, in the catalogue groups of the Labs area. */
export function visualLabGroups() {
  const all = LAB_SLUGS.map(visualLabSummary).filter((lab): lab is VisualLabSummary => lab !== null);
  return VISUAL_LAB_GROUPS.map((group) => ({ ...group, labs: all.filter((lab) => group.prefix(lab.slug)) })).filter((group) => group.labs.length > 0);
}
