# RUNIO Mobile

The native RUNIO app, built with Expo + Expo Router. Separate codebase from
`../v-racer` (the Next.js web app) on purpose — a React Native app can't call
Next.js Server Actions, so this talks to `v-racer` over a small REST API
instead (`src/app/api/mobile/*` in that project).

**v1 scope, on purpose:** sign-in + an authenticated home screen only. This
proves the whole chain (Expo Go → RUNIO backend → real Supabase DB) works.
Races, live GPS tracking, friends, etc. are not ported yet — see
`../v-racer/PRD.md` §2.3 for why this became a separate project at all
(mobile-first decision, Windows-without-Mac constraint) and what the actual
long-term trigger for going native was (background GPS tracking + a real
watch companion).

## Running it

The backend is deployed at `https://v-racer-one.vercel.app` (Vercel) and is
always on — you don't need `v-racer`'s dev server or a tunnel running for
normal use.

1. Copy `.env.example` to `.env` — it already defaults `EXPO_PUBLIC_API_URL`
   to the deployed backend.
2. `npm install`
3. `npx expo start`
4. Scan the QR code with the **Expo Go** app on your phone. Your phone and PC
   don't need to be on the same network — it's a real public URL.

**To iterate on backend code instead**, point `EXPO_PUBLIC_API_URL` at your
machine's LAN IP (`npm run dev` in `../v-racer` prints it as the **Network**
URL, e.g. `http://192.168.1.81:3000`) — but note iOS blocks plain `http://`
to a LAN address from inside Expo Go (App Transport Security; this only
applies to the shared Expo Go client, not a custom EAS build), so a tunnel
(e.g. `cloudflared tunnel --url http://localhost:3000`) is usually the more
reliable option for phone testing against local backend changes. Also watch
for Windows Firewall blocking inbound connections to port 3000 from other
LAN devices — `curl` from this same PC succeeding doesn't rule that out.

## Structure

- `src/app/` — Expo Router screens (`_layout.tsx`, `index.tsx` redirect,
  `sign-in.tsx`, `home.tsx`)
- `src/lib/api.ts` — talks to the backend, holds the bearer token in an
  in-memory variable (see "Auth model" below for why, not `expo-secure-store`)
- `src/constants/theme.ts` — RUNIO brand colors, kept in sync by hand with
  `../v-racer/src/app/globals.css`
- `assets/images/icon*.png`, `splash-icon.png`, `favicon.png` — generated
  from the real RUNIO logo (`../RUNIOּּ+/`), not placeholders

## Auth model

Bearer token (JWT, signed with `MOBILE_JWT_SECRET`), not Auth.js's browser
session — a React Native `fetch` doesn't share a browser's cookie jar, so it
can't participate in `v-racer`'s normal NextAuth session the way a browser
tab does. Sign-in hits `POST /api/mobile/sign-in`, gets a token back, and
sends it as `Authorization: Bearer <token>` on every subsequent request. See
`../v-racer/src/lib/mobile-auth.ts`.

**Token storage — in-memory only, doesn't survive an app restart.** The
original plan was `expo-secure-store`, but the version of its native module
bundled in Expo Go SDK 57 doesn't implement the method the installed npm
package calls (`getValueWithKeyAsync is not a function` — a version-skew bug
between the npm package and the Expo Go App Store binary, not fixable from
app config). This will get fixed for real once the app moves off Expo Go
onto a custom EAS dev/production build, where `expo-secure-store`'s native
module is compiled to match the JS version exactly. Until then, users have
to sign in again after force-closing the app.
