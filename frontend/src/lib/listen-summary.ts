// Pure helpers for the Listen area: turn a course's narration manifest into chapter counts,
// minutes and reader links. The loader lives in `narration.ts`; these stay free of I/O so
// they can be tested on their own.

const AUDIO_FILE = /^[\w.-]+\.mp3$/;

export type ListenChapter = { slug: string; title: string; minutes: number };

export type ListenSummary = { chapters: ListenChapter[]; totalMinutes: number };

/** "1-2-roles-and-expectations" reads as "Roles and expectations". */
export function chapterTitleFromSlug(slug: string): string {
  const words = slug.replace(/^(?:\d+[.-])+/, "").replace(/-/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

/** The chapters with valid audio, in course order (the audio files are numbered), or null when none. */
export function summarizeManifest(manifest: unknown): ListenSummary | null {
  if (!manifest || typeof manifest !== "object") return null;
  const chapters = (manifest as { chapters?: unknown }).chapters;
  if (!chapters || typeof chapters !== "object") return null;
  const rows: (ListenChapter & { file: string })[] = [];
  for (const [slug, entry] of Object.entries(chapters as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { file, minutes } = entry as Record<string, unknown>;
    if (typeof file !== "string" || !AUDIO_FILE.test(file)) continue;
    if (typeof minutes !== "number" || !(minutes > 0)) continue;
    rows.push({ slug, title: chapterTitleFromSlug(slug), minutes, file });
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
  return {
    chapters: rows.map(({ slug, title, minutes }) => ({ slug, title, minutes })),
    totalMinutes: rows.reduce((sum, row) => sum + row.minutes, 0),
  };
}

/** "2.5 hours", "1 hour" or "40 min" for a course's total listening time. */
export function formatListenTotal(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** The reader page for a chapter, scrolled to its Listen player. */
export function listenHref(courseSlug: string, chapterSlug: string): string {
  return `/courses/${courseSlug}/${chapterSlug}#listen`;
}
