import { Monitor, Moon, Sun } from "lucide-react";
import { ActionForm } from "./ActionForm";
import { setTheme } from "@/lib/admin/theme-actions";
import { THEMES, THEME_LABELS, type Theme } from "@/lib/admin/theme";

const ICONS: Record<Theme, typeof Sun> = {
  auto: Monitor,
  light: Sun,
  dark: Moon,
};

/**
 * Theme switch for the gestionale sidebar.
 *
 * A server component: three submit buttons in one form, no client JS. The
 * preference round-trips through a cookie and the layout re-renders with the
 * new `data-theme`, which is also why there is no flash to guard against.
 */
export function ThemeToggle({ current }: { current: Theme }) {
  return (
    <ActionForm action={setTheme} className="flex items-center gap-1" aria-label="Tema del gestionale">
      {THEMES.map((theme) => {
        const Icon = ICONS[theme];
        const active = theme === current;
        return (
          <button
            key={theme}
            type="submit"
            name="theme"
            value={theme}
            title={THEME_LABELS[theme]}
            aria-label={`Tema ${THEME_LABELS[theme].toLowerCase()}`}
            aria-pressed={active}
            className={`flex-1 rounded-lg px-2 py-1.5 transition-colors ${
              active
                ? "bg-brown-950 text-cream"
                : "text-brown-800/60 hover:bg-brown-900/5 hover:text-brown-950"
            }`}
          >
            <Icon className="mx-auto size-4" />
          </button>
        );
      })}
    </ActionForm>
  );
}
