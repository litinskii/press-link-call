/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { isSafariFamily } from "./browser-platform";
import { translate, type Locale, type TranslationKey } from "./i18n";
import type { VideoQuality } from "./video-quality";

type Theme = "light" | "dark";

interface PreferencesValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  videoQuality: VideoQuality;
  setVideoQuality: (quality: VideoQuality) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

const PreferencesContext = createContext<PreferencesValue | undefined>(undefined);
const LOCALE_KEY = "press-link-call.locale";
const THEME_KEY = "press-link-call.theme";
const VIDEO_QUALITY_KEY = "press-link-call.video-quality";

function initialLocale(): Locale {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved === "en" || saved === "uk") return saved;
  return navigator.language.toLowerCase().startsWith("uk") ? "uk" : "en";
}

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function initialVideoQuality(): VideoQuality {
  const saved = localStorage.getItem(VIDEO_QUALITY_KEY);
  if (saved === "saver" || saved === "balanced" || saved === "high") return saved;
  return isSafariFamily() ? "saver" : "balanced";
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [videoQuality, setVideoQuality] = useState<VideoQuality>(initialVideoQuality);

  useLayoutEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useLayoutEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0c0f" : "#f3f3f1");
  }, [theme]);

  useLayoutEffect(() => {
    localStorage.setItem(VIDEO_QUALITY_KEY, videoQuality);
  }, [videoQuality]);

  const t = useCallback((key: TranslationKey, values?: Record<string, string | number>) => translate(locale, key, values), [locale]);
  const value = useMemo<PreferencesValue>(() => ({
    locale,
    setLocale,
    theme,
    setTheme,
    videoQuality,
    setVideoQuality,
    t,
  }), [locale, t, theme, videoQuality]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used inside PreferencesProvider");
  return context;
}
