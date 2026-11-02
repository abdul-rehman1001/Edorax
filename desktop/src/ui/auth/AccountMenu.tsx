import { useEffect, useState } from 'react';
import { UserRound, LogOut } from 'lucide-react';
import type { LearnerProfile } from '../../../../server/src/shared/api/learner';
import type { Session } from './useSession';
export function AccountMenu({ session }: { session: Session }) {
  const { signedIn, authBusy, changeSession } = session;
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  useEffect(() => {
    if (!signedIn) {
      setProfile(null);
      return;
    }
    let alive = true;
    void window.buildment
      .learnerProfile()
      .then((result) => {
        if (alive && result.ok) setProfile(result.data);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [signedIn]);
  return (
    <div className="relative shrink-0">
      {signedIn ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2.5 py-1.5 hover:bg-muted text-xs font-medium [&::-webkit-details-marker]:hidden">
            <UserRound size={16} /> Profile
          </summary>
          <div className="absolute right-0 top-12 w-64 rounded-xl border border-border bg-card p-3 shadow-lg">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-semibold">
                {profile?.name || profile?.email || 'Edorax account'}
              </p>
              {profile?.email && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {profile.email}
                </p>
              )}
            </div>
            <button
              disabled={authBusy}
              onClick={() => void changeSession(false)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </details>
      ) : (
        <button
          disabled={authBusy}
          onClick={() => void changeSession(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          <UserRound size={16} /> {authBusy ? 'Connecting…' : 'Sign in'}
        </button>
      )}
    </div>
  );
}
