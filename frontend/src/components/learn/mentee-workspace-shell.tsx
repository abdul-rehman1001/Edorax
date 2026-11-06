"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenText, CircleHelp, Compass, Home, Trophy, TrendingUp, type LucideIcon } from "lucide-react";
import { WorkspaceAccountMenu } from "@/components/workspace/workspace-account-menu";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { helpUiCopy } from "@/shared/lib/help-ui-copy";
import type { InstructorAccessView } from "@/shared/lib/instructor-access";

type LearnerNavItem = {
  label: string;
  mobileLabel?: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  count?: number;
};

export function MenteeWorkspaceShell({
  children,
  user,
  instructorAccess,
  assignedCourses,
  openHelpRequests,
  pendingReviews,
  signOutAction,
}: {
  children: ReactNode;
  user: { name?: string | null; email?: string | null; role?: string };
  instructorAccess: InstructorAccessView;
  assignedCourses: number;
  openHelpRequests: number;
  pendingReviews: number;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();

  // Course overviews and chapter readers have their own focused navigation. The wrapper keeps them
  // full width: as bare children of the layout's flex column, their mx-auto roots shrink to fit the
  // widest line, which made phones zoom out.
  if (pathname.startsWith("/courses/")) return <div className="w-full">{children}</div>;

  const items: LearnerNavItem[] = [
    { label: "Home", href: "/dashboard", icon: Home, active: pathname === "/dashboard" },
    {
      label: "My courses",
      href: "/my-courses",
      icon: BookOpenText,
      active: pathname === "/my-courses",
      count: assignedCourses,
    },
    { label: "Explore courses", mobileLabel: "Explore", href: "/catalog", icon: Compass, active: pathname.startsWith("/catalog") },
    { label: "Progress", href: "/progress", icon: TrendingUp, active: pathname === "/progress" },
    { label: "Leaderboard", mobileLabel: "Ranks", href: "/leaderboard", icon: Trophy, active: pathname === "/leaderboard" },
    {
      label: helpUiCopy.learnerNav,
      mobileLabel: "Questions",
      href: "/my-questions",
      icon: CircleHelp,
      active: pathname.startsWith("/my-questions"),
      count: openHelpRequests,
    },
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <Link href="/dashboard" aria-label="Edorax home" className="text-foreground">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <WorkspaceAccountMenu current="learn" user={user} instructorAccess={instructorAccess} signOutAction={signOutAction} compact />
        </div>
      </header>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
          <Link href="/dashboard" aria-label="Edorax home" className="inline-flex text-foreground outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow">
            <Logo size="sm" />
          </Link>
          <NotificationBell />
        </div>

        <nav aria-label="Learner workspace" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3.5 text-base outline-none transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow",
                  item.active ? "bg-secondary font-bold text-primary" : "font-medium text-foreground hover:bg-muted"
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.count ? <Count value={item.count} /> : null}
              </Link>
            );
          })}
          {pendingReviews > 0 ? (
            <p className="px-3.5 pt-3 text-sm leading-5 text-muted-foreground">
              {pendingReviews} submission{pendingReviews === 1 ? "" : "s"} awaiting review
            </p>
          ) : null}
        </nav>

        <div className="shrink-0 border-t border-border p-2">
          <WorkspaceAccountMenu current="learn" user={user} instructorAccess={instructorAccess} signOutAction={signOutAction} />
        </div>
      </aside>

      <main className="min-h-dvh pb-20 lg:pb-0 lg:pl-60">{children}</main>

      <nav aria-label="Learner workspace" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "relative flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[11px] leading-3 outline-none focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-yellow",
                item.active ? "font-bold text-primary" : "font-medium text-muted-foreground"
              )}
            >
              <Icon className="size-[22px]" aria-hidden />
              <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
              {item.count ? (
                <span className="absolute right-[calc(50%-24px)] top-2 grid size-2.5 rounded-full bg-brand-yellow" aria-label={`${item.count} open`} />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span className="min-w-6 rounded-sm bg-secondary px-1.5 py-0.5 text-center text-xs font-bold tabular-nums text-foreground">
      {value > 99 ? "99+" : value}
    </span>
  );
}
