import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "all", label: "Explore courses", href: "/catalog" },
  { id: "mine", label: "My courses", href: "/my-courses" },
] as const;

/** Two links that switch between the whole catalog and the learner's own courses. */
export function CoursesTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Courses" className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={tab.id === active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-md border-2 px-5 text-base font-bold outline-none transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
            tab.id === active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input bg-card text-foreground hover:border-primary"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
