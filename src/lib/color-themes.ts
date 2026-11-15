/**
 * The app's one color theme — the values behind the `--app-*` token
 * vocabulary.
 *
 * Light sage, built on the palette #040D12 · #183D3D · #5C8374 · #93B1A6:
 * surfaces are pale tints of sage #93B1A6, deep teal #183D3D is the
 * interaction accent, muted green #5C8374 carries selection / secondary
 * accent, and near-black #040D12 is high-contrast text. Status colours and
 * per-file-type colours (see `file-icons.tsx`) sit beside it.
 *
 * `src/styles/compacto/tokens.css` mirrors these values in `:root`, so the
 * first painted frame already matches what {@link applyAppTheme} writes.
 */

/** A complete palette: surfaces, lines, accent, text, code surfaces, status. */
export interface ColorTheme {
  /** False only for a dark palette; drives `.dark` and Monaco's base theme. */
  isLight: boolean;
  /** Page background (the deepest surface). */
  bg: string;
  /** Card / popover surface — one step up from `bg`. */
  bgPanel: string;
  /** Sidebar / secondary / muted surface — a third distinct tone. */
  bgSidebar: string;
  /** Subtle hover wash (translucent — composites over whatever's beneath). */
  bgHover: string;
  /** Selected/active row wash (translucent). */
  bgSelected: string;
  /** Hairline border. */
  border: string;
  /** Slightly stronger border (inputs, dividers that need more presence). */
  borderMid: string;
  /** Accent-tinted border (focus rings, active outlines). */
  borderAccent: string;
  /** The interaction accent. */
  accent: string;
  /** Softer accent for secondary accent text/icons. */
  accentDim: string;
  /** Faint accent wash. */
  accentFaint: string;
  /** Default body text. */
  text: string;
  /** High-contrast text (headings, emphasis). */
  textBright: string;
  /** De-emphasized text (captions, placeholders). */
  textDim: string;
  /** Code-surface background (editor / highlighted code blocks). */
  editorBg: string;
  /** Code gutter background (line numbers). */
  gutterBg: string;
  success: string;
  warn: string;
  error: string;
}

export const APP_THEME: ColorTheme = {
  isLight: true,
  bg: "#eef3f1",
  bgPanel: "#ffffff",
  bgSidebar: "#e3ebe8",
  bgHover: "rgba(24,61,61,0.06)",
  bgSelected: "rgba(92,131,116,0.18)",
  border: "rgba(24,61,61,0.12)",
  borderMid: "rgba(24,61,61,0.22)",
  borderAccent: "rgba(92,131,116,0.55)",
  accent: "#183d3d",
  accentDim: "#5c8374",
  accentFaint: "rgba(92,131,116,0.12)",
  text: "#2a3f3c",
  textBright: "#040d12",
  textDim: "#52675f",
  editorBg: "#ffffff",
  gutterBg: "#eef3f1",
  success: "#2f7d5b",
  warn: "#b7791f",
  error: "#c0392b",
};

/**
 * Maps a palette onto the `--app-*` custom properties `theme.css` exposes as
 * Tailwind utilities (`bg-app-panel`, `text-app-dim`, …).
 */
export function appThemeCssVars(t: ColorTheme): Record<string, string> {
  return {
    "--app-bg": t.bg,
    "--app-panel": t.bgPanel,
    "--app-sidebar": t.bgSidebar,
    "--app-hover": t.bgHover,
    "--app-selected": t.bgSelected,
    "--app-border": t.border,
    "--app-border-mid": t.borderMid,
    "--app-border-accent": t.borderAccent,
    "--app-accent": t.accent,
    "--app-accent-dim": t.accentDim,
    "--app-accent-faint": t.accentFaint,
    "--app-text": t.text,
    "--app-bright": t.textBright,
    "--app-dim": t.textDim,
    "--app-editor": t.editorBg,
    "--app-gutter": t.gutterBg,
    "--app-success": t.success,
    "--app-warn": t.warn,
    "--app-error": t.error,
    "--app-on-solid": t.isLight ? "#ffffff" : t.bg,
  };
}

/** Writes {@link APP_THEME} onto the document root. Call once at boot. */
export function applyAppTheme() {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(appThemeCssVars(APP_THEME))) {
    root.style.setProperty(name, value);
  }
  root.classList.toggle("dark", !APP_THEME.isLight);
}
