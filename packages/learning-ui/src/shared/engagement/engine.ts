// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
import type {
  EngagementEventType,
  EngagementPlatform,
  RecordedEngagementEvent,
  TrackEventRequest,
  TrackEventResult,
} from "../api/engagement";
import type { MascotDefinition, MascotRole, PageArea } from "./mascots";
import { decideReaction, readReaction, type MascotReaction } from "./reactions";
import type { EngagementRule } from "./rules";

export type { MascotReaction } from "./reactions";

// The engagement engine, the app's side of a reaction. track(event) reports the event (the server
// verifies it, fills in the facts and decides the reaction) and hands the reaction to `present`.
// show(reaction) presents one that arrived another way (a live notification). react(events) is the
// fallback: it decides locally, with the same rules, when the API sent no decision because it is
// older or reactions are switched off there. No UI or platform code lives here: each app plugs in
// its own transport, storage and presenter.
//
// None of these throw or need awaiting. A tracking problem must not break the action that
// triggered it, so every failure goes to `onError` and the result is simply "no reaction".

export type EngagementTrackInput = { type: EngagementEventType; courseId?: string; chapterId?: string };

/** Small key/value store for cooldowns (localStorage on the web, AsyncStorage-backed on mobile). */
export type EngagementStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
};

export type EngagementEngineOptions = {
  platform: EngagementPlatform;
  transport: (request: TrackEventRequest) => Promise<TrackEventResult>;
  present: (reaction: MascotReaction) => void;
  storage?: EngagementStore;
  now?: () => number;
  /** Picks among a rule's lines; injectable so tests are deterministic. */
  random?: () => number;
  /** True while the learner is reading; ambient reactions wait for another page. */
  isReading?: () => boolean;
  /** The part of the app the learner is in, so MASCOT_AREA_MAP can cast for it. */
  area?: () => PageArea | null;
  onError?: (error: unknown) => void;
  rules?: readonly EngagementRule[];
  registry?: Record<string, MascotDefinition>;
  roleMap?: Record<MascotRole, string>;
  areaMap?: Partial<Record<PageArea, string>>;
  defaultMascotId?: string;
};

export type EngagementEngine = {
  track(input: EngagementTrackInput): Promise<MascotReaction | null>;
  show(reaction: unknown): MascotReaction | null;
  react(events: readonly RecordedEngagementEvent[]): MascotReaction | null;
};

const COOLDOWN_PREFIX = "buildment:engagement:cooldown:";

export function memoryStore(): EngagementStore {
  const values = new Map<string, string>();
  return { get: (key) => values.get(key) ?? null, set: (key, value) => void values.set(key, value) };
}

export function createEngagementEngine(options: EngagementEngineOptions): EngagementEngine {
  const storage = options.storage ?? memoryStore();
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? Math.random;
  const lastLine = new Map<string, number>();
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // An error reporter that fails has nowhere left to report to.
    }
  };

  function coolingDown(rule: EngagementRule): boolean {
    if (!rule.cooldownMs) return false;
    const last = Number(storage.get(COOLDOWN_PREFIX + rule.id));
    return Number.isFinite(last) && last > 0 && now() - last < rule.cooldownMs;
  }

  /** The index of a random line from the rule, never the same one twice in a row. */
  function pickLine(rule: EngagementRule): number {
    const count = rule.messages.length;
    const previous = lastLine.get(rule.id);
    let index = Math.min(Math.floor(random() * count), count - 1);
    if (count > 1 && index === previous) index = (index + 1) % count;
    lastLine.set(rule.id, index);
    return index;
  }

  /** Picks, casts and presents the reaction to a batch of events, or returns null for none. */
  function respond(events: readonly RecordedEngagementEvent[], rewards?: TrackEventResult["rewards"]): MascotReaction | null {
    const decision = decideReaction(events, {
      rewards,
      reading: options.isReading?.() ?? false,
      area: options.area?.() ?? null,
      coolingDown,
      pickLine,
      rules: options.rules,
      casting: {
        registry: options.registry,
        roleMap: options.roleMap,
        areaMap: options.areaMap,
        defaultMascotId: options.defaultMascotId,
      },
    });
    if (!decision) return null;
    if (decision.rule.cooldownMs) storage.set(COOLDOWN_PREFIX + decision.rule.id, String(now()));
    options.present(decision.reaction);
    return decision.reaction;
  }

  function show(value: unknown): MascotReaction | null {
    const reaction = readReaction(value);
    if (reaction) options.present(reaction);
    return reaction;
  }

  return {
    async track(input) {
      try {
        const area = options.area?.();
        const result = await options.transport({
          ...input,
          platform: options.platform,
          ...(options.isReading?.() ? { reading: true } : {}),
          ...(area ? { area } : {}),
        });
        // null is the API deciding on no reaction; only a missing field means it did not decide.
        if (result.reaction !== undefined) return show(result.reaction);
        return respond(result.events, result.rewards);
      } catch (error) {
        report(error);
        return null;
      }
    },
    show(reaction) {
      try {
        return show(reaction);
      } catch (error) {
        report(error);
        return null;
      }
    },
    react(events) {
      try {
        return respond(events);
      } catch (error) {
        report(error);
        return null;
      }
    },
  };
}
