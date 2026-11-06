import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { LEARN_AREAS } from "@/lib/learn-areas";
import { AREA_ICON } from "@/components/areas/area-icon";
import { AreaHero, AreaPage, AreaSection, CardGrid, InfoCard } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Everything you can learn",
  description: "Courses, audio, labs, bite-sized practice, daily puzzles and voice agents. One place to learn tech and human skills.",
  alternates: { canonical: "/learn" },
  openGraph: { title: "Everything you can learn on Edorax", url: "/learn", images: [SITE_SHARE_IMAGE] },
};

export default function LearnHubPage() {
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Edorax"
        title="Six ways to learn, one place"
        mood="wave"
        intro="Read a course, listen to it on the go, build in a lab, practise for a few minutes, solve today's puzzle, or talk a topic through. Pick what suits your day."
      />

      <AreaSection id="areas" title="The areas" intro="Courses, Listen and visual labs are open now. The rest are on the way; each page says what is coming.">
        <CardGrid>
          {LEARN_AREAS.map((area) => {
            const Icon = AREA_ICON[area.id];
            return (
              <InfoCard
                key={area.id}
                title={area.name}
                body={area.summary}
                href={area.href}
                status={area.status}
                icon={<Icon className="size-6" />}
                cta={area.status === "coming-soon" ? "See what is coming" : area.id === "listen" ? "Start listening" : `Open ${area.short.toLowerCase()}`}
                meta={area.tagline}
              />
            );
          })}
        </CardGrid>
      </AreaSection>
    </AreaPage>
  );
}
