import type { Metadata } from "next";
import { SITE_SHARE_IMAGE } from "@/lib/site";
import { AreaHero, AreaPage, AreaSection, ComingSoonPanel, StepList } from "@/components/areas/area-page";

export const metadata: Metadata = {
  title: "Guided labs",
  description: "Step-by-step labs where everything you run in the shell is checked by tests.",
  alternates: { canonical: "/labs/guided" },
  openGraph: { title: "Guided labs on Edorax", url: "/labs/guided", images: [SITE_SHARE_IMAGE] },
};

export default function GuidedLabsPage() {
  return (
    <AreaPage>
      <AreaHero
        eyebrow="Labs"
        title="Guided labs"
        status="coming-soon"
        mood="think"
        intro="A real task split into small steps, with guidance beside each one. Everything you run in the shell is checked by tests, so you know each step worked before you take the next."
      />

      <AreaSection id="how" title="How a guided lab will work">
        <StepList
          steps={[
            { title: "Read one step", body: "A short goal and why it matters, such as: give the web server its own user." },
            { title: "Do it in the shell", body: "Type the commands yourself. There is no copy button for the answer." },
            { title: "Tests check the result", body: "Checks look at the machine, not at what you typed: is the user there, is the port open, does the page load." },
            { title: "Stuck? Ask for help in steps", body: "A nudge first, then a hint, then a worked example. The step stays open until its tests pass." },
          ]}
        />
      </AreaSection>

      <AreaSection id="example" title="What a step looks like" intro="A preview of the layout. It is not interactive yet.">
        <div className="grid gap-4 border border-border bg-card p-5 md:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-primary">Step 3 of 7</div>
            <h3 className="mt-1 text-xl tracking-[-0.02em]">Serve the site on port 8080</h3>
            <p className="mt-2 text-base text-muted-foreground">Start the server so it keeps running after you close the terminal.</p>
            <ul className="mt-4 space-y-2 text-base">
              <li className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-emerald-600" />Check: the service is enabled</li>
              <li className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-emerald-600" />Check: port 8080 answers</li>
              <li className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-full bg-muted-foreground/40" />Check: it survives a restart</li>
            </ul>
          </div>
          <pre aria-label="Example terminal" className="overflow-x-auto rounded-md bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100">
            <code>{"$ sudo systemctl enable --now site\n$ curl -s localhost:8080 | head -1\n<!doctype html>\n\n2 of 3 checks pass. Restart the machine to test the last one."}</code>
          </pre>
        </div>
      </AreaSection>

      <ComingSoonPanel title="Guided labs are being built" action={{ href: "/labs/visual", label: "Try a visual lab now" }}>
        They run on the same machines as shell labs, so they arrive with the desktop app. Until then, the visual labs check your designs the same way.
      </ComingSoonPanel>
    </AreaPage>
  );
}
