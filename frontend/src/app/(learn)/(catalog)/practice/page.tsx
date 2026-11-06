import type { Metadata } from "next";
import { BookOpen, MessageCircleQuestion, Repeat, Timer } from "lucide-react";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { areaById } from "@/lib/learn-areas";
import { AreaHero, AreaPage, AreaSection, CardGrid, ComingSoonPanel, InfoCard, StepList } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Bite-sized practice",
  description: "Master one topic a few minutes a day: today's question, quick quizzes, quick reads and a review queue.",
  alternates: { canonical: "/practice" },
  openGraph: { title: "Bite-sized practice on Edorax", url: "/practice", images: [SITE_SHARE_IMAGE] },
};

export default function PracticePage() {
  const area = areaById("practice");
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Practice"
        title={area.name}
        status={area.status}
        mood="think"
        intro="Master one topic, such as System Design, a few minutes a day. It starts with a question, not a lecture. When you cannot answer, it helps you work the answer out."
      />

      <AreaSection id="formats" title="Four short formats">
        <CardGrid columns={2}>
          <InfoCard icon={<MessageCircleQuestion className="size-6" />} title="Today's question" body="One question a day for your topic. Answer it first; read about it after." />
          <InfoCard icon={<Timer className="size-6" />} title="Quick quizzes" body="Three to five questions in about two minutes. No timer, no penalty for a wrong answer." />
          <InfoCard icon={<BookOpen className="size-6" />} title="Quick reads" body="One idea on one screen, with a diagram where it helps. Each ends with a question to check it stuck." />
          <InfoCard icon={<Repeat className="size-6" />} title="Review queue" body="What you got wrong comes back a few days later, then less often as you get it right." />
        </CardGrid>
      </AreaSection>

      <AreaSection id="session" title="A session, start to finish">
        <StepList
          steps={[
            { title: "A question first", body: "\"Ten thousand people press Buy at once. What breaks first?\" Answer before you see anything else." },
            { title: "Can't answer? Work it out", body: "Dot asks a smaller question, then gives a hint, then a worked example. You choose how much help you get." },
            { title: "A quick read to lock it in", body: "The idea behind the answer, short enough to finish on a bus stop." },
            { title: "Back in the review queue", body: "The question returns in a few days. Get it right twice and it moves further out." },
          ]}
        />
      </AreaSection>

      <AreaSection id="example" title="Today's question, a preview" intro="How the first screen will look. It is not interactive yet.">
        <div className="max-w-2xl border border-border bg-card p-5">
          <div className="text-sm font-bold uppercase tracking-wider text-primary">System Design · Day 12</div>
          <p className="mt-2 text-xl tracking-[-0.02em]">A page loads fast in the morning and slowly at night. Which part do you check first?</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {["The database", "The cache hit rate", "The load balancer", "I am not sure yet"].map((option) => (
              <li key={option} className="border-2 border-input px-4 py-3 text-base font-bold">
                {option}
              </li>
            ))}
          </ul>
        </div>
      </AreaSection>

      <ComingSoonPanel title="Bite-sized practice is being built" action={{ href: "/catalog", label: "Browse courses" }}>
        System Design comes first. Until then, every course chapter ends with a short quiz you can retake.
      </ComingSoonPanel>
    </AreaPage>
  );
}
