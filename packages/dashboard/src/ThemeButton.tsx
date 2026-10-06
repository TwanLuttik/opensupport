import { themeLabel, type ThemeController } from "./theme.js";

export function ThemeButton({ theme, className }: { theme: ThemeController; className?: string }) {
  const label = themeLabel(theme.theme);
  return (
    <button
      className={className ?? "btn btn-outline btn-icon theme-toggle"}
      type="button"
      aria-label={`Color theme: ${label}. Activate to change.`}
      title={`Theme: ${label}. Click to change.`}
      onClick={theme.cycle}
    >
      <span aria-hidden="true">{theme.dark ? "☾" : "☀"}</span>
    </button>
  );
}
