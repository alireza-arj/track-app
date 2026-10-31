# Verification

Verified locally on October 31, 2026.

- Frozen Bun lockfile installation: passed.
- Prisma client generation and committed SQLite migration: passed, including repeated setup.
- Strict TypeScript check: passed.
- Vite production build, service-worker generation, and Bun server bundle: passed.
- Automated tests: **14 passed, 0 failed, 52 assertions**.
- The OpenAI SDK integration test uses a local HTTP fixture and verifies Responses request headers, model, context, output extraction, `store: false`, and output limit. It does not contact OpenAI.
- API tests use an actual isolated Prisma/SQLite database, not a database mock.

Real-browser checks against the built app:

- Custom category creation with color and icon; selecting that category for an activity.
- Create, edit, and accurate 24-hour start/end capture; persisted activity survives reload.
- Inline category creation preserves the unfinished activity title, time range and selected category.
- Overlapping time range is rejected without adding an activity.
- Restore flow validates and atomically replaces a journal; QA-created activities/categories were removed through that flow.
- Synthetic fixtures are confined to automated tests. The shipped journal has no demo-data generator or controls.
- Production service-worker update applies without clearing the journal.
- Front end stays usable with the AI process stopped; coach shows an honest offline state. Restarting the API returns configuration status correctly.
- App and navigation fit a 320px mobile viewport without horizontal overflow. UI also reviewed at 390px.
- Native scrolling remains enabled while document and sheet scrollbars are hidden.

Still environment-dependent:

- The owner will set the OpenAI key, model and local connection token. A paid/provider-backed response has not been requested.
- Real iPhone/Android keyboard, hardware gestures, safe areas, PWA installation, and a deployed HTTPS front end → local server connection require checking on the intended phone/browser/network.
- Plain LAN HTTP serves the app but does not activate PWA offline installation; use HTTPS for a deployed phone app.

The current browser preview and fresh installations contain no seeded activities. A compatibility migration removes only known demo entries from earlier previews, preserving user-created entries and categories.
