// @ts-check
import { BOOT_MS } from "./fixtures.js";

/** Break localStorage.setItem the way a zero quota does, BEFORE any script runs. */
export async function bootBroken(page, name = "QuotaExceededError") {
  await page.addInitScript(([errName]) => {
    const proto = Object.getPrototypeOf(window.localStorage) || Storage.prototype;
    const real = proto.setItem;
    proto.setItem = function (k, v) {
      // Only our own keys, so nothing else the page does is disturbed.
      if (String(k).startsWith("apex26.")) {
        const e = new Error("storage is full");
        e.name = errName;
        throw e;
      }
      return real.call(this, k, v);
    };
  }, [name]);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}
