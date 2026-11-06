# Buildment desktop

Electron Forge + React + TypeScript + Tailwind CSS. Includes the public course catalog, dedicated course previews, public curriculum outlines, browser sign-in, and a branded startup loader. No IDE or labs are included yet.

From the repository root:

```powershell
pnpm --dir desktop install
# Start your configured backend separately:
pnpm --dir server dev
# In separate terminals:
pnpm --dir frontend dev
pnpm --dir desktop start
```

The backend defaults to `http://localhost:4000`. To connect to another deployment, set its origin before starting the app:

```powershell
$env:BUILDMENT_API_URL = 'https://your-api.example.com'
npm --prefix desktop start
```

Remote backends must use HTTPS. The API must implement `GET /api/v1/catalog`, returning the existing Buildment success envelope. The app imports only shared API types from `server/`; it does not bundle backend runtime code. Run install/build commands from this repository checkout.

Sign-in opens the default browser (Chrome if configured as default). The web app defaults to `http://localhost:3000`; configure `BUILDMENT_WEB_URL` alongside `BUILDMENT_API_URL` for other deployments. Deploy the included web connection page and backend desktop authorization/exchange endpoints together. A short-lived, single-use code with proof verification returns through a loopback callback. Session tokens remain in Electron main-process memory, and closing the app requires signing in again. No database migration is required.

Course requests run in Electron's main process over a narrowly scoped preload bridge. Renderer Node integration is disabled. There are no credentials, fixture courses, or secrets in the application. Cover images use remote HTTPS URLs or local HTTP URLs; missing images show a decorative placeholder.

```powershell
npm --prefix desktop run typecheck
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run test:ui
npm --prefix desktop run package
```

On Windows, after packaging, `cd desktop` and run `npx tsx tests/desktop-smoke.mts` to check the packaged application's real preload and HTTP connection against a temporary local test API. It closes the app when finished.

UI tests use isolated backend fixtures through a mocked desktop bridge and require a locally installed Chrome. They do not validate a live backend. Packaging produces an application in `desktop/out/`; `npm --prefix desktop run make` creates a platform-specific distributable. Signing and publishing are not configured.

## Source organization

- `src/api/`: backend clients; session tokens stay in the main process.
- `src/ui/layout/`: workspace header and sidebar.
- `src/ui/auth/`: session hook, account menu, and sign-in prompt.
- `src/ui/courses/`: catalog and preview views, course cards, summary, and curriculum.
- `src/ui/App.tsx`: composes views and preserves catalog filters and navigation state.

Keep backend calls in the API clients. Pass data and callbacks into display components; keep shared session state in the session hook.

Support files live in src/auth/ (browser sign-in), src/domain/ (course types and helpers), src/types/ (build declarations), and src/styles/ (CSS). The root keeps only Electron and renderer entry points: main.ts, preload.ts, renderer.tsx, and startup.ts.

Start learning opens a native React reader in the desktop app, with course curriculum replacing the catalog sidebar. Lessons, quizzes, grading, and progress use the backend through authenticated IPC. Browser sign-in still uses BUILDMENT_WEB_URL; reading does not embed the website. MDX is parsed as literal data without executing expressions. Callouts, diagrams, visual walkthroughs, media, roadmaps, file trees, request traces, and interactive canvases use the same rendering components as web.

Reader state, parsing, and IPC adapters live in src/ui/learning/ and src/learning/. Course-block renderers live in ../packages/learning-ui and are registered through its shared src/lesson-blocks.tsx map, also used by web. This includes labs, course content blocks, exercises, Checklist, and Learning Log. Keep desktop API/IPC work in host adapters and use the package components for block presentation and interaction. Both apps install the package as @buildment/learning-ui; after editing it, run install in each app to refresh its local snapshot. Desktop quizzes use the shared integrity hook through an IPC transport: focus and clipboard events, fullscreen reminders, and optional camera snapshots follow the web rules. Signals are advisory mentor notes and never automatically fail a learner. Snapshot capture requires consent; screenshot detection is best effort.

## Mascot

Desktop shows the same mascot as web. The player and runtime are shared from `@buildment/learning-ui/mascot/*`, the API decides each reaction, and `src/ui/mascot/mascot.ts` is the adapter that connects them over IPC. Screens only call `trackMoment` or `useMascot`, and report where the learner is with `setMascotPath`. Live notifications are read in the main process, so the session token never reaches the renderer. See [docs/13-engagement.mdx](../docs/13-engagement.mdx).

Electron Forge needs Node 22.13 or newer. Run the UI tests with `--workers=1`: several specs race Vite's first load when run in parallel.

## Enrolled course overview

After enrollment, desktop uses the same `CourseOverviewContent` and variant picker as web from `@buildment/learning-ui`. The learner overview endpoint supplies progress, pending reviews, chapter checkpoints and locks, resume links, and course tracks. Keep presentation changes in the shared package; desktop's `EnrolledCourse` adapter owns IPC requests and native lesson navigation. Project showcase images use the configured `BUILDMENT_WEB_URL` origin. Variant and specialisation choices use narrowly scoped `learning:update-track` IPC calls; credentials remain in the main process.

For the hosted service on macOS:

```sh
BUILDMENT_API_URL=https://buildment-eca06ffd3e8f.herokuapp.com \
BUILDMENT_WEB_URL=https://edorax.com npm --prefix desktop start
```

The reader sidebar and heading outline are shared with web. Desktop bundles DM Sans, Unbounded, and JetBrains Mono locally, so typography does not require a font-network request. HTTPS links in lesson prose open in the system browser; same-course chapter links stay in the desktop reader.

## Edorax branding

The desktop name is Edorax. Sidebar/startup branding and packaged/Dock icons use `frontend/public/logo.svg`, the web app's current mark. After a web logo change, run `node desktop/scripts/sync-brand.mjs` on macOS with frontend dependencies installed to regenerate the SVG copy and PNG/ICNS/ICO assets. Restart Electron to refresh the native app name and Dock icon.
