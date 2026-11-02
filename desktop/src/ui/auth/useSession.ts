import { useEffect, useRef, useState } from 'react';
export function useSession() {
  const [signedIn, setSignedIn] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authRevision, setAuthRevision] = useState(0);
  const [authChecked, setAuthChecked] = useState(false);
  const authPending = useRef(false);
  useEffect(() => {
    let alive = true;
    const finish = () => {
      if (alive) setAuthChecked(true);
    };
    const check = window.buildment.authStatus?.();
    if (!check) {
      finish();
      return;
    }
    void check
      .then((result) => {
        if (!alive || !result.ok || !result.data.signedIn) return;
        setSignedIn(true);
        setAuthRevision((value) => value + 1);
      })
      .catch(() => {})
      .finally(finish);
    return () => {
      alive = false;
    };
  }, []);
  async function changeSession(signingIn: boolean) {
    if (authPending.current) return;
    authPending.current = true;
    setAuthBusy(true);
    setAuthError('');
    try {
      const result = await (signingIn
        ? window.buildment.signIn()
        : window.buildment.signOut());
      if (result.ok || (!result.ok && result.code === 'LOCAL_SIGN_OUT')) {
        setSignedIn(signingIn);
        setAuthRevision((value) => value + 1);
      }
      if (!result.ok && result.code !== 'CANCELLED')
        setAuthError(result.message);
    } catch {
      setAuthError('Could not connect to your account. Please try again.');
    } finally {
      authPending.current = false;
      setAuthBusy(false);
    }
  }
  return {
    signedIn,
    setSignedIn,
    authBusy,
    authError,
    setAuthError,
    authRevision,
    changeSession,
  };
}
export type Session = ReturnType<typeof useSession>;
