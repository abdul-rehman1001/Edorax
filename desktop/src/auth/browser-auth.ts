import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { backendBase } from '../api';
import type { Result } from '../domain/catalog';

type SignInResult = Result<{ signedIn: true }>;
export function createBrowserAuth(
  webBase: string,
  exchange: (code: string, verifier: string) => Promise<SignInResult>,
  openBrowser: (url: string) => Promise<unknown>,
) {
  let cancelCurrent: (() => void) | undefined;
  return {
    cancel() {
      cancelCurrent?.();
    },
    start(): Promise<SignInResult> {
      if (cancelCurrent)
        return Promise.resolve({
          ok: false,
          code: 'BUSY',
          message: 'A browser sign-in is already in progress.',
        });
      return new Promise((resolve) => {
        const state = randomBytes(32).toString('base64url');
        const verifier = randomBytes(32).toString('base64url');
        const challenge = createHash('sha256')
          .update(verifier)
          .digest('base64url');
        let completed = false;
        let exchanging = false;
        const finish = (result: SignInResult) => {
          if (completed) return;
          completed = true;
          clearTimeout(timeout);
          cancelCurrent = undefined;
          server.close();
          server.closeIdleConnections();
          resolve(result);
        };
        const server = createServer(async (request, response) => {
          const address = server.address();
          if (
            !address ||
            typeof address === 'string' ||
            request.headers.host !== `127.0.0.1:${address.port}` ||
            request.method !== 'GET'
          ) {
            response.writeHead(400).end();
            return;
          }
          const url = new URL(
            request.url || '/',
            `http://127.0.0.1:${address.port}`,
          );
          const code = url.searchParams.get('code') || '';
          if (
            url.pathname !== '/callback' ||
            url.searchParams.get('state') !== state ||
            !/^[A-Za-z0-9_-]{43}$/.test(code)
          ) {
            response.writeHead(400).end('Invalid desktop sign-in request.');
            return;
          }
          if (exchanging || completed) {
            response
              .writeHead(409)
              .end('This sign-in request is already being processed.');
            return;
          }
          exchanging = true;
          // Only a one-time code crosses the browser URL, never a session token.
          const result = await exchange(code, verifier).catch(
            (): SignInResult => ({
              ok: false,
              code: 'CONNECTION_ERROR',
              message: 'Could not complete sign-in. Please try again.',
            }),
          );
          response.writeHead(result.ok ? 200 : 400, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
            'Content-Security-Policy':
              "default-src 'none'; style-src 'unsafe-inline'",
          });
          response.end(renderAuthCallbackHtml(result));
          finish(result);
        });
        const timeout = setTimeout(() => {
          if (!exchanging)
            finish({
              ok: false,
              code: 'TIMEOUT',
              message: 'Browser sign-in timed out. Please try again.',
            });
        }, 180_000);
        cancelCurrent = () =>
          finish({
            ok: false,
            code: 'CANCELLED',
            message: 'Browser sign-in cancelled.',
          });
        server.on('error', () =>
          finish({
            ok: false,
            code: 'CALLBACK_ERROR',
            message:
              'Could not start the local sign-in callback. Please try again.',
          }),
        );
        server.listen(0, '127.0.0.1', () => {
          try {
            const address = server.address();
            if (!address || typeof address === 'string')
              throw new Error('No callback port');
            const url = new URL('/desktop/connect', backendBase(webBase));
            url.search = new URLSearchParams({
              state,
              challenge,
              port: String(address.port),
            }).toString();
            void openBrowser(url.toString()).catch(() =>
              finish({
                ok: false,
                code: 'BROWSER_ERROR',
                message:
                  'Could not open your browser. Check your default browser and try again.',
              }),
            );
          } catch {
            finish({
              ok: false,
              code: 'CONFIG_ERROR',
              message: 'Check the BUILDMENT_WEB_URL configuration.',
            });
          }
        });
      });
    },
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderAuthCallbackHtml(result: SignInResult): string {
  const isOk = result.ok;
  const title = isOk
    ? 'You’re Connected to Edorax Desktop'
    : 'Sign-In Could Not Complete';
  const statusBadge = isOk ? 'Authentication Verified' : 'Authorization Error';
  const message = isOk
    ? 'Your session has been securely established. You can now close this browser window and return to your learning workspace.'
    : escapeHtml(
        result.message ||
          'The sign-in request was cancelled, timed out, or the authorization code expired.',
      );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} · Edorax</title>
  <style>
    :root {
      --bg: #f6f7fb;
      --card-bg: #ffffff;
      --card-border: #dce0f2;
      --text: #0a0f2c;
      --muted: #46507a;
      --primary: #2434e0;
      --status-color: ${isOk ? '#059669' : '#e11d48'};
      --status-bg: ${isOk ? 'rgba(5, 150, 105, 0.1)' : 'rgba(225, 29, 72, 0.1)'};
      --status-border: ${isOk ? 'rgba(5, 150, 105, 0.25)' : 'rgba(225, 29, 72, 0.25)'};
      --box-shadow: 0 10px 25px -5px rgba(10, 15, 44, 0.08), 0 8px 10px -6px rgba(10, 15, 44, 0.04);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0a0f2c;
        --card-bg: #12193e;
        --card-border: rgba(246, 247, 251, 0.12);
        --text: #f6f7fb;
        --muted: #aab3de;
        --primary: #7a8bff;
        --status-color: ${isOk ? '#34d399' : '#fb7185'};
        --status-bg: ${isOk ? 'rgba(52, 211, 153, 0.12)' : 'rgba(251, 113, 133, 0.12)'};
        --status-border: ${isOk ? 'rgba(52, 211, 153, 0.28)' : 'rgba(251, 113, 133, 0.28)'};
        --box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
      }
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      line-height: 1.5;
    }
    .card {
      width: 100%;
      max-width: 480px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 40px 32px;
      box-shadow: var(--box-shadow);
      text-align: center;
    }
    .icon-container {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: var(--status-bg);
      border: 1.5px solid var(--status-border);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--status-color);
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 4px 12px;
      border-radius: 9999px;
      background: var(--status-bg);
      color: var(--status-color);
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
      margin-bottom: 10px;
    }
    p.message {
      font-size: 14px;
      color: var(--muted);
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .steps-box {
      text-align: left;
      background: var(--status-bg);
      border: 1px solid var(--status-border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      font-size: 13px;
      color: var(--text);
    }
    .steps-box strong {
      display: block;
      margin-bottom: 8px;
    }
    .steps-box ol {
      padding-left: 20px;
      color: var(--muted);
      line-height: 1.6;
    }
    .footer-note {
      font-size: 12px;
      color: var(--muted);
      border-top: 1px solid var(--card-border);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-container">
      ${
        isOk
          ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>`
          : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>`
      }
    </div>
    <span class="badge">${escapeHtml(statusBadge)}</span>
    <h1>${escapeHtml(title)}</h1>
    <p class="message">${escapeHtml(message)}</p>

    ${
      !isOk
        ? `<div class="steps-box">
             <strong>Next steps:</strong>
             <ol>
               <li>Return to the Edorax Desktop application.</li>
               <li>Click <em>Sign in</em> to request a fresh sign-in link.</li>
               <li>Authorize the connection in your browser.</li>
             </ol>
           </div>`
        : ''
    }

    <div class="footer-note">
      ${
        isOk
          ? 'You can safely close this browser tab.'
          : 'Edorax Desktop · Learning Workspace'
      }
    </div>
  </div>
</body>
</html>`;
}
