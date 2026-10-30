// theme-axis — the THEME axis for layout-audit (`--theme=dark,light`).
// @doc The `--theme=` axis (dark / light) for layout-audit: sets the context colorScheme AND the game's own uiTheme setting.
// @skill survey-ui-matrix
//
// TWO SWITCHES, BOTH THROWN. The game does not follow the OS by default:
// js/ui/appearance-opts.js reads `uiTheme` (dark | light | system, default
// dark) from GameStore, i.e. localStorage key `apex26.uiTheme`, JSON-encoded.
// Emulating `prefers-color-scheme: light` alone therefore changes nothing on a
// fresh profile — the game stays dark and the "light" cells would measure the
// dark UI. So each cell sets the browser context's colorScheme (Playwright:
// https://playwright.dev/docs/emulation#color-scheme-and-media) AND seeds the
// game's setting with an init script, so the store reads it before first paint
// and it survives the reload recovery.
//
// Default is dark only, which is what layout-audit hard-coded before this axis
// existed, and `themeTag("dark")` is empty — an un-themed run's names and
// output are unchanged.

export const THEMES = ["dark", "light"];
export const DEFAULT_THEME = "dark";
export const THEME_KEY = "apex26.uiTheme";

export function parseThemes(argv) {
  const a = argv.find((x) => x.startsWith("--theme="));
  if (!a) return [DEFAULT_THEME];
  const out = [];
  for (const s of a.slice("--theme=".length).split(",").map((x) => x.trim()).filter(Boolean)) {
    if (!THEMES.includes(s)) throw new Error(`--theme: "${s}" is not one of ${THEMES.join(", ")}`);
    if (!out.includes(s)) out.push(s);
  }
  if (!out.length) throw new Error("--theme= needs at least one of " + THEMES.join(", "));
  return out;
}

/** Suffix for log lines, file names and grid columns; empty for the default (dark). */
export const themeTag = (theme) => (!theme || theme === DEFAULT_THEME ? "" : `~${theme}`);

/** A row's theme; rows written before the axis existed were dark. */
export const rowTheme = (row) => (row && row.theme) || DEFAULT_THEME;

/** Init script (pass to context.addInitScript with the theme): seed the game's own setting. */
export function themeInitScript(arg) {
  try { localStorage.setItem(arg.key, JSON.stringify(arg.theme)); } catch (_) { /* storage blocked: colorScheme still applies */ }
}
