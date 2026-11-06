// GENERATED from server/src/shared — do not edit here. Run `pnpm sync-shared` in server/.
// Mascots are data. Rules ask for a role ("celebrator") and a state ("celebrate"); casting decides
// which mascot plays it, first match wins:
//   1. the rule's own `mascot` (one moment gets its own character),
//   2. MASCOT_AREA_MAP for the page the learner is on (a feature gets its own character),
//   3. MASCOT_ROLE_MAP (everyone else).
// A candidate counts only if it is registered and has the asked-for state; otherwise the next one
// is tried, then the default mascot's version of the state, then the default mascot's idle pose.
// Adding a mascot is one entry in MASCOTS plus a line in one of the maps.
//
// The cast: Bimo guides (and, as the default, has a pose for every state), Zip celebrates, Pip
// helps when something is hard, Mossy supports steady habits and breaks, and Dot brings messages.
// Nothing here names a course, so the same cast and lines work in every course.
//
// Each pose has a still image (used by any client that cannot draw the character live: email, a
// first mobile build) and, for mascots with a `rig`, an `expression`: which eyes, mouth, arms and
// motion to show. The web player draws rigged mascots from parts so they can blink, glance and
// "talk" while their line appears. A Rive file can later replace the rig without touching rules.

export const MASCOT_ROLES = ["guide", "celebrator", "helper", "supporter", "messenger"] as const;
export type MascotRole = (typeof MASCOT_ROLES)[number];

export const MASCOT_STATES = [
  "idle",
  // Getting started and coming back (guide)
  "begin",
  "first_step",
  "welcome_back",
  "reunion",
  // Celebrating (celebrator)
  "celebrate",
  "proud",
  "perfect",
  "level_up",
  "goal",
  "halfway",
  "almost",
  "graduation",
  // Helping (helper)
  "retry",
  "help",
  "stuck",
  // Supporting (supporter)
  "encourage",
  "rest",
  // Messages (messenger)
  "message",
  "message_good",
  "message_feedback",
  "message_done",
] as const;
export type MascotState = (typeof MASCOT_STATES)[number];

export type MascotEyes = "open" | "happy" | "wide" | "look-up" | "look-down";
export type MascotMouth = "smile" | "grin" | "beam" | "yay" | "hmm" | "ooh";
export type MascotBrows = "none" | "kind";
export type MascotArms = "down" | "up" | "wave" | "thumbs" | "point" | "stretch" | "hold";
/** Something drawn with the pose; `letter` sits in the hand of the `hold` arms. */
export type MascotProp = "none" | "sparkles" | "confetti" | "cap" | "bulb" | "letter" | "tea";
/** Whole-body move played once as the pose appears. */
export type MascotMotion =
  | "none"
  | "jump"
  | "puff"
  | "nod"
  | "slow-nod"
  | "tilt"
  | "bounce"
  | "spin"
  | "fly-in"
  | "stretch";

export type MascotFace = { eyes: MascotEyes; mouth: MascotMouth; brows?: MascotBrows; blush?: boolean };

export type MascotExpression = MascotFace & {
  arms: MascotArms;
  prop?: MascotProp;
  motion?: MascotMotion;
  /** A first beat before settling (e.g. glance up and "hmm", then smile). */
  opening?: Partial<MascotFace>;
  /** One wink after settling. */
  wink?: boolean;
};

export type MascotAsset = {
  /** App-relative still image, e.g. /mascots/bimo/celebrate.svg. */
  image: string;
  /** Describes the pose for screen readers; the subtitle carries the message. */
  alt: string;
  expression?: MascotExpression;
};

/** Characters the web player can draw live (components/mascot/mascot-rig.tsx). */
export const MASCOT_RIGS = ["bimo", "zip", "pip", "mossy", "dot"] as const;
export type MascotRig = (typeof MASCOT_RIGS)[number];

export type MascotDefinition = {
  id: string;
  name: string;
  /** Live renderer the web player draws this mascot with; omit to show the still images. */
  rig?: MascotRig;
  states: Partial<Record<MascotState, MascotAsset>> & { idle: MascotAsset };
};

/** Pose builder for one mascot: its still lives at /mascots/<id>/<state>.svg. */
const poses =
  (id: string) =>
  (state: MascotState, alt: string, expression: MascotExpression): MascotAsset => ({
    image: `/mascots/${id}/${state}.svg`,
    alt,
    expression,
  });

const bimo = poses("bimo");
const zip = poses("zip");
const pip = poses("pip");
const mossy = poses("mossy");
const dot = poses("dot");

// Shared expressions, so a state reads the same on every mascot that has it.
const IDLE: MascotExpression = { eyes: "open", mouth: "smile", arms: "down" };
const CELEBRATE: MascotExpression = { eyes: "happy", mouth: "grin", arms: "up", prop: "confetti", motion: "jump" };
const PROUD: MascotExpression = { eyes: "happy", mouth: "beam", blush: true, arms: "thumbs", motion: "puff" };
const PERFECT: MascotExpression = { eyes: "happy", mouth: "beam", arms: "up", prop: "sparkles", motion: "spin" };
const LEVEL_UP: MascotExpression = { eyes: "wide", mouth: "yay", arms: "up", prop: "sparkles", motion: "jump" };
const GOAL: MascotExpression = { eyes: "happy", mouth: "grin", arms: "thumbs", prop: "sparkles", motion: "bounce" };
const HALFWAY: MascotExpression = { eyes: "happy", mouth: "grin", arms: "up", motion: "jump" };
const ALMOST: MascotExpression = { eyes: "wide", mouth: "ooh", arms: "point", motion: "bounce" };
const GRADUATION: MascotExpression = { eyes: "happy", mouth: "grin", arms: "up", prop: "cap", motion: "jump", wink: true };
const RETRY: MascotExpression = { eyes: "open", brows: "kind", mouth: "smile", arms: "down", motion: "tilt" };
const HELP: MascotExpression = {
  eyes: "open",
  mouth: "smile",
  arms: "point",
  prop: "bulb",
  motion: "tilt",
  opening: { eyes: "look-up", mouth: "hmm" },
};
const STUCK: MascotExpression = {
  eyes: "open",
  brows: "kind",
  mouth: "smile",
  arms: "point",
  prop: "bulb",
  motion: "tilt",
  opening: { mouth: "hmm" },
};
const ENCOURAGE: MascotExpression = {
  eyes: "open",
  mouth: "smile",
  arms: "thumbs",
  motion: "nod",
  opening: { eyes: "look-down", mouth: "ooh" },
};
const REST: MascotExpression = { eyes: "happy", mouth: "smile", arms: "stretch", prop: "tea", motion: "stretch" };
const MESSAGE: MascotExpression = { eyes: "wide", mouth: "ooh", arms: "hold", prop: "letter", motion: "fly-in" };
const MESSAGE_GOOD: MascotExpression = { eyes: "happy", mouth: "grin", arms: "hold", prop: "letter", motion: "bounce" };
const MESSAGE_FEEDBACK: MascotExpression = {
  eyes: "open",
  brows: "kind",
  mouth: "smile",
  arms: "hold",
  prop: "letter",
  motion: "nod",
};
const MESSAGE_DONE: MascotExpression = { eyes: "happy", mouth: "smile", arms: "thumbs", motion: "nod" };

export const MASCOTS: Record<string, MascotDefinition> = {
  bimo: {
    id: "bimo",
    name: "Bimo",
    rig: "bimo",
    states: {
      idle: bimo("idle", "Bimo smiling", IDLE),
      begin: bimo("begin", "Bimo waving hello among sparkles", {
        eyes: "wide",
        mouth: "yay",
        arms: "wave",
        prop: "sparkles",
        motion: "bounce",
      }),
      first_step: bimo("first_step", "Bimo pointing the way ahead", { eyes: "happy", mouth: "smile", arms: "point", motion: "nod" }),
      welcome_back: bimo("welcome_back", "Bimo waving hello", { eyes: "wide", mouth: "yay", arms: "wave", motion: "bounce" }),
      reunion: bimo("reunion", "Bimo beaming and waving among sparkles", {
        eyes: "happy",
        mouth: "beam",
        blush: true,
        arms: "wave",
        prop: "sparkles",
        motion: "jump",
      }),
      celebrate: bimo("celebrate", "Bimo cheering in a burst of confetti", CELEBRATE),
      proud: bimo("proud", "Bimo beaming with pride", PROUD),
      perfect: bimo("perfect", "Bimo spinning among sparkles", PERFECT),
      level_up: bimo("level_up", "Bimo cheering among sparkles", LEVEL_UP),
      goal: bimo("goal", "Bimo giving a thumbs up among sparkles", GOAL),
      halfway: bimo("halfway", "Bimo cheering with arms up", HALFWAY),
      almost: bimo("almost", "Bimo pointing ahead, excited", ALMOST),
      graduation: bimo("graduation", "Bimo wearing a graduation cap", GRADUATION),
      retry: bimo("retry", "Bimo with a reassuring smile", RETRY),
      help: bimo("help", "Bimo thinking, then pointing to a hint", HELP),
      stuck: bimo("stuck", "Bimo offering a helpful idea", STUCK),
      encourage: bimo("encourage", "Bimo giving a thumbs up", ENCOURAGE),
      rest: bimo("rest", "Bimo stretching beside a cup of tea", REST),
      message: bimo("message", "Bimo holding a letter", MESSAGE),
      message_good: bimo("message_good", "Bimo holding a letter, delighted", MESSAGE_GOOD),
      message_feedback: bimo("message_feedback", "Bimo holding a letter with a kind smile", MESSAGE_FEEDBACK),
      message_done: bimo("message_done", "Bimo giving a thumbs up", MESSAGE_DONE),
    },
  },
  zip: {
    id: "zip",
    name: "Zip",
    rig: "zip",
    states: {
      idle: zip("idle", "Zip smiling", IDLE),
      celebrate: zip("celebrate", "Zip jumping in a burst of confetti", CELEBRATE),
      proud: zip("proud", "Zip beaming with a thumbs up", PROUD),
      perfect: zip("perfect", "Zip spinning among sparkles", PERFECT),
      level_up: zip("level_up", "Zip leaping with arms up among sparkles", LEVEL_UP),
      goal: zip("goal", "Zip giving a thumbs up among sparkles", GOAL),
      halfway: zip("halfway", "Zip jumping with arms up", HALFWAY),
      almost: zip("almost", "Zip pointing ahead, excited", ALMOST),
      graduation: zip("graduation", "Zip wearing a graduation cap", GRADUATION),
    },
  },
  pip: {
    id: "pip",
    name: "Pip",
    rig: "pip",
    states: {
      idle: pip("idle", "Pip smiling", IDLE),
      retry: pip("retry", "Pip with a reassuring smile", RETRY),
      help: pip("help", "Pip thinking, then pointing to a hint", HELP),
      stuck: pip("stuck", "Pip offering a helpful idea", STUCK),
    },
  },
  mossy: {
    id: "mossy",
    name: "Mossy",
    rig: "mossy",
    states: {
      idle: mossy("idle", "Mossy smiling", IDLE),
      encourage: mossy("encourage", "Mossy giving a slow thumbs up", { ...ENCOURAGE, motion: "slow-nod" }),
      rest: mossy("rest", "Mossy stretching beside a cup of tea", REST),
    },
  },
  dot: {
    id: "dot",
    name: "Dot",
    rig: "dot",
    states: {
      idle: dot("idle", "Dot smiling", IDLE),
      message: dot("message", "Dot flying in with a letter", MESSAGE),
      message_good: dot("message_good", "Dot holding a letter, delighted", MESSAGE_GOOD),
      message_feedback: dot("message_feedback", "Dot holding a letter with a kind smile", MESSAGE_FEEDBACK),
      message_done: dot("message_done", "Dot giving a thumbs up", MESSAGE_DONE),
    },
  },
};

export const DEFAULT_MASCOT_ID = "bimo";

export const MASCOT_ROLE_MAP: Record<MascotRole, string> = {
  guide: "bimo",
  celebrator: "zip",
  helper: "pip",
  supporter: "mossy",
  messenger: "dot",
};

/** Parts of the app a client can report the learner is in; each client maps its own routes. */
export const PAGE_AREAS = [
  "catalog",
  "course",
  "chapter",
  "checkout",
  "dashboard",
  "my-courses",
  "my-questions",
  "progress",
  "settings",
] as const;
export type PageArea = (typeof PAGE_AREAS)[number];

/** Mascot for every reaction shown in an area, ahead of the role map. Empty: roles decide. */
export const MASCOT_AREA_MAP: Partial<Record<PageArea, string>> = {};

export type MascotCasting = {
  registry: Record<string, MascotDefinition>;
  roleMap: Record<MascotRole, string>;
  areaMap: Partial<Record<PageArea, string>>;
  defaultMascotId: string;
};

export const DEFAULT_CASTING: MascotCasting = {
  registry: MASCOTS,
  roleMap: MASCOT_ROLE_MAP,
  areaMap: MASCOT_AREA_MAP,
  defaultMascotId: DEFAULT_MASCOT_ID,
};

export type MascotRequest = {
  role: MascotRole;
  state: MascotState;
  /** The rule's own mascot, if it names one. */
  mascot?: string;
  /** Where the learner is when the reaction shows; null when the page has no area. */
  area?: PageArea | null;
};

export type ResolvedMascot = { mascot: MascotDefinition; state: MascotState; asset: MascotAsset };

/** The mascot and pose for a reaction, with the casting order and fallbacks described above. */
export function resolveMascot(request: MascotRequest, casting: Partial<MascotCasting> = {}): ResolvedMascot {
  const registry = casting.registry ?? DEFAULT_CASTING.registry;
  const roleMap = casting.roleMap ?? DEFAULT_CASTING.roleMap;
  const areaMap = casting.areaMap ?? DEFAULT_CASTING.areaMap;
  const defaultMascotId = casting.defaultMascotId ?? DEFAULT_CASTING.defaultMascotId;
  const fallback = registry[defaultMascotId];
  if (!fallback) throw new Error(`Default mascot "${defaultMascotId}" is not registered`);

  const candidates = [request.mascot, request.area ? areaMap[request.area] : undefined, roleMap[request.role]];
  for (const id of candidates) {
    const cast = id ? registry[id] : undefined;
    const own = cast?.states[request.state];
    if (cast && own) return { mascot: cast, state: request.state, asset: own };
  }

  const shared = fallback.states[request.state];
  if (shared) return { mascot: fallback, state: request.state, asset: shared };
  return { mascot: fallback, state: "idle", asset: fallback.states.idle };
}
