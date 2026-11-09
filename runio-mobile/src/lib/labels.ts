import type { Tier } from '@/lib/api';

// Hebrew display labels for backend enum values — kept in one place so the
// same word is used everywhere a given enum shows up (Lobby, Rankings,
// Profile all show `tier`, for example).
export const TIER_LABEL_HE: Record<Tier, string> = {
  platinum: 'פלטינה',
  gold: 'זהב',
  silver: 'כסף',
  bronze: 'ארד',
};

export const REGISTRATION_STATUS_LABEL_HE: Record<'confirmed' | 'pending' | 'waitlisted', string> = {
  confirmed: 'מאושר',
  pending: 'ממתין',
  waitlisted: 'ברשימת המתנה',
};

export function raceLevelLabelHe(distanceKm: number): string {
  if (distanceKm >= 30) return 'עלית';
  if (distanceKm >= 10) return 'מקצוען';
  return 'פתוח';
}
