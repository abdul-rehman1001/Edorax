import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { areaById } from "@/lib/learn-areas";
import { AreaHero, AreaPage, AreaSection, ComingSoonPanel, StepList } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "On-call tutors",
  description: "Call a tutor for any topic, start talking and ask about anything that feels hard. It explains in plain words and keeps your place.",
  alternates: { canonical: "/voice" },
  openGraph: { title: "On-call tutors on Edorax", url: "/voice", images: [SITE_SHARE_IMAGE] },
};

const CALL: { who: "agent" | "you"; text: string }[] = [
  { who: "agent", text: "Hi, I'm your System Design tutor. What do you already know, and what feels hard?" },
  { who: "you", text: "Yes. I know what a server is, but not much more." },
  { who: "agent", text: "Then we'll start as a beginner. Module 2 is about why waiting suddenly gets long. Want a two-minute version first?" },
  { who: "you", text: "Wait, what is a load balancer for?" },
  { who: "agent", text: "It spreads requests over several servers, so one busy server does not slow everyone down. That is module 4. Shall we go there next?" },
];

export default function VoicePage() {
  const area = areaById("voice");
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Tutors"
        title={area.name}
        status={area.status}
        mood="happy"
        intro="A tutor for every topic, one call away. Say how much you already know and start talking. Ask about anything that feels hard, as often as you like. It answers in plain words and brings you back to the modules that fit your level."
      />

      <AreaSection id="call" title="What a call sounds like" intro="A sample, written out. Calls are not open yet.">
        <ol className="max-w-2xl space-y-3" aria-label="Sample call">
          {CALL.map((line, i) => (
            <li key={i} className={line.who === "agent" ? "mr-10" : "ml-10"}>
              <div className={line.who === "agent" ? "border border-border bg-card px-4 py-3" : "bg-primary px-4 py-3 text-primary-foreground"}>
                <div className={`text-xs font-bold uppercase tracking-wider ${line.who === "agent" ? "text-primary" : "text-primary-foreground/80"}`}>
                  {line.who === "agent" ? "System Design tutor" : "You"}
                </div>
                <p className="mt-1 text-base">{line.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </AreaSection>

      <AreaSection id="how" title="How it will work">
        <StepList
          steps={[
            { title: "Call the topic", body: "Pick a topic, such as System Design, and press Call. Your tutor picks up and asks where you want to start." },
            { title: "Say your level", body: "Beginner, intermediate or advanced. It checks with one or two questions instead of trusting a label." },
            { title: "Ask anything", body: "Interrupt with any question. It answers briefly, then brings you back to where you were." },
            { title: "Your place is kept", body: "Each topic has 40 to 50 modules. Your tutor tracks which you have covered, so the next call picks up where you stopped." },
          ]}
        />
      </AreaSection>

      <ComingSoonPanel title="On-call tutors are on the way" action={{ href: "/catalog", label: "Browse courses" }}>
        System Design gets the first tutor. Every chapter can already be heard word by word, at any speed from 0.75x to 4x.
      </ComingSoonPanel>
    </AreaPage>
  );
}
