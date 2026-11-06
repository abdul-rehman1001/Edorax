import Link from "next/link";
import { canAccessLearnSurface, getSessionUser } from "@/server/auth/guards";
import { getActiveSurface } from "@/server/auth/surface";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

// The catalog is public: anyone can browse courses, and only enrolling needs an account.
// Signed-in learners inherit the persistent workspace shell from the shared (learn) layout.
export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const learner =
    user && (user.role === "ADMIN" || user.emailVerified) && canAccessLearnSurface(user) && (await getActiveSurface(user.role)) === "learn";

  if (user && learner) return children;

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
                My learning
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
