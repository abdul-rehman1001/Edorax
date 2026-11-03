import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEAGUE_TIER_LABELS, nextLeagueTier, prevLeagueTier } from "@/shared/gamification/leagues";
import type { LeaderboardHubEntry, LeagueInfo } from "@/shared/api/gamification";
import { formatScore, initials } from "./leaderboard-format";

const MEDAL_TONES: Record<number, string> = {
  1: "bg-brand-yellow text-foreground",
  2: "bg-muted text-foreground",
  3: "bg-brand-yellow/40 text-foreground",
};

function RankBadge({ rank, highlight }: { rank: number; highlight?: boolean }) {
  const medal = MEDAL_TONES[rank];
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
        medal ?? (highlight ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
      )}
      aria-hidden
    >
      {rank}
    </span>
  );
}

export function LeaderboardList({
  entries,
  metricLabel,
  league,
}: {
  entries: LeaderboardHubEntry[];
  metricLabel: string;
  league?: LeagueInfo | null;
}) {
  if (entries.length === 0) return null;

  const zoneFor = (rank: number): "promote" | "demote" | null => {
    if (!league) return null;
    if (nextLeagueTier(league.tier) && league.promotionZone > 0 && rank <= league.promotionZone) return "promote";
    if (prevLeagueTier(league.tier) && league.demotionZone <= league.groupSize && rank >= league.demotionZone) return "demote";
    return null;
  };

  return (
    <section aria-labelledby="standings-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div>
        <h2 id="standings-heading" className="text-lg font-semibold tracking-[-0.02em]">
          Standings
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {league
            ? `Learners nearest your rank in ${LEAGUE_TIER_LABELS[league.tier]} League.`
            : "Learners nearest your rank."}
        </p>
      </div>

      <ol className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {entries.map((entry) => {
          const zone = zoneFor(entry.rank);

          return (
            <li
              key={`${entry.rank}-${entry.name}`}
              aria-current={entry.isYou ? "true" : undefined}
              className={cn(
                "flex items-center gap-3 px-3.5 py-3.5 sm:px-4 transition-colors",
                entry.isYou && "bg-primary/5",
                zone === "promote" && !entry.isYou && "bg-ok/[0.03]",
                zone === "demote" && !entry.isYou && "bg-destructive/[0.03]"
              )}
            >
              <RankBadge rank={entry.rank} highlight={entry.isYou} />

              <Avatar size="sm" className="size-8 shrink-0">
                <AvatarImage src={entry.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-xs font-semibold">{initials(entry.name)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 flex items-center gap-2">
                <span
                  className={cn(
                    "truncate text-base",
                    entry.isYou ? "font-semibold text-foreground" : "font-medium text-foreground"
                  )}
                >
                  {entry.name || "You"}
                </span>

                {entry.isYou ? (
                  <Badge variant="secondary" className="text-[10px] uppercase font-bold py-0 h-5">
                    You
                  </Badge>
                ) : null}

                {zone === "promote" ? (
                  <Badge variant="outline" className="hidden sm:inline-flex border-ok/30 bg-ok/10 text-ok text-[11px] py-0 h-5 font-normal">
                    Promote
                  </Badge>
                ) : zone === "demote" ? (
                  <Badge variant="destructive" className="hidden sm:inline-flex text-[11px] py-0 h-5 font-normal">
                    Demote
                  </Badge>
                ) : null}
              </div>

              <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                {formatScore(entry.score, metricLabel)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
