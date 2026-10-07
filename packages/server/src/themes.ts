import type { BubbleTheme, BubbleThemeColors, BubbleThemeId } from "./types.js";

export const BUBBLE_THEME_IDS = ["ink", "paper", "forest", "ocean", "dusk", "custom"] as const;

export const THEME_COLOR_KEYS = [
  "accent",
  "accentText",
  "header",
  "headerText",
  "panel",
  "canvas",
  "ink",
  "muted",
  "agentBubble",
  "composer",
] as const satisfies readonly (keyof BubbleThemeColors)[];

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Built-in looks. `custom` starts from Ink so a new custom theme is never blank. */
export const BUBBLE_THEMES: Record<BubbleThemeId, { id: BubbleThemeId; name: string; description: string; colors: BubbleThemeColors }> = {
  ink: {
    id: "ink",
    name: "Ink",
    description: "Near-black accent on a light canvas. The original bubble.",
    colors: {
      accent: "#111827",
      accentText: "#ffffff",
      header: "#111827",
      headerText: "#ffffff",
      panel: "#ffffff",
      canvas: "#f4f5f7",
      ink: "#16181d",
      muted: "#6d727c",
      agentBubble: "#ffffff",
      composer: "#ffffff",
    },
  },
  paper: {
    id: "paper",
    name: "Paper",
    description: "Warm paper with a terracotta accent.",
    colors: {
      accent: "#9a3412",
      accentText: "#fff7ed",
      header: "#7c2d12",
      headerText: "#fff7ed",
      panel: "#fffaf3",
      canvas: "#f6efe4",
      ink: "#1c1917",
      muted: "#78716c",
      agentBubble: "#fffaf3",
      composer: "#fffaf3",
    },
  },
  forest: {
    id: "forest",
    name: "Forest",
    description: "Deep green header and a pale sage canvas.",
    colors: {
      accent: "#14532d",
      accentText: "#f0fdf4",
      header: "#14532d",
      headerText: "#f0fdf4",
      panel: "#f7fbf6",
      canvas: "#e7f0e4",
      ink: "#14241a",
      muted: "#5c6b62",
      agentBubble: "#ffffff",
      composer: "#f7fbf6",
    },
  },
  ocean: {
    id: "ocean",
    name: "Ocean",
    description: "Blue accent on a cool gray panel.",
    colors: {
      accent: "#1d4ed8",
      accentText: "#ffffff",
      header: "#1e3a8a",
      headerText: "#ffffff",
      panel: "#ffffff",
      canvas: "#eef3fb",
      ink: "#0f172a",
      muted: "#64748b",
      agentBubble: "#ffffff",
      composer: "#ffffff",
    },
  },
  dusk: {
    id: "dusk",
    name: "Dusk",
    description: "A dark panel for sites that stay in night mode.",
    colors: {
      accent: "#a78bfa",
      accentText: "#1e1b2e",
      header: "#1e1b2e",
      headerText: "#f5f3ff",
      panel: "#16141f",
      canvas: "#100e18",
      ink: "#f5f3ff",
      muted: "#a39bb8",
      agentBubble: "#241f33",
      composer: "#16141f",
    },
  },
  custom: {
    id: "custom",
    name: "Custom",
    description: "Start from Ink and change any color.",
    colors: {
      accent: "#111827",
      accentText: "#ffffff",
      header: "#111827",
      headerText: "#ffffff",
      panel: "#ffffff",
      canvas: "#f4f5f7",
      ink: "#16181d",
      muted: "#6d727c",
      agentBubble: "#ffffff",
      composer: "#ffffff",
    },
  },
};

export function isBubbleThemeId(value: string): value is BubbleThemeId {
  return (BUBBLE_THEME_IDS as readonly string[]).includes(value);
}

export function defaultBubbleTheme(accentColor = "#111827"): BubbleTheme {
  if (!accentColor || accentColor.toLowerCase() === BUBBLE_THEMES.ink.colors.accent) {
    return { id: "ink", colors: { ...BUBBLE_THEMES.ink.colors } };
  }
  return resolveBubbleTheme({ id: "custom", colors: { accent: accentColor, header: accentColor } });
}

/**
 * Fills a stored theme. Unknown ids fall back to Ink.
 * A named template uses its own palette. Ink still honors a saved accent
 * that predates themes, unless the theme already stored its own accent.
 * `custom` keeps saved colors and fills anything missing from Ink.
 */
export function resolveBubbleTheme(
  theme: { id?: BubbleThemeId; colors?: Partial<BubbleThemeColors> } | null | undefined,
  accentColor?: string,
): BubbleTheme {
  const id = theme?.id && isBubbleThemeId(theme.id) ? theme.id : "ink";
  const base = { ...BUBBLE_THEMES[id].colors };
  const accent = accentColor && HEX.test(accentColor) ? accentColor : "";
  if (id !== "custom") {
    // Ink is the original look, so a saved accent still paints it. Other templates keep their palette.
    if (id === "ink" && accent) {
      base.accent = accent;
      base.header = accent;
    }
    return { id, colors: base };
  }
  const saved: Partial<BubbleThemeColors> = theme?.colors ?? {};
  for (const key of THEME_COLOR_KEYS) {
    const value = saved[key];
    if (value && HEX.test(value)) base[key] = value;
  }
  if (!saved.accent && accent) base.accent = accent;
  if (!saved.header) base.header = base.accent;
  return { id: "custom", colors: base };
}
