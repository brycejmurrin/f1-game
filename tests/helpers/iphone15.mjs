// Size-only inputs for Playwright layout tests. Raster scale remains a caller choice.
import { BRYCE_WINDOWS } from "../../tools/lib/bryce-phone.mjs";

const viewport = ({ width, height }) => ({ width, height });
export const LANDSCAPE = viewport(BRYCE_WINDOWS.standalone);
export const PORTRAIT = viewport(BRYCE_WINDOWS.portrait);

// The original A/C/D UI contract shares three comparison cases across suites.
// C is a deliberately shorter toolbar stress case; the measured Safari window lives in BRYCE_WINDOWS.safari.
const { left, right, bottom } = BRYCE_WINDOWS.standalone.insets;
export const CONTRACT_WINDOWS = [
  { name: "A home-screen 852x393", viewport: LANDSCAPE, insets: { l: left, r: right, b: bottom } },
  { name: "C safari 852x283", viewport: { width: LANDSCAPE.width, height: 283 }, insets: { l: left, r: right, b: 0 } },
  { name: "D spec phone 844x390", viewport: viewport(BRYCE_WINDOWS.w844), insets: { l: 0, r: 0, b: 0 } },
];

export async function rotateIPhone15(page, cdp, orientation) {
  const { width, height, insets } = BRYCE_WINDOWS[orientation];
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
  await page.setViewportSize({ width, height });
}
