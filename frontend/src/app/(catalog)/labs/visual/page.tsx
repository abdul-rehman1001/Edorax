import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { visualLabGroups } from "@/lib/visual-labs";
import { AreaHero, AreaPage, AreaSection, CardGrid, InfoCard } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Visual labs",
  description: "No code. Move parts, press Run, and watch every test case pass or fail on the board.",
  alternates: { canonical: "/labs/visual" },
  openGraph: { title: "Visual labs on Edorax", url: "/labs/visual", images: [SITE_SHARE_IMAGE] },
};

export default function VisualLabsPage() {
  const groups = visualLabGroups();
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Labs"
        title="Visual labs"
        status="live"
        mood="happy"
        intro="Design on a board instead of in code. Add parts, link them, pick what to break, then press Run. Every check passes or fails in front of you, with the reason."
      />
      {groups.map((group) => (
        <AreaSection key={group.title} id={group.title.toLowerCase().replace(/[^a-z]+/g, "-")} title={group.title} intro={group.description}>
          <CardGrid>
            {group.labs.map((lab) => (
              <InfoCard
                key={lab.slug}
                title={lab.title}
                body={lab.purpose}
                href={`/labs/visual/${lab.slug}`}
                cta="Open lab"
                meta={lab.challenge ? `Challenge, ${lab.checks} checks` : undefined}
              />
            ))}
          </CardGrid>
        </AreaSection>
      ))}
    </AreaPage>
  );
}
