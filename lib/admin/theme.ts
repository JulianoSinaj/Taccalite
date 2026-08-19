import "server-only";
import { cookies } from "next/headers";

/**
 * The gestionale's colour theme.
 *
 * Stored in a cookie and resolved on the server, so the shell renders with
 * `data-theme` already set. The usual approach — read `localStorage` in a
 * blocking inline script — exists to avoid a flash of the wrong theme; reading
 * a cookie during the render avoids the flash *and* the script.
 *
 * "auto" maps to `data-theme="system"`, which the stylesheet answers with a
 * `prefers-color-scheme` media query and `color-scheme: light dark` — so the OS
 * is followed without client JS here either. (It deliberately does *not* use
 * `light-dark()`; see the comment above the dark blocks in `globals.css`.)
 */

export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "taccalite_theme";

/** The CSS attribute value for a stored preference. */
export const themeAttr = (theme: Theme): "system" | "light" | "dark" =>
  theme === "auto" ? "system" : theme;

export const THEME_LABELS: Record<Theme, string> = {
  auto: "Automatico",
  light: "Chiaro",
  dark: "Scuro",
};

const isTheme = (v: string | undefined): v is Theme => !!v && (THEMES as readonly string[]).includes(v);

/** The operator's stored preference, defaulting to following the system. */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "auto";
}
