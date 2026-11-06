// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type { RecordedEngagementEvent, TrackEventResult } from "../api/engagement";
import { dotClipUrl } from "./dot-voice";
import {
  resolveMascot,
  type MascotAsset,
  type MascotDefinition,
  type MascotRole,
  type MascotState,
  type PageArea,
} from "./mascots";
import { ENGAGEMENT_RULES, matchingRules, type EngagementRule, type MascotAction } from "./rules";

// What the mascot does about a batch of events, as plain data. The API runs this and sends the
// result with the event (services/engagement/reactions.ts), so every app shows the same reaction
// and new rules or lines reach them without an app release. An app only falls back to running it
// locally when the API sent no decision (see EngagementEngine.track).
//
// Reactions outlive the release that made them: an installed desktop or mobile app keeps reading
// new ones for years. Add fields freely, since readReaction keeps what it recognises and drops the
// rest. Bump MASCOT_REACTION_VERSION only for a change an older app cannot show safely.

export const MASCOT_REACTION_VERSION = 1;

export type MascotReaction = {
  /** Format of this reaction; absent on one built by an older API. */
  version?: number;
  ruleId: string;
  mascotId: string;
  mascotName: string;
  /** Live renderer for this mascot, when it has one (see MascotDefinition.rig). */
  rig?: MascotDefinition["rig"];
  role: MascotRole;
  state: MascotState;
  asset: MascotAsset;
  message: string;
  /** URL of Dot's recorded clip of this line, when the rule has one: absolute from the API. */
  voice?: string;
  /** XP the moment earned, shown beside the line; absent when XP is off or hidden. */
  xp?: number;
  /** A next step the learner may take from the bubble. */
  action?: MascotAction;
};

export type ReactionCasting = {
  registry?: Record<string, MascotDefinition>;
  roleMap?: Record<MascotRole, string>;
  areaMap?: Partial<Record<PageArea, string>>;
  defaultMascotId?: string;
};

export type ReactionContext = {
  rewards?: TrackEventResult["rewards"];
  /** The learner is reading, so ambient reactions wait for another page. */
  reading?: boolean;
  area?: PageArea | null;
  coolingDown?: (rule: EngagementRule) => boolean;
  /** Which of a rule's lines to say; the first when omitted. */
  pickLine?: (rule: EngagementRule) => number;
  /** Origin voice clips are served from; omit for app-relative URLs. */
  assetBase?: string;
  rules?: readonly EngagementRule[];
  casting?: ReactionCasting;
};

export type ReactionDecision = {
  rule: EngagementRule;
  /** The event that earned the reaction; absent only for a rule matched by no new event. */
  event: RecordedEngagementEvent | undefined;
  reaction: MascotReaction;
};

/** The reaction a batch of events earns, or null for none. Pure: cooldowns are the caller's to keep. */
export function decideReaction(events: readonly RecordedEngagementEvent[], context: ReactionContext = {}): ReactionDecision | null {
  const rules = context.rules ?? ENGAGEMENT_RULES;
  const rule = matchingRules(events, rules).find(
    (candidate) => !(candidate.ambient && context.reading) && !context.coolingDown?.(candidate)
  );
  if (!rule) return null;

  const { mascot, state, asset } = resolveMascot(
    { role: rule.role, state: rule.state, mascot: rule.mascot, area: context.area ?? null },
    context.casting ?? {}
  );
  const event = events.find((candidate) => candidate.isNew && rule.matches(candidate));
  const action = event && rule.action?.(event);
  const line = context.pickLine?.(rule) ?? 0;
  return {
    rule,
    event,
    reaction: {
      version: MASCOT_REACTION_VERSION,
      ruleId: rule.id,
      mascotId: mascot.id,
      mascotName: mascot.name,
      ...(mascot.rig ? { rig: mascot.rig } : {}),
      role: rule.role,
      state,
      asset,
      message: rule.messages[line]!,
      ...(rule.clip ? { voice: `${context.assetBase ?? ""}${dotClipUrl(rule.clip)}` } : {}),
      ...(context.rewards?.xp ? { xp: context.rewards.xp } : {}),
      ...(action ? { action } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** An app-relative path, never a protocol-relative or scripted URL. */
function isAppPath(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

function isClipUrl(value: unknown): value is string {
  return isAppPath(value) || (typeof value === "string" && /^https?:\/\//i.test(value));
}

function readAction(value: unknown): MascotAction | undefined {
  if (!isRecord(value) || typeof value.label !== "string" || !value.label) return undefined;
  if (isAppPath(value.href)) return { label: value.label, href: value.href };
  return value.intent === "ask-help" ? { label: value.label, intent: "ask-help" } : undefined;
}

/**
 * A reaction received from the network, safe to show: null when it is unusable or from a newer
 * format, and without any optional part this app does not recognise. A state it does not know
 * still shows, in the mascot's default mood.
 */
export function readReaction(value: unknown): MascotReaction | null {
  if (!isRecord(value)) return null;
  if (typeof value.version === "number" && value.version > MASCOT_REACTION_VERSION) return null;
  if (typeof value.ruleId !== "string" || typeof value.state !== "string") return null;
  if (typeof value.message !== "string" || !value.message) return null;

  const { voice, xp, action, ...rest } = value;
  const safeAction = readAction(action);
  return {
    ...rest,
    ...(isClipUrl(voice) ? { voice } : {}),
    ...(typeof xp === "number" && xp > 0 ? { xp } : {}),
    ...(safeAction ? { action: safeAction } : {}),
  } as MascotReaction;
}
