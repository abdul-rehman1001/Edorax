"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LEARN_AREAS, areaForPath } from "@/lib/learn-areas";
import { cn } from "@/lib/utils";

/**
 * One row of links across every learner area. It sits at the top of each area page,
 * so moving between Courses, Labs, Practice, Puzzles and Voice is one tap on a phone too.
 */
export function AreaTabs() {
  const pathname = usePathname();
  const current = areaForPath(pathname);
  return (
    <nav aria-label="Learning areas" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-2">
        <li>
          <Link
            href="/learn"
            aria-current={pathname === "/learn" ? "page" : undefined}
            className={tabClass(pathname === "/learn")}
          >
            All areas
          </Link>
        </li>
        {LEARN_AREAS.map((area) => {
          const active = current?.id === area.id;
          return (
            <li key={area.id}>
              <Link href={area.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                {area.short}
                {area.status === "coming-soon" ? (
                  <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-bold", active ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground")}>
                    Soon
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function tabClass(active: boolean) {
  return cn(
    "inline-flex min-h-11 items-center gap-2 rounded-md border-2 px-4 text-base font-bold outline-none transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
    active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-primary",
  );
}
