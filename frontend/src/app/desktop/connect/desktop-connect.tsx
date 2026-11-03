"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { XMark } from "@/components/brand/wordmark";
import {
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Laptop,
  Loader2,
  User,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

type Connection = { challenge: string; state: string; port: number };

export function DesktopConnect() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState<
    "loading" | "login" | "ready" | "busy" | "done" | "error"
  >("loading");
  const [message, setMessage] = useState("");
  const [loginHref, setLoginHref] = useState("/login");
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const challenge = params.get("challenge") || "";
    const state = params.get("state") || "";
    const port = Number(params.get("port"));

    if (
      !/^[A-Za-z0-9_-]{43}$/.test(challenge) ||
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535
    ) {
      queueMicrotask(() => {
        if (active) {
          setStatus("error");
          setMessage(
            "This authorization link is invalid or expired. Please click 'Sign in' inside the Edorax Desktop application to start a new connection."
          );
        }
      });
      return () => {
        active = false;
      };
    }

    const returnTo = `/desktop/connect?${new URLSearchParams({
      challenge,
      state,
      port: String(port),
    })}`;

    void fetch("/api/v1/auth/me", {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
      .then(async (response) => {
        if (!active) return;
        setConnection({ challenge, state, port });
        setLoginHref(`/login?redirectTo=${encodeURIComponent(returnTo)}`);
        if (response.status === 401) {
          setStatus("login");
          return;
        }
        const body = await response.json();
        if (!response.ok || !body.success) {
          throw new Error(
            body.message ||
              "Unable to verify your account session. Please refresh and try again."
          );
        }
        if (active) {
          setAccount(body.data?.user?.email || "Signed-in Learner");
          setStatus("ready");
        }
      })
      .catch((error) => {
        if (active) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Unable to connect to Edorax services. Please check your network connection."
          );
          setStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function connect() {
    if (!connection) return;
    setStatus("busy");
    setMessage("");

    try {
      const response = await fetch("/api/v1/auth/desktop/authorize", {
        method: "POST",
        credentials: "same-origin",
        signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge: connection.challenge }),
      });

      if (response.status === 401) {
        setStatus("login");
        return;
      }

      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(
          body.message ||
            "Unable to authorize desktop sign-in. Please try again."
        );
      }

      if (
        typeof body.data?.code !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.data.code)
      ) {
        throw new Error(
          "Received an unexpected sign-in response. Please retry."
        );
      }

      const callback = new URL(`http://127.0.0.1:${connection.port}/callback`);
      callback.searchParams.set("code", body.data.code);
      callback.searchParams.set("state", connection.state);
      setCallbackUrl(callback.toString());
      setStatus("done");

      // Redirect browser to loopback server on the desktop app
      window.location.assign(callback.toString());
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to complete connection. Please try again."
      );
      setStatus("error");
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      {/* Decorative gradient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-primary/10 blur-[100px]"
      />

      <section className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-xl sm:p-10">
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <XMark size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              Connect Edorax Desktop
            </h1>
            <p className="text-xs text-muted-foreground">
              Secure desktop workspace authorization
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-6">
          {/* Status: Loading */}
          {status === "loading" && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 className="size-10 animate-spin text-primary" />
              <p className="mt-4 text-base font-semibold text-foreground">
                Checking your account session…
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verifying authorization parameters with Edorax web service.
              </p>
            </div>
          )}

          {/* Status: Login required on web */}
          {status === "login" && (
            <div className="py-2">
              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-medium text-foreground">
                  Sign in required on the web
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  To securely connect your desktop application, sign in with
                  your Edorax account in this browser first.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href={loginHref}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-transform active:scale-[0.99] hover:opacity-95"
                >
                  <span>Sign in to Edorax</span>
                  <ArrowRight size={16} />
                </Link>
                <p className="text-center text-xs text-muted-foreground">
                  You’ll be redirected back here automatically once signed in.
                </p>
              </div>
            </div>
          )}

          {/* Status: Ready to connect or authorizing */}
          {(status === "ready" || status === "busy") && (
            <div className="py-2">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {account}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-ok/20 bg-ok-soft/30 p-3.5 text-xs text-foreground/90">
                <ShieldCheck
                  size={18}
                  className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                />
                <div className="leading-relaxed">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Security check:
                  </span>{" "}
                  Only authorize if you initiated this request by clicking
                  &ldquo;Sign in&rdquo; inside the Edorax Desktop application on
                  this machine.
                </div>
              </div>

              {connection && (
                <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Laptop size={13} />
                  <span>
                    Direct loopback transfer on port {connection.port}
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void connect()}
                disabled={status === "busy"}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all active:scale-[0.99] disabled:opacity-50"
              >
                {status === "busy" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Connecting desktop…</span>
                  </>
                ) : (
                  <>
                    <span>Authorize Desktop Application</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Status: Success (Done) */}
          {status === "done" && (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-8 ring-emerald-500/5 dark:text-emerald-400">
                <CheckCircle2 size={32} />
              </div>
              <h2 className="mt-4 text-xl font-bold text-foreground">
                Connected Successfully!
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Your account is now authenticated. Returning you to the Edorax
                Desktop application…
              </p>

              {callbackUrl && (
                <a
                  href={callbackUrl}
                  className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow hover:opacity-95"
                >
                  <span>Click if not redirected automatically</span>
                  <ExternalLink size={14} />
                </a>
              )}

              <p className="mt-4 text-xs text-muted-foreground/80">
                You can safely close this browser tab once the desktop app
                opens.
              </p>
            </div>
          )}

          {/* Status: Failure / Error */}
          {status === "error" && (
            <div className="py-2">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 ring-4 ring-rose-500/5 dark:text-rose-400">
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">
                    Sign-in Could Not Complete
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    The authorization handshake did not finish
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs leading-relaxed text-rose-900 dark:text-rose-200">
                {message ||
                  "An unexpected error occurred during desktop authorization."}
              </div>

              <div className="mt-5 space-y-2 rounded-xl border border-border bg-muted/30 p-3.5 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">
                  Troubleshooting steps:
                </p>
                <ol className="list-decimal space-y-1 pl-4 leading-relaxed">
                  <li>Return to the Edorax Desktop app.</li>
                  <li>Click &ldquo;Sign in&rdquo; again to get a fresh link.</li>
                  <li>
                    Ensure localhost / port connections are not blocked by a
                    firewall.
                  </li>
                </ol>
              </div>

              <div className="mt-6 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  <RefreshCw size={14} />
                  <span>Retry page reload</span>
                </button>
                <Link
                  href="/"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:opacity-95"
                >
                  <span>Return to Edorax Home</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
