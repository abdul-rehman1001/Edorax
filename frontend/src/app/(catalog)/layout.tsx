import Link from "next/link";
import type { LearnerWorkspace } from "@/shared/api/learner";
import { canAccessLearnSurface, getSessionUser } from "@/server/auth/guards";
import { getActiveSurface } from "@/server/auth/surface";
import { serverApiFetch } from "@/lib/api-server";
import { signOutAction } from "@/server/auth/actions";
import { MenteeWorkspaceShell } from "@/components/learn/mentee-workspace-shell";
import { AppActivityTracker } from "@/components/app-activity-tracker";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { MascotPlayer } from "@/components/mascot/mascot-player";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

// The catalog is public: anyone can browse courses, and only enrolling needs an account.
// Signed-in learners still see it inside their workspace, with the same tabs and tracking.
export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const learner =
    user && (user.role === "ADMIN" || user.emailVerified) && canAccessLearnSurface(user) && (await getActiveSurface(user.role)) === "learn";

  if (user && learner) {
    const workspace = await serverApiFetch<LearnerWorkspace>("/api/v1/learner/workspace");
    return (
      <div className="flex min-h-full flex-1 flex-col bg-background">
        <AppActivityTracker />
        <NotificationCenter />
        <MascotPlayer />
        <MenteeWorkspaceShell
          user={user}
          instructorAccess={workspace.instructorAccess}
          assignedCourses={workspace.assignedCourses}
          pendingReviews={workspace.pendingReviews}
          openHelpRequests={workspace.openHelpRequests}
          signOutAction={signOutAction}
        >
          {children}
        </MenteeWorkspaceShell>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-card">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="Edorax home" className="text-foreground">
            <Logo size="sm" />
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-3">
            <Link href="/catalog" className="hidden px-2 py-3 text-base font-bold text-foreground sm:inline">
              Explore courses
            </Link>
            {user ? (
              <Link href="/my-courses" className={buttonVariants({ variant: "outline" })}>
                My courses
              </Link>
            ) : (
              <>
                <Link href="/login?redirectTo=/catalog" className="px-2 py-3 text-base font-bold text-foreground">
                  Sign in
                </Link>
                <Link href="/signup?redirectTo=/catalog" className={buttonVariants()}>
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="w-full flex-1">{children}</main>
    </div>
  );
}
