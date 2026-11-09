import { Colors } from '@/constants/theme';

// The app has a single monochrome palette — no light/dark split — but this
// stays a hook (not a plain export) so existing `const colors = useTheme()`
// call sites need no changes if a themeable variant is ever reintroduced.
export function useTheme() {
  return Colors;
}
