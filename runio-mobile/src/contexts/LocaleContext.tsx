// Same pattern as ThemeContext.tsx (see that file's header comment for why):
// Expo Router eagerly imports every route file, so anything baked into a
// module-scope constant at import time can't react to an async SecureStore
// read. Locale must be read at RENDER time via a hook, not a static import.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';

export type Locale = 'he' | 'en';

const STORAGE_KEY = 'raceon-locale';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'he',
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('he');

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'he' || stored === 'en') setLocaleState(stored);
      })
      .catch(() => {});
  }, []);

  function setLocale(next: Locale) {
    setLocaleState(next);
    SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}

/**
 * Per-screen translation dictionary pattern — deliberately NOT one giant
 * shared en.ts/he.ts file. Each screen defines its own `{ he: {...}, en:
 * {...} }` object (usually right above the component, or in a co-located
 * `<Screen>.strings.ts`) and calls `useT(strings)` to get back whichever
 * language object matches the live locale. Plain values for static text,
 * functions for anything with a variable in it:
 *
 *   const strings = {
 *     he: { title: 'שלום', greet: (name: string) => `שלום, ${name}` },
 *     en: { title: 'Hello', greet: (name: string) => `Hello, ${name}` },
 *   };
 *   const t = useT(strings);
 *   <Text>{t.title}</Text>
 *   <Text>{t.greet(user.name)}</Text>
 *
 * TypeScript enforces both language objects share the same shape (same
 * keys, same function signatures) since they're both typed as `T` — a
 * missing translation is a compile error, not a silent runtime fallback.
 * This also means screens never fight over a shared central file, which
 * matters when several are being translated in parallel.
 */
export function useT<T>(dict: Record<Locale, T>): T {
  const { locale } = useLocale();
  return dict[locale];
}
