# Daylog

A mobile-first, English time journal. Log your real day, understand a seven-day window, and talk to an OpenAI coach when your local server is on.

## Run

Requires **Bun 1.3+** and **Node.js 22.12+ or 24+** (Prisma CLI / Vite tooling).

```sh
bun install --frozen-lockfile
bun run setup
bun run build:all
bun run start
```

Open **http://localhost:4380**. The web server listens on your local network; the AI API defaults to **127.0.0.1:3080**. `setup` creates `apps/server/.env` if missing, generates the Prisma client, and applies committed migrations. It never overwrites an existing `.env`.

Independent processes:

```sh
bun run start:web     # built static front end, works without the AI process
bun run start:server  # start the Elysia AI process only when needed
```

Development: `bun run dev` (front end: **http://localhost:5180**). Both the Vite development server and the production static server proxy `/api` to the local API. To override the static-server ports use `WEB_PORT` and `API_PORT`; match `PORT` in the server `.env`.

The local static server serves only `apps/web/dist`, adds security / caching headers, and returns an explicit offline error for unreachable API requests. Do not use `vite preview` as your production web server.

## Deploy to Vercel

Import this GitHub repository into Vercel with **Root Directory = the repository root (`./`)**. The committed `vercel.json` configures the deployment:

| Setting          | Value                           |
| ---------------- | ------------------------------- |
| Framework Preset | Vite                            |
| Install Command  | `bun install --frozen-lockfile` |
| Build Command    | `bun run build:web`             |
| Output Directory | `apps/web/dist`                 |
| Node.js          | 24.x (set in `package.json`)    |

Keep the Root Directory at the repository root, not `apps/web`, because this is a Bun workspace with shared TypeScript code. The config overrides dashboard build/install/output commands. Redeploy the **latest commit on `main`**, rather than retrying the original failed commit.

No Vercel environment variables are required. **Do not add the OpenAI key or connection token as `VITE_*` variables.** `bun run build` is also a frontend-only build, so the previous dashboard default works. Frontend type checking excludes the local server, tests, and generated Prisma client. A fresh checkout builds without running `setup`, creating a database, generating Prisma, or configuring OpenAI.

Vercel hosts the web app and its offline shell. Activities, categories, backups, and seven-day statistics work with the AI server off. The Elysia/Prisma/SQLite AI service **continues to run on your computer**, as designed; this deployment does not add Vercel Functions or a cloud database.

For the coach on the hosted app:

1. Configure `apps/server/.env` on your computer with the OpenAI key, model, and a long random `DAYLOG_TOKEN`.
2. Add your exact stable Vercel origin (for example, `https://your-project.vercel.app`) to the comma-separated `ALLOWED_ORIGINS`. Each preview URL is a different origin; prefer the stable production URL for your journal.
3. Run `bun run setup`, `bun run build:server`, then `bun run start:server` when needed. Make the API reachable through a trusted private HTTPS endpoint for your device/network, keeping token authentication enabled.
4. In the hosted app's **Settings → Local AI server**, enter that HTTPS origin (without `/api`) and the matching connection token. Use **Save & test connection**.

Leaving the address blank uses the included proxy only when running Daylog locally. A Vercel page cannot reach your computer through Vercel's `localhost`. Plain HTTP LAN endpoints may be blocked from an HTTPS page; use a private HTTPS connection for reliable phone access. Stop the local AI server when finished; journaling remains available.

The deployment also configures SPA navigation, security headers, immutable hashed assets, and revalidation of the app shell and service worker. `/api/*` is excluded from SPA rewrites, and the client rejects HTML/error responses rather than treating them as a working AI connection.

See [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json) and [Vite deployments](https://vercel.com/docs/frameworks/frontend/vite).

## OpenAI connection

Edit **apps/server/.env**:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_MODEL=your-enabled-model-id
DAYLOG_TOKEN=a-long-random-password
```

Generate a token if useful: `bun -e 'console.log(crypto.randomUUID()+crypto.randomUUID())'`. Then restart the API and enter the same **connection token** in **Settings → Local AI server**. Leave the server address empty when using the included proxy. No OpenAI key is ever put in a Vite environment variable or the browser bundle.

Optional `OPENAI_BASE_URL` is configured **only on the server**. The implementation uses the official OpenAI SDK's **Responses API**, `store: false`, a bounded output, a 45-second timeout, and no automatic provider retries. Ensure the chosen model and any proxy support Responses. Actual provider calls were not made during development because the owner will configure the key and model.

The coach receives the **selected seven-day date range**, activity titles, notes, category names, the device timezone, the question, and up to 12 recent chat messages. It is instructed to treat journal content as data, distinguish evidence from assumptions, and avoid judging unlogged time. No automatic tracking or automatic calendar changes occur. A conversation may contain earlier context from past questions; use **Start a new conversation** to start fresh.

Prisma + SQLite store request IDs, hashes, status and completed AI answers on your computer. Raw journal snapshots and questions are not retained in the server DB. Journal data and the displayed conversation stay in the browser. Completed identical request IDs are replayed without another provider call. Pending requests after an abrupt crash remain blocked to avoid accidentally making a duplicate call; send a new message if necessary. This is not a provider-level guarantee against duplicate billing after a process or network failure.

The API allows only explicitly listed origins, requires the connection token for configured use, limits payload size, allows at most 2 concurrent coach calls / 30 new calls per hour per server process, and validates the context before use. It is a **single-owner local service**, not a public multi-user backend. Keep the API private; do not expose port 3080 to the internet.

## Phone and static hosting

On the same Wi-Fi, open `http://YOUR_COMPUTER_LAN_IP:4380`. Setup adds the machine's current IPv4 LAN origins to `ALLOWED_ORIGINS`; update this list if your address changes. With the included web proxy, keep the API bound to loopback and leave the app's server-address field blank.

For a static host, deploy **apps/web/dist** at a **stable HTTPS origin**. The app can run without its API. In Connection settings enter an address for your computer that the phone can reach. Direct LAN access requires `HOST=0.0.0.0`, the exact front-end origin in `ALLOWED_ORIGINS`, the connection token, and browser/network permission. HTTPS-to-HTTP LAN access varies across browsers; a private trusted HTTPS endpoint is the more portable option. Never bypass browser certificate warnings. Test this connection on your actual phone before relying on it away from your desk.

The service worker / install / offline reload behavior requires **HTTPS or localhost**. Plain HTTP on a LAN lets you use the app while its web server is available, but does **not** enable full PWA offline installation. Browser/device storage is independent: opening the same app on a second device or another origin does not sync data. On an HTTPS phone deployment, the initial page load must happen online before offline reloads can work.

## What is included

- English interface, phone-first layout, light/dark system appearance, safe-area support, touch feedback and accessible forms.
- Local-date day picker, full 24-hour gaps, create/edit/delete with undo, notes, overlap validation and midnight handling. Overnight entries are split over two dates.
- Custom category names, colors and icons, inline category creation without losing the activity draft, renaming and archiving. Historic entries keep their category. Names are unique without case sensitivity. At least one category stays active.
- Real seven-day allocation, category totals, days with data, and explicit missing time. No invented scores or productivity claims.
- IndexedDB transactions, cross-tab change notifications, best-effort persistent-storage request, full JSON backup export and validated replacement import. A bad backup is rejected before data changes.
- The journal starts empty. No demo activities, seeded history, or sample-data controls are shipped.
- Local conversation history, setup/offline/provider errors, retry support, and request idempotency.
- Installable offline web shell, user-controlled update prompt, and prompt/save flows that do not require the AI server.

**Keep backups.** Storage persistence is a browser permission, not a guarantee. Clearing site data, changing origin, private browsing, or some storage-pressure conditions can remove browser data. Backups contain personal journal and conversation content; store them privately. Connection tokens are not included in backups.

## Verify and maintain

```sh
bun run typecheck
bun run test
bun run build:all
```

For the standalone web app or CI deployment, use `bun run build` (or `bun run build:web`). For a local full-stack build, `bun run build:all` generates Prisma, bundles the API, checks all authored TypeScript, and builds the web app. Database migration remains an explicit `bun run setup` step.

Tests cover calendar arithmetic, overlaps/adjacency, midnight, archived categories, backup integrity and seven-day contexts, plus Elysia authentication, origin checks, setup states, validation, real Prisma/SQLite persistence, identical-request replay, and provider failure/retry. Provider behavior is mocked in automated tests; no API credits are spent.

Use `bun run format` to format authored source. Generated Prisma client and build output are ignored. Commit `bun.lock` and `prisma/migrations`; rerun setup when installing on another computer. Back up the server's SQLite file before migrations if completed coach replies matter; the primary journal remains in the browser.

Browser verification covers the real app in mobile viewport sizes. Real iPhone/Android keyboard, safe areas, touch gestures and install behavior still need a hardware check.

## Layout

```text
apps/web/             Vite + React + TypeScript, IndexedDB, PWA
apps/server/          Bun + Elysia + OpenAI SDK + Prisma + SQLite
packages/shared/      TypeScript domain model and Zod validation
scripts/              TypeScript setup and process/static-server commands
tests/                Domain and real SQLite API tests
```

Documentation used: [OpenAI Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Prisma SQLite](https://docs.prisma.io/docs/prisma-orm/quickstart/sqlite), [Elysia CORS](https://elysiajs.com/plugins/cors), [browser local-network access](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access).
