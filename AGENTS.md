# AGENTS.md

## Project overview

**RUNRED** — an online-running / races app (Hebrew, RTL, red/white/black theme). Everyone runs from their own location; races use a collective start and identify runners by GPS.

Three pages, one Express backend:

- **Public** (`/`, `public/index.html` + `app.js`) — lists upcoming races (distance, price, prizes 🥇🥈🥉, start mode, "how to join") and a checkout flow (payment method Apple Pay / credit card / other, discount code, points redemption).
- **Admin** (`/admin.html` + `admin.js`) — password-gated; create/delete races (with entry cost, prizes for places 1-3, collective vs. free start), manage discount codes, and view each race's paid registrations.
- **Live run** (`/run.html` + `run.js`) — identify by email, start a live run (GPS + heart-rate + step-cadence telemetry), server-side anti-cheat validation, earn points toward daily goals, and a Strava-like live map (canvas radar) of nearby runners.
- **Backend** — Node.js + Express in `server.js`; data persisted to `data/db.json` (created at runtime). No extra services/DB.

Legacy files unrelated to the app: `README.md` (HTML marketing landing page despite the `.md` extension) and `harel landing.pdf`. They need no build.

## Cursor Cloud specific instructions

- **Run:** `npm run dev` (uses `node --watch` for hot reload) or `npm start`. Listens on `http://localhost:3000` (override with `PORT`).
- **Admin access:** password is checked against the `ADMIN_KEY` env var (dev default `admin123`); the browser sends it via the `x-admin-key` header on admin API calls.
- **Data storage:** all state (races, users, runs, discounts) lives in `data/db.json` (gitignored, auto-created). To reset everything, delete `data/db.json` or overwrite it with `{"races":[],"users":[],"runs":[],"discounts":[]}` — it is read on each request, no restart needed.
- **Simulated integrations (important):** real device sensors and real payments are NOT wired up in this environment. GPS/heart-rate/step-cadence on the run page are simulated in `run.js` (the browser Geolocation API is attempted first and falls back to simulation), and payment is a mock in `server.js` (`/api/races/:id/register`). To connect a real payment provider (Stripe / Apple Pay), replace the mock branch in the register handler; it needs HTTPS + domain verification.
- **Anti-cheat & points logic** live in `server.js`: `validateRun()` requires GPS + heart-rate + cadence and flags implausible speed/cadence/HR; points and pricing constants (`POINTS_PER_KM`, `DAILY_GOAL_KM`, `POINTS_PER_ILS`, etc.) are defined at the top of the file.
- **No build/lint/test tooling is configured** — there is no linter, bundler, or test suite. Verify changes by running the dev server and exercising the API/UI (see quick smoke test below).
- **Quick API smoke test** (server running):
  - `curl -X POST localhost:3000/api/races -H 'Content-Type: application/json' -H 'x-admin-key: admin123' -d '{"title":"בדיקה","date":"2026-09-18","distanceKm":10,"price":50}'`
  - `curl localhost:3000/api/races`
