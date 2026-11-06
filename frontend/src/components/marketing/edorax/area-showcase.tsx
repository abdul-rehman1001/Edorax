import Link from "next/link";
import type { ReactNode } from "react";
import { LAB_KINDS, LEARN_AREAS, STATUS_LABEL, type LearnArea, type LearnAreaId } from "@/lib/learn-areas";
import s from "./edorax-landing.module.css";

// The landing page's tour of every learner area. Same inline brand values as the
// rest of the landing page (light only, matching the approved design); names,
// taglines and status come from LEARN_AREAS so the page never drifts from the app.

const INK = "#0A0F2C";
const MUTED = "#46507A";
const COBALT = "#2434E0";
const YELLOW = "#FFC933";
const TINT = "#E8EBFF";
const LINE = "#DCE0F2";
const PAPER = "#F6F7FB";
const UNBOUNDED = "var(--font-unbounded), sans-serif";

function StatusPill({ area }: { area: LearnArea }) {
  const live = area.status !== "coming-soon";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "12px",
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "4px 8px",
        background: live ? COBALT : YELLOW,
        color: live ? PAPER : INK,
      }}
    >
      {STATUS_LABEL[area.status]}
    </span>
  );
}

const PANEL: React.CSSProperties = {
  height: "170px",
  background: TINT,
  padding: "18px",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: "10px",
};

const VISUALS: Record<LearnAreaId, ReactNode> = {
  courses: (
    <div style={PANEL}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: COBALT, letterSpacing: "0.06em", textTransform: "uppercase" }}>Chapter 3</div>
      <div style={{ fontFamily: UNBOUNDED, fontWeight: 700, fontSize: "15px", lineHeight: 1.35 }}>Why does one slow server slow everyone down?</div>
      <div style={{ display: "flex", gap: "6px" }}>
        {["Read", "Play", "Listen", "Prove"].map((w) => (
          <span key={w} style={{ background: "#FFFFFF", fontSize: "12px", fontWeight: 700, padding: "3px 7px" }}>{w}</span>
        ))}
      </div>
    </div>
  ),
  listen: (
    <div style={PANEL}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: COBALT, letterSpacing: "0.06em", textTransform: "uppercase" }}>Now playing</div>
      <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1.35 }}>Roles and expectations</div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span aria-hidden="true" style={{ width: "30px", height: "30px", background: COBALT, display: "grid", placeItems: "center" }}>
          <span style={{ width: 0, height: 0, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: `11px solid ${PAPER}`, marginLeft: "3px" }} />
        </span>
        <span aria-hidden="true" style={{ flex: 1, height: "6px", background: "#FFFFFF", position: "relative" }}>
          <span style={{ position: "absolute", inset: 0, width: "38%", background: YELLOW }} />
        </span>
        <span style={{ fontSize: "13px", fontWeight: 700 }}>1.5x</span>
      </div>
    </div>
  ),
  labs: (
    <div style={PANEL}>
      <svg viewBox="0 0 240 92" width="100%" role="img" aria-label="A lab board: users, a load balancer and two servers, one armed to break, and a Run button" style={{ display: "block" }}>
        <path d="M40 46 H86 M140 46 L166 24 M140 46 L166 68" stroke={INK} strokeWidth="2.5" fill="none" />
        <rect x="6" y="30" width="34" height="32" fill={COBALT} />
        <text x="23" y="50" textAnchor="middle" fontSize="10" fontWeight="700" fill={PAPER}>Users</text>
        <rect x="86" y="30" width="54" height="32" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <text x="113" y="50" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>Balancer</text>
        <rect x="166" y="10" width="48" height="28" fill="#FFFFFF" stroke={INK} strokeWidth="2" />
        <text x="190" y="28" textAnchor="middle" fontSize="10" fontWeight="700" fill={INK}>Server</text>
        <rect x="166" y="54" width="48" height="28" fill="#FFFFFF" stroke="#D92D20" strokeWidth="2" strokeDasharray="4 3" />
        <text x="190" y="72" textAnchor="middle" fontSize="10" fontWeight="700" fill="#B42318">Armed</text>
      </svg>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "13px", color: MUTED }}>Nothing breaks until you run</span>
        <span style={{ background: "#16794C", color: PAPER, fontSize: "13px", fontWeight: 700, padding: "5px 12px" }}>Run</span>
      </div>
    </div>
  ),
  practice: (
    <div style={PANEL}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: COBALT, letterSpacing: "0.06em", textTransform: "uppercase" }}>Today&apos;s question</div>
      <div style={{ fontWeight: 700, fontSize: "15px", lineHeight: 1.35 }}>Ten thousand people press Buy at once. What breaks first?</div>
      <div style={{ display: "flex", gap: "6px" }}>
        <span style={{ flex: 1, height: "22px", background: "#FFFFFF" }} />
        <span style={{ flex: 1, height: "22px", background: YELLOW }} />
        <span style={{ flex: 1, height: "22px", background: "#FFFFFF" }} />
      </div>
    </div>
  ),
  puzzles: (
    <div style={{ ...PANEL, alignItems: "center" }}>
      <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(4, 28px)", gap: "5px" }}>
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ height: "28px", background: i === 6 ? YELLOW : i === 1 || i === 9 ? COBALT : "#FFFFFF" }} />
        ))}
      </div>
      <span style={{ fontSize: "13px", color: MUTED }}>One new puzzle a day</span>
    </div>
  ),
  voice: (
    <div style={PANEL}>
      <div style={{ background: "#FFFFFF", padding: "10px 12px", fontSize: "13px", lineHeight: 1.4 }}>
        &quot;Welcome to System Design. How are you doing today? Should we get started?&quot;
      </div>
      <div aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: "3px", height: "24px" }}>
        {[8, 14, 20, 12, 22, 16, 9, 18, 24, 13, 7, 15, 20, 10].map((h, i) => (
          <span key={i} style={{ width: "5px", height: `${h}px`, background: COBALT }} />
        ))}
      </div>
    </div>
  ),
};

export function AreaShowcase() {
  return (
    <section id="areas" style={{ width: "100%" }}>
      <div className={s.pad} style={{ maxWidth: "1200px", margin: "0 auto", padding: "88px 24px", boxSizing: "border-box" }}>
        <h2 className={s.h2} style={{ margin: 0, fontFamily: UNBOUNDED, fontWeight: 700, fontSize: "36px", lineHeight: 1.15, letterSpacing: "-0.02em", maxWidth: "720px" }}>
          More than courses. Six ways to learn.
        </h2>
        <p style={{ margin: "16px 0 0", color: MUTED, maxWidth: "600px" }}>
          Read a course, listen to it on a walk, build in a lab, practise for five minutes, solve today&apos;s puzzle, or talk a topic through. Courses, audio and visual labs are open now.
        </p>
        <div className={s.rail} style={{ marginTop: "48px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: "16px" }}>
          {LEARN_AREAS.map((area) => (
            <Link
              key={area.id}
              href={area.href}
              style={{ border: `1px solid ${LINE}`, background: "#FFFFFF", color: INK, textDecoration: "none", display: "flex", flexDirection: "column" }}
            >
              {VISUALS[area.id]}
              <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                <div>
                  <StatusPill area={area} />
                </div>
                <h3 style={{ margin: 0, fontFamily: UNBOUNDED, fontWeight: 700, fontSize: "19px", letterSpacing: "-0.02em" }}>{area.name}</h3>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.5, color: MUTED }}>{area.tagline}</p>
                {area.id === "labs" ? (
                  <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", fontSize: "14px", lineHeight: 1.5 }}>
                    {LAB_KINDS.map((kind) => (
                      <li key={kind.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", borderTop: `1px solid ${LINE}`, padding: "5px 0" }}>
                        <span style={{ fontWeight: 700 }}>{kind.name}</span>
                        <span style={{ color: kind.status === "live" ? COBALT : MUTED }}>{kind.status === "live" ? "Open" : "Soon"}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {area.id === "listen" ? (
                  <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none", fontSize: "14px", lineHeight: 1.5 }}>
                    {[["Chapter audio", "Open"], ["Videos", "Soon"]].map(([name, state]) => (
                      <li key={name} style={{ display: "flex", justifyContent: "space-between", gap: "8px", borderTop: `1px solid ${LINE}`, padding: "5px 0" }}>
                        <span style={{ fontWeight: 700 }}>{name}</span>
                        <span style={{ color: state === "Open" ? COBALT : MUTED }}>{state}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: "28px", display: "flex", flexWrap: "wrap", gap: "14px" }}>
          <Link href="/labs/visual" style={{ display: "inline-block", background: COBALT, color: PAPER, textDecoration: "none", fontWeight: 700, padding: "14px 26px" }}>
            Try a visual lab
          </Link>
          <Link href="/learn" style={{ display: "inline-block", color: INK, textDecoration: "none", fontWeight: 700, padding: "12px 24px", border: `2px solid ${INK}` }}>
            See every area
          </Link>
        </div>
      </div>
    </section>
  );
}
