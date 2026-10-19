// @doc Consistent device identities for UI probes; CSS viewports are never inferred from screenshot pixels.
import { devices } from "playwright";

/** Native descriptors at 100% browser zoom. Overrides are explicitly synthetic, not a phone reproduction.
 * https://playwright.dev/docs/emulation
 */
export function resolveUIProfile({ touch = false, viewport = null, deviceScaleFactor = null, device = null } = {}) {
  if (viewport && ![viewport.width, viewport.height].every(n => Number.isInteger(n) && n >= 64 && n <= 8192)) throw new Error("Invalid CSS viewport");
  if (deviceScaleFactor !== null && (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0 || deviceScaleFactor > 4)) throw new Error("Invalid deviceScaleFactor");
  const name = device || (touch ? "iPhone 13" : "Desktop Chrome");
  const landscape = viewport && viewport.width > viewport.height;
  const selected = landscape && devices[name + " landscape"] ? name + " landscape" : name;
  const descriptor = devices[selected];
  if (!descriptor) throw new Error(`Unknown UI device: ${selected}`);
  // defaultBrowserType is launcher metadata, not a BrowserContext option.
  const { defaultBrowserType, ...contextOptions } = descriptor;
  if (!contextOptions.screen) contextOptions.screen = { ...descriptor.viewport };
  const customViewport = !!viewport && (viewport.width !== descriptor.viewport.width || viewport.height !== descriptor.viewport.height);
  if (viewport) contextOptions.viewport = { ...viewport };
  if (customViewport) contextOptions.screen = { ...viewport };
  if (deviceScaleFactor !== null) contextOptions.deviceScaleFactor = deviceScaleFactor;
  return { contextOptions, profile: {
    device: selected, kind: customViewport ? "custom-css-viewport" : "device-emulation",
    expectedEngine: defaultBrowserType, browserPageZoom: "100% emulated; physical browser zoom unmeasured",
    viewport: { ...contextOptions.viewport }, screen: { ...(contextOptions.screen || contextOptions.viewport) },
    deviceScaleFactor: contextOptions.deviceScaleFactor,
    raster: contextOptions.deviceScaleFactor === descriptor.deviceScaleFactor ? "descriptor" : "geometry-override",
    isMobile: contextOptions.isMobile, hasTouch: contextOptions.hasTouch,
    limitations: "Emulation does not reproduce browser chrome, notches, dynamic toolbar resizing or a physical device. Custom viewports are stress cases, not measured phone zoom."
  } };
}

/** Playwright Test exposes screen through contextOptions, unlike viewport/isMobile fixtures. */
export function uiTestOptions(options) {
  const { screen, ...rest } = resolveUIProfile(options).contextOptions;
  return { ...rest, contextOptions: { screen } };
}

/** Read at each checkpoint, including after rotation or resize. Only appearance keys, never player saves. */
export function measureUIProfile() {
  const css = getComputedStyle(document.documentElement), vv = visualViewport;
  const appearance = Object.fromEntries(["uiScale", "textSize", "uiContrast", "lookGarage", "lookDesigner"].map(k => [k, localStorage.getItem("apex26." + k)]));
  return { viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height },
    deviceScaleFactor: devicePixelRatio, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
    coarse: matchMedia("(pointer:coarse)").matches, hover: matchMedia("(hover:hover)").matches,
    visualViewport: vv && { width: vv.width, height: vv.height, scale: vv.scale },
    desktop: document.body.classList.contains("desktop"), uiScale: css.getPropertyValue("--ui-scale").trim(), appearance,
    breakpoints: { portrait760: matchMedia("(max-width:760px) and (orientation:portrait)").matches,
      landscape500: matchMedia("(max-height:500px) and (orientation:landscape)").matches } };
}
