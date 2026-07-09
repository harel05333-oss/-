# AGENTS.md

## Project overview

This repository contains an **online races app** (Hebrew, RTL):

- **Public page** (`/`, `public/index.html`) — lists upcoming races (distance in km, location, start time, "how to join") and lets users register (name / phone / email).
- **Admin page** (`/admin.html`) — password-gated; create/delete races and view each race's registrants.
- **Backend** — Node.js + Express in `server.js`; data persisted to a JSON file at `data/races.json` (created at runtime).

There is also a legacy static marketing landing page in `README.md` (it is HTML content despite the `.md` extension) and `harel landing.pdf`. These are unrelated to the app and require no build.

## Cursor Cloud specific instructions

- **Run:** `npm run dev` (uses `node --watch` for hot reload) or `npm start`. Server listens on `http://localhost:3000` (override with `PORT`).
- **Admin access:** the admin page requires a password checked against the `ADMIN_KEY` env var; the dev default is `admin123`. The key is sent from the browser via the `x-admin-key` header on admin API calls. Set `ADMIN_KEY` in the environment to change it.
- **Data storage:** state lives in `data/races.json` (gitignored). It is auto-created empty on first request. To reset all races/registrations, overwrite it with `{"races":[]}` (no restart needed — it's read on each request).
- **No build, lint, or test tooling is configured** — there is no linter, bundler, or test suite. Verify changes by running the dev server and exercising the API/UI.
- **Quick API smoke test** (server must be running):
  - `curl -X POST localhost:3000/api/races -H 'Content-Type: application/json' -H 'x-admin-key: admin123' -d '{"title":"בדיקה","date":"2026-09-18","distanceKm":10}'`
  - `curl localhost:3000/api/races`
