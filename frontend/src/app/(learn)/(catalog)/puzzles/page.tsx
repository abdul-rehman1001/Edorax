import type { Metadata } from "next";
import { CalendarDays, Gauge, Route, Trophy } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { areaById } from "@/lib/learn-areas";
import { AreaHero, AreaPage, AreaSection, CardGrid, ComingSoonPanel, InfoCard } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Puzzles",
  description: "A new puzzle every day, built on what you learn. The same puzzle for everyone, and a daily leaderboard to climb.",
  alternates: { canonical: "/puzzles" },
  openGraph: { title: "Daily puzzles on Edorax", url: "/puzzles", images: [SITE_SHARE_IMAGE] },
};

export default function PuzzlesPage() {
  const area = areaById("puzzles");
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Puzzles"
        title="Daily puzzles"
        status={area.status}
        mood="wink"
        intro="One small puzzle a day, the same for everyone. Solve it, see where you landed on today's leaderboard, and come back tomorrow. Each one uses an idea from the courses, so a good guess turns into something you understand."
      />

      <AreaSection id="kinds" title="Kinds of puzzle" intro="Several kinds take turns through the week, so no two days feel the same.">
        <CardGrid columns={2}>
          <InfoCard icon={<Gauge className="size-6" />} title="Find the bottleneck" body="A small system is struggling. Tap the one part that gives out first." />
          <InfoCard icon={<Route className="size-6" />} title="Trace the request" body="Put the steps of a request in order, from the tap on a phone to the answer on screen." />
          <InfoCard title="Fix the diagram" body="One link or one part is wrong. Find it and fix it in as few moves as you can." />
          <InfoCard title="Odd one out" body="Four ideas, one does not belong. Say which, and the reason appears." />
        </CardGrid>
      </AreaSection>

      <AreaSection id="daily" title="How the daily puzzle works">
        <CardGrid>
          <InfoCard icon={<CalendarDays className="size-6" />} title="One a day" body="A new puzzle at midnight in your time zone. Missed one? Yesterday's stays open to practise." />
          <InfoCard title="A few tries" body="You get a few attempts. Each wrong try shows a clue, so you learn something either way." />
          <InfoCard icon={<Trophy className="size-6" />} title="Daily leaderboard" body="Fewer tries and a faster solve put you higher on today's board. It resets every day, so everyone starts level. Joining it is your choice, like every leaderboard on Edorax." />
        </CardGrid>
      </AreaSection>

      <ComingSoonPanel title="Puzzles are on the way" action={{ href: "/labs/visual", label: "Try a visual lab now" }}>
        The visual labs are the closest thing today: a design, a set of checks, and a reason for every result.
      </ComingSoonPanel>
    </AreaPage>
  );
}
