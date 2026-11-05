import type { Metadata } from "next";
import Link from "next/link";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { LAB_KINDS, areaById } from "@/lib/learn-areas";
import { visualLabGroups } from "@/lib/visual-labs";
import { LAB_KIND_ICON } from "@/components/areas/area-icon";
import { AreaHero, AreaPage, AreaSection, CardGrid, InfoCard, StepList } from "@/components/areas/area-page";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Labs",
  description: "Build it, break it, and see the result. Visual labs are open now; guided and shell labs are on the way.",
  alternates: { canonical: "/labs" },
  openGraph: { title: "Labs on Edorax", url: "/labs", images: [SITE_SHARE_IMAGE] },
};

export default function LabsPage() {
  const area = areaById("labs");
  const challenges = visualLabGroups().find((group) => group.title === "System Design challenges")?.labs ?? [];
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Labs"
        title="Build it, break it, see the result"
        status={area.status}
        mood="determined"
        intro="Reading tells you how a system should behave. A lab lets you find out. There are three kinds, from no code at all to a real terminal."
      >
        <Link href="/labs/visual" className={buttonVariants({ size: "lg" })}>
          Open the visual labs
        </Link>
        <Link href="/labs/shell#desktop" className={buttonVariants({ size: "lg", variant: "outline" })}>
          Desktop app docs
        </Link>
      </AreaHero>

      <AreaSection id="kinds" title="Three kinds of lab">
        <CardGrid>
          {LAB_KINDS.map((kind) => {
            const Icon = LAB_KIND_ICON[kind.id];
            return (
              <InfoCard
                key={kind.id}
                title={kind.name}
                body={kind.summary}
                meta={kind.tagline}
                href={kind.href}
                status={kind.status}
                icon={<Icon className="size-6" />}
                cta={kind.status === "live" ? "Open visual labs" : "See how it will work"}
              />
            );
          })}
        </CardGrid>
      </AreaSection>

      <AreaSection
        id="visual"
        title="Open now: System Design challenges"
        intro="Each one is a product to design from parts. Run it through peak traffic and failures, and keep it under budget."
      >
        <CardGrid>
          {challenges.map((lab) => (
            <InfoCard
              key={lab.slug}
              title={lab.title}
              body={lab.purpose}
              href={`/labs/visual/${lab.slug}`}
              cta="Open lab"
              meta={lab.checks > 0 ? `${lab.checks} checks` : undefined}
            />
          ))}
        </CardGrid>
        <p className="mt-5 text-base">
          <Link href="/labs/visual" className="font-bold text-primary underline-offset-4 hover:underline">
            See every visual lab, including networking and cloud
          </Link>
        </p>
      </AreaSection>

      <AreaSection id="how" title="How a visual lab works">
        <StepList
          steps={[
            { title: "Build", body: "Add parts from the list, link them and set their size. Switch between plain names and real AWS names at any time." },
            { title: "Choose what to break", body: "Open a part and press Break it. That only arms the failure. Nothing changes until you run." },
            { title: "Press Run", body: "The design plays through every scenario: normal traffic, the peak, and each failure. Nothing runs until you ask." },
            { title: "Read the checks", body: "Every test case passes or fails on the board, with the number it measured and why. Fix one thing and run again." },
          ]}
        />
      </AreaSection>
    </AreaPage>
  );
}
