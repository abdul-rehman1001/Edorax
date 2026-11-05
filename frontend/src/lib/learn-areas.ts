// The learner areas of Edorax, in one place. The workspace nav, the area tabs, the
// /learn hub, each area's overview page and the landing page all read from here,
// so adding or renaming an area is one edit. The plan behind each area is in
// docs/16-learning-areas.mdx.

export type AreaStatus = "live" | "partly-live" | "coming-soon";

export type LearnAreaId = "courses" | "labs" | "practice" | "puzzles" | "voice";

export interface LearnArea {
  id: LearnAreaId;
  /** Full name, used as a page title. */
  name: string;
  /** Short name for tabs and bottom bars. */
  short: string;
  href: string;
  status: AreaStatus;
  /** One line under the name. */
  tagline: string;
  /** Two or three sentences on what it is. */
  summary: string;
  /** Paths that belong to this area, for highlighting the current tab. */
  matches: string[];
}

export const LEARN_AREAS: readonly LearnArea[] = [
  {
    id: "courses",
    name: "Courses",
    short: "Courses",
    href: "/catalog",
    status: "live",
    tagline: "Chapters you read, play with, listen to and prove.",
    summary:
      "Full courses in tech and human skills. Every chapter starts with a question, has live diagrams, can be heard word by word, and ends with a short quiz.",
    matches: ["/catalog", "/my-courses", "/courses"],
  },
  {
    id: "labs",
    name: "Labs",
    short: "Labs",
    href: "/labs",
    status: "partly-live",
    tagline: "Build it, break it, and see the result.",
    summary:
      "Hands-on practice in three kinds. Visual labs are open today: move parts, press Run and watch every check pass or fail. Guided labs and shell labs come next.",
    matches: ["/labs"],
  },
  {
    id: "practice",
    name: "Bite-sized practice",
    short: "Practice",
    href: "/practice",
    status: "coming-soon",
    tagline: "A few minutes a day on one topic, led by questions.",
    summary:
      "Master one topic, such as System Design, in short daily sessions: today's question, quick quizzes, quick reads and a review queue. When you cannot answer, it helps you work the answer out.",
    matches: ["/practice"],
  },
  {
    id: "puzzles",
    name: "Puzzles",
    short: "Puzzles",
    href: "/puzzles",
    status: "coming-soon",
    tagline: "A new puzzle every day.",
    summary:
      "Several kinds of daily puzzles that use what you learn. One a day, the same for everyone. The mobile app will add a daily leaderboard.",
    matches: ["/puzzles"],
  },
  {
    id: "voice",
    name: "Voice agents",
    short: "Voice",
    href: "/voice",
    status: "coming-soon",
    tagline: "Call a tutor for a topic and talk it through.",
    summary:
      "One voice agent per topic. It greets you, asks your level, answers your questions and keeps steering you to the modules that fit, while tracking your progress across the whole topic.",
    matches: ["/voice"],
  },
];

export function areaById(id: LearnAreaId): LearnArea {
  return LEARN_AREAS.find((area) => area.id === id)!;
}

/** The area a path belongs to, or null (dashboard, progress, settings). */
export function areaForPath(pathname: string): LearnArea | null {
  return LEARN_AREAS.find((area) => area.matches.some((m) => pathname === m || pathname.startsWith(`${m}/`))) ?? null;
}

export const STATUS_LABEL: Record<AreaStatus, string> = {
  live: "Open now",
  "partly-live": "Partly open",
  "coming-soon": "Coming soon",
};

// ---- Labs ----------------------------------------------------------------------

export type LabKindId = "visual" | "guided" | "shell";

export interface LabKind {
  id: LabKindId;
  name: string;
  href: string;
  status: AreaStatus;
  tagline: string;
  summary: string;
}

export const LAB_KINDS: readonly LabKind[] = [
  {
    id: "visual",
    name: "Visual labs",
    href: "/labs/visual",
    status: "live",
    tagline: "No code. Move parts, press Run, watch the checks.",
    summary:
      "Design a system on a board: add parts, link them and size them. Pick what to break, then press Run. Every test case passes or fails on screen, with the reason.",
  },
  {
    id: "guided",
    name: "Guided labs",
    href: "/labs/guided",
    status: "coming-soon",
    tagline: "Step by step, and every step is checked.",
    summary:
      "A lab split into small steps with guidance beside each one. Everything you run in the shell is checked by tests, so you know each step worked before you move on.",
  },
  {
    id: "shell",
    name: "Shell labs",
    href: "/labs/shell",
    status: "coming-soon",
    tagline: "Real machines and a real terminal.",
    summary:
      "Real shell work on real Linux machines, containers and networks. Shell labs run in the Edorax desktop app, which is being built now.",
  },
];

/** Visual labs grouped for the catalogue. Slugs come from the lab registry. */
export const VISUAL_LAB_GROUPS: readonly { title: string; description: string; prefix: (slug: string) => boolean }[] = [
  {
    title: "System Design challenges",
    description: "Design a real product from parts, then survive peak traffic and failures inside a budget.",
    prefix: (slug) => slug.startsWith("hld-visual-"),
  },
  {
    title: "System Design ideas",
    description: "Smaller boards for one idea at a time: where waiting explodes, three tiers, a cache.",
    prefix: (slug) => /^hld-m\d+-/.test(slug),
  },
  {
    title: "Cloud and infrastructure",
    description: "The same kind of board for AWS, Kubernetes, Compose and a single Linux host.",
    prefix: (slug) => ["aws-web-tier", "k8s-web-app", "docker-compose-stack", "linux-single-host"].includes(slug),
  },
  {
    title: "Networking",
    description: "Explore, plan, build and fix small networks. Every answer is checked.",
    prefix: (slug) => slug.startsWith("net-"),
  },
];
