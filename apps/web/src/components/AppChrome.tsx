import { CameraIcon, MoonIcon, SunIcon } from "./icons";
import { usePreferences } from "../lib/preferences";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><CameraIcon /></span>
      <span>press-link-call</span>
    </div>
  );
}

export function PreferencesControls() {
  const { locale, setLocale, theme, setTheme, t } = usePreferences();
  const nextTheme = theme === "dark" ? "light" : "dark";
  return (
    <div className="preferences" aria-label={t("preferences")}>
      <div className="locale-switch" aria-label={t("language")}>
        <button type="button" className={locale === "en" ? "selected" : ""} onClick={() => setLocale("en")} aria-label={t("switchToEnglish")}>EN</button>
        <button type="button" className={locale === "uk" ? "selected" : ""} onClick={() => setLocale("uk")} aria-label={t("switchToUkrainian")}>УК</button>
      </div>
      <button className="theme-toggle" type="button" onClick={() => setTheme(nextTheme)} aria-label={nextTheme === "light" ? t("lightTheme") : t("darkTheme")} title={nextTheme === "light" ? t("lightTheme") : t("darkTheme")}>
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}
