import type { BubbleTheme, BubbleThemeColors, BubbleThemeId } from "./types.js";

export const THEME_PRESETS: Array<{ id: Exclude<BubbleThemeId, "custom">; name: string; description: string; colors: BubbleThemeColors }> = [
  {
    id: "ink",
    name: "Ink",
    description: "Near-black on a light canvas.",
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
  {
    id: "paper",
    name: "Paper",
    description: "Warm paper, terracotta accent.",
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
  {
    id: "forest",
    name: "Forest",
    description: "Deep green and pale sage.",
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
  {
    id: "ocean",
    name: "Ocean",
    description: "Blue accent, cool gray canvas.",
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
  {
    id: "dusk",
    name: "Dusk",
    description: "A dark panel for night sites.",
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
];

export const COLOR_FIELDS: Array<{ key: keyof BubbleThemeColors; label: string }> = [
  { key: "accent", label: "Accent" },
  { key: "accentText", label: "Accent text" },
  { key: "header", label: "Header" },
  { key: "headerText", label: "Header text" },
  { key: "panel", label: "Panel" },
  { key: "canvas", label: "Transcript" },
  { key: "ink", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "agentBubble", label: "Agent bubble" },
  { key: "composer", label: "Composer" },
];

const INK = THEME_PRESETS[0]!.colors;

export function presetById(id: string): (typeof THEME_PRESETS)[number] | undefined {
  return THEME_PRESETS.find((preset) => preset.id === id);
}

/** Keeps the form usable when an older server has not saved a theme yet. */
export function themeFromWidget(theme: BubbleTheme | undefined, accentColor: string): BubbleTheme {
  const accent = /^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : INK.accent;
  if (!theme) return { id: "ink", colors: { ...INK, accent, header: accent } };
  return { id: theme.id, colors: { ...INK, ...theme.colors, accent: theme.colors?.accent || accent } };
}
