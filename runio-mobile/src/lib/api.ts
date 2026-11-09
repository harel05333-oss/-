import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

// Points at the deployed RUNIO backend (see runio-mobile README for how to
// point this at a local dev server instead). Set in `.env` as
// EXPO_PUBLIC_API_URL so Expo inlines it into the client bundle
// (EXPO_PUBLIC_ prefix required).
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// Persisted via expo-secure-store (Keychain on iOS, Keystore-backed
// EncryptedSharedPreferences on Android) so a signed-in user stays signed in
// across app restarts. Previously this was in-memory only because the Expo
// Go client published to the App Store didn't implement the native method
// the installed expo-secure-store version called — that limitation only
// applied to Expo Go; the standalone TestFlight/production build has its
// own native module compiled in, so real SecureStore works here.
const TOKEN_KEY = 'raceon-auth-token';

// Mirrors SecureStore so getToken() can stay synchronous-feeling for
// callers that check it repeatedly (e.g. apiFetch on every request) without
// hitting the native module each time; setToken/clearToken keep it in sync.
let cachedToken: string | null | undefined;

// SecureStore can throw in Expo Go (its bundled native module can lag the
// npm package — see README "Auth model"). A storage failure must never block
// signing in or launching the app, so every call falls back to the
// in-memory token: worst case the user signs in again after a restart.
export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (err) {
    console.warn('[auth] could not read stored token, starting signed out', err);
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (err) {
    console.warn('[auth] could not persist token, keeping it in memory only', err);
  }
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (err) {
    console.warn('[auth] could not delete stored token', err);
  }
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  avatarUrl: string;
  city: string | null;
  countryCode: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — see runio-mobile/.env');
  }

  const url = `${API_URL}${path}`;
  const token = await getToken();

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (err) {
    // The generic iOS "Load failed" / "Network request failed" gives no
    // detail on its own — surface exactly what URL/error we got so this is
    // debuggable instead of a dead end.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new Error(`Fetch to ${url} failed — ${detail}`);
  }

  if (!res.ok) {
    // A 401 on a request that carried a token means the stored token itself
    // was rejected (expired/revoked) — not a sign-in/sign-up attempt, which
    // never attaches one. Clear it and bounce to sign-in so the user isn't
    // stranded on a screen that can't load instead of getting a clear "sign
    // in again" prompt.
    if (res.status === 401 && token) {
      await clearToken();
      router.replace('/sign-in');
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status}) at ${url}`, res.status);
  }

  return res.json() as Promise<T>;
}

export async function signIn(email: string, password: string): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/api/mobile/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  await setToken(token);
}

export async function signUp(
  name: string,
  email: string,
  phone: string,
  password: string,
  city: string,
  countryCode: string,
  username: string
): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/api/mobile/sign-up', {
    method: 'POST',
    body: JSON.stringify({ name, email, phone, password, city, countryCode, username }),
  });
  await setToken(token);
}

export async function signInWithGoogle(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<void> {
  const { token } = await apiFetch<{ token: string }>('/api/mobile/sign-in/google', {
    method: 'POST',
    body: JSON.stringify({ code, codeVerifier, redirectUri }),
  });
  await setToken(token);
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/api/mobile/me');
}

export async function updateProfile(
  name: string,
  city: string,
  countryCode: string,
  username?: string
): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/api/mobile/me', {
    method: 'PATCH',
    body: JSON.stringify({ name, city, countryCode, ...(username ? { username } : {}) }),
  });
}

// Fire-and-forget from the caller's perspective (see (tabs)/_layout.tsx) —
// this just saves the token the race-notifications cron sweep pushes to.
export async function registerPushToken(token: string): Promise<void> {
  await apiFetch('/api/mobile/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

// Separate from apiFetch: multipart uploads need fetch to set its own
// "Content-Type: multipart/form-data; boundary=..." header from the
// FormData body — apiFetch always forces "application/json".
export async function uploadAvatar(uri: string): Promise<{ avatarUrl: string }> {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — see runio-mobile/.env');
  }

  const token = await getToken();
  const filename = uri.split('/').pop() ?? 'photo.jpg';
  const ext = filename.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

  const formData = new FormData();
  // React Native's FormData accepts this {uri, name, type} shape directly
  // (not a real Blob) — it's how fetch bodies attach local file URIs on
  // both iOS and Android.
  formData.append('photo', { uri, name: filename, type: mime } as unknown as Blob);

  const res = await fetch(`${API_URL}/api/mobile/me/avatar`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status);
  }

  return res.json() as Promise<{ avatarUrl: string }>;
}

export type LocalizedText = { en: string; he: string };

export type Race = {
  id: string;
  title: LocalizedText;
  distanceKm: number;
  startsAt: string;
  // Every race is a start window: runners may start anytime in
  // [startsAt, windowEndsAt), each on their own clock.
  windowEndsAt: string | null;
  priceUsd: number | null;
  participantsCount: number | null;
  imageUrl: string;
  description: string | null;
};

export type RaceDetail = Race & { isRegistered: boolean };

export type MyRaceRegistration = {
  raceId: string;
  bibNumber: string;
  status: 'confirmed' | 'pending' | 'waitlisted';
  paceGoalPerKm: string;
  estRankPercentile: number;
  race: Race;
};

export async function fetchRaces(): Promise<Race[]> {
  return apiFetch<Race[]>('/api/mobile/races');
}

// Races whose window has already ended, most recent first — kept out of
// fetchRaces() above so a just-finished race doesn't linger in "browse
// races" forever, but still reachable here instead of disappearing outright.
export async function fetchRecentRaces(): Promise<Race[]> {
  return apiFetch<Race[]>('/api/mobile/races/recent');
}

export async function fetchRace(id: string): Promise<RaceDetail> {
  return apiFetch<RaceDetail>(`/api/mobile/races/${id}`);
}

export async function fetchMyRaces(): Promise<MyRaceRegistration[]> {
  return apiFetch<MyRaceRegistration[]>('/api/mobile/my-races');
}

export type RegisterForRaceResult =
  | { status: 'confirmed' }
  | { status: 'already_registered' }
  | { status: 'payment_required'; paymentUrl: string };

export async function registerForRace(raceId: string): Promise<RegisterForRaceResult> {
  return apiFetch<RegisterForRaceResult>(`/api/mobile/races/${raceId}/register`, {
    method: 'POST',
  });
}

export type UploadRaceResultResult = { status: 'recorded'; distanceKm: number; finishTimeS: number };

// Fallback for watches with no Strava auto-sync and no direct integration
// of ours (yet): upload the GPX/TCX file the watch's own app exports.
// Separate from apiFetch like uploadAvatar — multipart needs fetch to set
// its own boundary header.
export async function uploadRaceResult(
  raceId: string,
  fileUri: string,
  fileName: string
): Promise<UploadRaceResultResult> {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — see runio-mobile/.env');
  }

  const token = await getToken();
  const ext = fileName.toLowerCase().endsWith('.tcx') ? 'tcx' : 'gpx';
  const mime = ext === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/gpx+xml';

  const formData = new FormData();
  formData.append('track', { uri: fileUri, name: fileName, type: mime } as unknown as Blob);

  const res = await fetch(`${API_URL}/api/mobile/races/${raceId}/upload-result`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Upload failed (${res.status})`, res.status);
  }

  return res.json() as Promise<UploadRaceResultResult>;
}

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type WorldRankEntry = {
  rank: number;
  name: LocalizedText;
  avatarUrl: string;
  points: number;
  location: LocalizedText;
  category: LocalizedText;
  bestTime: string;
  // Optional on purpose: only present once the backend has shipped the
  // tier/isYou rollout. An older deployed API omits them entirely — code
  // reading these must handle that (see rankings.tsx's RunnerRow), not
  // assume the type guarantee holds at runtime.
  tier?: Tier;
  isYou?: boolean;
};

export type MyWorldRank = {
  rank: number;
  tier: Tier;
  nextTier: Tier;
  points: number;
  pointsToNextTier: number;
  avatarUrl: string;
};

export type RankingScope = 'global' | 'national' | 'city';

export async function fetchWorldRankings(scope: RankingScope = 'global'): Promise<WorldRankEntry[]> {
  return apiFetch<WorldRankEntry[]>(`/api/mobile/rankings?scope=${scope}`);
}

export async function fetchMyWorldRank(scope: RankingScope = 'global'): Promise<MyWorldRank> {
  return apiFetch<MyWorldRank>(`/api/mobile/rankings/me?scope=${scope}`);
}

export type MyStats = {
  races: number;
  podiums: number;
  rank: number;
  streak: number;
  elo: number;
  avgPace: string;
};

export async function fetchMyStats(): Promise<MyStats> {
  return apiFetch<MyStats>('/api/mobile/me/stats');
}

export type RecentSession = {
  raceId: string;
  title: LocalizedText;
  startsAt: string;
  distanceKm: number;
  paceLabel: string;
  place: number;
  total: number;
  verified: boolean;
};

export async function fetchRecentSessions(): Promise<RecentSession[]> {
  return apiFetch<RecentSession[]>('/api/mobile/me/recent-sessions');
}

export type NotificationItem = {
  id: string;
  type:
    | 'friend_request'
    | 'friend_accepted'
    | 'race_invite'
    | 'race_published'
    | 'race_closed'
    | 'race_results_ready';
  read: boolean;
  createdAt: string;
  actorName?: string;
  actorAvatarUrl?: string;
  raceId?: string;
  raceTitle?: LocalizedText;
};

export async function fetchNotifications(): Promise<NotificationItem[]> {
  return apiFetch<NotificationItem[]>('/api/mobile/notifications');
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiFetch(`/api/mobile/notifications/${id}/read`, { method: 'POST' });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch('/api/mobile/notifications/read-all', { method: 'POST' });
}

export type Friend = {
  id: string;
  name: string;
  avatarUrl: string;
};

export type FriendRequest = {
  friendshipId: string;
  fromUserId: string;
  name: string;
  avatarUrl: string;
};

export async function fetchFriends(): Promise<Friend[]> {
  return apiFetch<Friend[]>('/api/mobile/friends');
}

export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  return apiFetch<FriendRequest[]>('/api/mobile/friends/requests');
}

export type SendFriendRequestError = 'invalid' | 'notFound' | 'self' | 'alreadyExists';

// `target` is either a userId (from searchFriends' results — the normal
// path now) or a raw email (kept working for anything still calling this
// the old way).
export async function sendFriendRequest(target: { userId: string } | { email: string }): Promise<void> {
  try {
    await apiFetch('/api/mobile/friends/request', {
      method: 'POST',
      body: JSON.stringify(target),
    });
  } catch (err) {
    if (err instanceof ApiError) {
      throw new Error(
        {
          notFound: 'No RACEON account found.',
          self: "That's you.",
          alreadyExists: 'You already have a pending or accepted request with them.',
          invalid: 'Enter a username or email address.',
        }[err.message as SendFriendRequestError] ?? err.message
      );
    }
    throw err;
  }
}

export type FriendSearchResult = {
  id: string;
  name: string;
  avatarUrl: string;
  username: string;
  relationship: 'none' | 'friends' | 'requestSent' | 'requestReceived';
};

export async function searchFriends(query: string): Promise<FriendSearchResult[]> {
  if (query.trim().length < 2) return [];
  return apiFetch<FriendSearchResult[]>(`/api/mobile/friends/search?q=${encodeURIComponent(query.trim())}`);
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  await apiFetch(`/api/mobile/friends/requests/${friendshipId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
}

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  fromMe: boolean;
};

export async function fetchMessages(friendId: string): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(`/api/mobile/messages/${friendId}`);
}

export async function sendMessage(friendId: string, body: string): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/api/mobile/messages/${friendId}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export type ConnectedDevice = {
  provider: string;
  name: string;
  icon: string;
  connected: boolean;
};

export async function fetchDevices(): Promise<ConnectedDevice[]> {
  return apiFetch<ConnectedDevice[]>('/api/mobile/devices');
}

export async function disconnectStrava(): Promise<void> {
  await apiFetch('/api/mobile/devices/strava/disconnect', { method: 'POST' });
}

export type StravaRun = {
  id: number;
  name: string;
  startDate: string;
  distanceKm: number;
  movingTimeS: number;
  // Real data from whatever device (watch, chest strap) synced to Strava —
  // null when that run has none, never fabricated.
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageCadence: number | null;
};

export async function fetchStravaRuns(): Promise<StravaRun[]> {
  return apiFetch<StravaRun[]>('/api/mobile/devices/strava/activities');
}

export type StravaSplit = {
  km: number;
  distanceM: number;
  movingTimeS: number;
  elevationDifferenceM: number | null;
  averageHeartrate: number | null;
};

export type StravaRunDetail = StravaRun & {
  elevationGainM: number | null;
  // Google-encoded polyline string (Strava's format) — decode with
  // decodePolyline() before handing to MapView.
  polyline: string | null;
  splits: StravaSplit[];
};

export async function fetchStravaRunDetail(id: number): Promise<StravaRunDetail> {
  return apiFetch<StravaRunDetail>(`/api/mobile/devices/strava/activities/${id}`);
}

export type RoutePoint = { lat: number; lng: number; t: number; alt?: number | null };

export type SoloRun = {
  id: string;
  distanceKm: number;
  durationS: number;
  paceLabel: string;
  startedAt: string;
  route: RoutePoint[];
};

export async function fetchSoloRuns(): Promise<SoloRun[]> {
  return apiFetch<SoloRun[]>('/api/mobile/runs');
}

export async function fetchSoloRun(id: string): Promise<SoloRun> {
  return apiFetch<SoloRun>(`/api/mobile/runs/${id}`);
}

export async function saveSoloRun(input: {
  distanceKm: number;
  durationS: number;
  startedAt: string;
  route: RoutePoint[];
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>('/api/mobile/runs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// The Strava OAuth round trip has to happen in a real browser session
// (Strava's login/consent screen), so unlike the rest of this file this
// isn't a fetch — it's a URL for a WebView to navigate to. The mobile bearer
// token rides along as a query param since the WebView has no Authorization
// header to carry through Strava's redirect — see
// v-racer's src/app/api/strava/connect/route.ts for the other end.
export function buildStravaConnectUrl(mobileToken: string): string {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not set — see runio-mobile/.env');
  }
  return `${API_URL}/api/strava/connect?locale=en&mobileToken=${encodeURIComponent(mobileToken)}`;
}
