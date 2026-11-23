/* ios-wake-note.test.mjs — W24 row 7. The race holds a screen wake lock
 * (js/core/wake-lock.js), and the iOS nudge recommends the Home Screen app,
 * where the Screen Wake Lock API did nothing on iOS 16.4-18.3 (WebKit bug
 * 254545, fixed in iOS and iPadOS 18.4 on 2025-03-31). On an affected version
 * the nudge says so, and an already-installed app shows that note once.
 *
 * Run: node --test tests/unit/ios-wake-note.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const ps = fs.readFileSync(new URL("../../js/ui/platform-session.js", import.meta.url), "utf8");
const start = ps.indexOf("(function iosInstallNudge()");
const body = ps.slice(start, ps.indexOf("})();", start) + 5);
const UA = (v) => `Mozilla/5.0 (iPhone; CPU iPhone OS ${v.replace(".", "_")} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${v} Mobile/15E148 Safari/604.1`;

function boot({ ua, standalone = false, stored = new Map() }) {
  const els = Object.fromEntries(["ios-install", "ios-install-x", "overlay"].map((k) => [k, { hidden: k !== "overlay", addEventListener() {} }]));
  const msg = { textContent: "Add Apex 26 to your Home Screen", append(t) { this.textContent += t; } };
  els["ios-install-msg"] = msg;
  vm.runInNewContext(body, {
    $: (k) => els[k], Native: { isNative: () => false },
    store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) },
    navigator: { userAgent: ua, standalone, platform: "iPhone", maxTouchPoints: 5 },
    window: { matchMedia: () => ({ matches: standalone }) },
    setTimeout() {},
  }, { filename: absSrc("js/ui/platform-session.js") });
  return { els, msg, stored, dismiss: () => els["ios-install-x"].onclick() };
}
const NOTE = "On iOS 16.4\u201318.3 the screen may dim mid-race in the Home Screen app. Update to iOS 18.4 or later to fix it.";
const noted = (s) => s.msg.textContent.endsWith(NOTE);

for (const [v, broken] of [["16.3", false], ["16.4", true], ["17.5", true], ["18.3", true], ["18.4", false], ["26.1", false]]) {
  test(`Safari on iOS ${v}: the install nudge ${broken ? "carries" : "omits"} the wake-lock note`, () => {
    const s = boot({ ua: UA(v) });
    assert.equal(s.els["ios-install"].hidden, false, "the nudge still shows");
    assert.equal(noted(s), broken);
    assert.equal(s.msg.textContent, "Add Apex 26 to your Home Screen" + (broken ? " " + NOTE : ""), "the install instructions stay");
    s.dismiss();
    assert.equal(s.stored.get("iosInstallSeen"), true);
    assert.equal(s.stored.get("iosWakeNoteSeen"), broken ? true : undefined);
  });
  test(`Home Screen app on iOS ${v}: ${broken ? "one-time wake-lock note" : "nothing"}`, () => {
    const stored = new Map([["iosInstallSeen", true]]);
    const s = boot({ ua: UA(v), standalone: true, stored });
    assert.equal(s.els["ios-install"].hidden, !broken);
    if (!broken) return;
    assert.ok(noted(s) && !s.msg.textContent.includes("Add Apex 26"), "installed already: only the note");
    s.dismiss();
    assert.equal(stored.get("iosWakeNoteSeen"), true);
    const again = boot({ ua: UA(v), standalone: true, stored });
    assert.equal(again.els["ios-install"].hidden, true, "once, ever");
  });
}
