// phone-tools — the shared "Bryce's phone" preset, the issue-screenshot fetcher and the screenshot size matcher
// (tools/lib/bryce-phone.mjs, tools/ui/issue-shots.mjs, tools/lib/shot-match.mjs, tools/ui/phone-shot-diff.mjs).
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRYCE_WINDOWS, LEGACY_EXPORT, OWNER_EXPORT, UI_SIZE_AXIS, brycePhone, classifyShot, mismatches, ownerStore, storeEntries } from "../../tools/lib/bryce-phone.mjs";
import { describe, presetOptions } from "../../tools/ui/bryce-phone.mjs";
import { collect, imageSize, imageUrls } from "../../tools/ui/issue-shots.mjs";
import { contrast, crop, halve, matchElement, median, resample, summarize } from "../../tools/lib/shot-match.mjs";
import { reportLines } from "../../tools/ui/phone-shot-diff.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const run = (...a) => { try { return { code: 0, out: execFileSync(process.execPath, a, { cwd: ROOT, encoding: "utf8", stdio: "pipe" }) }; } catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; } };

test("the preset is his standalone window: 852x393, DPR 3, env() insets 59/0/59/21, touch, his LIVE export seeded", () => {
  const p = brycePhone();
  assert.deepEqual(p.viewport, { width: 852, height: 393 });
  assert.equal(p.deviceScaleFactor, 3);
  assert.deepEqual(p.insets, { top: 0, left: 59, bottom: 21, right: 59 });
  assert.equal(p.contextOptions.isMobile && p.contextOptions.hasTouch, true);
  assert.match(p.contextOptions.userAgent, /iPhone/);
  assert.equal(p.profile.file, OWNER_EXPORT);
  assert.equal(OWNER_EXPORT, "tests/data/settings-live-export-2026-11-09.json");
  assert.equal(p.localStorage["apex26.uiScale"], "61", "his UI SIZE is 61 %, stored as a percent (what js/ui/scale.js reads)");
  assert.equal(p.uiScale, 61);
  assert.equal(p.localStorage["apex26.textSize"], JSON.stringify("large"), "a store.set key is JSON");
  for (const k of ["hudScale", "hudBtnScale", "hudBtnOpacity"]) assert.equal("apex26." + k in p.localStorage, false, `${k} is unset on his phone (the default)`);
  assert.equal(JSON.parse(p.localStorage["apex26.hudElements"]).speed, "off");
  assert.equal(brycePhone({ uiScale: 51 }).localStorage["apex26.uiScale"], "51", "--ui-scale overrides the export, in percent");
  assert.deepEqual(brycePhone({ profile: false }).localStorage, {});
  assert.deepEqual(UI_SIZE_AXIS, [61, 109, 51, 40]);
  const legacy = brycePhone({ profile: "legacy" });
  assert.equal(legacy.profile.file, LEGACY_EXPORT);
  assert.equal(legacy.localStorage["apex26.hudBtnScale"], "245", "the October export: BUTTON SIZE 245 % is a raw-lane string");
  assert.equal("apex26.uiScale" in legacy.localStorage, false, "the October export leaves UI SIZE unset");
  assert.throws(() => brycePhone({ profile: "october" }), /unknown profile/);
  assert.equal(brycePhone({ window: "safari" }).viewport.height, 368);
  assert.match(BRYCE_WINDOWS.safari.verified, /MEASURED.*ASSUMED/, "the Safari cell says its size is measured and its insets are not");
  const w844 = brycePhone({ window: "w844" });
  assert.deepEqual([w844.viewport, w844.insets, w844.owner], [{ width: 844, height: 390 }, { top: 0, left: 47, bottom: 21, right: 47 }, false]);
  assert.throws(() => brycePhone({ window: "ipad" }), /unknown window/);
  assert.throws(() => brycePhone({ dpr: 9 }), /dpr/);
  assert.throws(() => brycePhone({ uiScale: 5 }), /uiScale/);
});

test("ownerStore splits the export into the json and raw lanes and drops unset keys", () => {
  const exp = { exportedAt: "t", device: { userAgent: "UA" }, settings: { a: { one: 1, two: "x", three: null }, b: { four: { k: 1 } } } };
  const o = ownerStore({ exportJson: exp, specSource: '{ k: "two", lane: "raw" }' });
  assert.deepEqual(o.store, { json: { one: 1, four: { k: 1 } }, raw: { two: "x" } });
  assert.deepEqual(storeEntries(o.store), { "apex26.one": "1", "apex26.four": '{"k":1}', "apex26.two": "x" });
  assert.equal(o.userAgent, "UA");
});

test("mismatches: [] when the page reports the preset, one line per difference otherwise", () => {
  const p = brycePhone({ profile: "legacy" });
  const got = { viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, insets: { top: 0, left: 59, bottom: 21, right: 59 }, coarse: true, stored: { hudBtnScale: "245", uiScale: null } };
  assert.match(mismatches(brycePhone(), got).join(" | "), /^stored uiScale = null, seeded 61$/, "the live profile seeds UI SIZE 61");
  assert.deepEqual(mismatches(p, got), []);
  const bad = mismatches(p, { ...got, viewport: { width: 844, height: 390 }, insets: { top: 0, left: 0, bottom: 0, right: 0 }, stored: { hudBtnScale: "100" } });
  assert.equal(bad.length, 5, bad.join(" | "));
  assert.match(bad.join(" | "), /viewport 844x390, wanted 852x393/);
  assert.match(bad.join(" | "), /env\(safe-area-inset-left\) 0, wanted 59/);
  assert.match(bad.join(" | "), /stored hudBtnScale = 100, seeded 245/);
});

test("classifyShot: 2000x923 is the standalone window at 2.347 px per CSS px; other aspects say so", () => {
  assert.deepEqual(classifyShot(2000, 923), { window: "standalone", orientation: "landscape", pxPerCss: 2.3474, nearest: "standalone", aspectError: 0.0005 });
  assert.equal(classifyShot(2556, 1179).pxPerCss, 3);
  assert.equal(classifyShot(2556, 1104).window, "safari");
  assert.equal(classifyShot(2532, 1170).nearest, "standalone", "the 844x390 cell is not one of his windows");
  assert.equal(classifyShot(923, 2000).orientation, "portrait");
  const crop43 = classifyShot(1600, 1200);
  assert.equal(crop43.window, null);
  assert.equal(crop43.pxPerCss, null);
  assert.throws(() => classifyShot(0, 10), /positive/);
});

test("bryce-phone CLI: prints the preset, refuses an unknown flag with exit 2", () => {
  assert.match(describe(brycePhone()), /^bryce-standalone: 852x393 CSS px, DPR 3, env\(\) insets L59 T0 R59 B21\n/);
  const flags = (o) => ({ flag: (k, d) => (k in o ? o[k] : d), has: (k) => k in o });
  assert.deepEqual(presetOptions(flags({ "--window": "safari", "--dpr": "1", "--ui-scale": "51", "--no-profile": true })), { window: "safari", profile: false, dpr: 1, uiScale: 51 });
  assert.throws(() => presetOptions(flags({ "--dpr": "abc" })), /--dpr needs a number/);
  const ok = run("tools/ui/bryce-phone.mjs", "--window", "safari");
  assert.equal(ok.code, 0);
  assert.match(ok.out, /bryce-safari: 852x368/);
  assert.equal(run("tools/ui/bryce-phone.mjs", "--bogus").code, 2);
  assert.equal(run("tools/ui/bryce-phone.mjs", "--window", "ipad").code, 2);
});

test("issue-shots: finds GitHub attachments and direct image links, once each, and nothing else", () => {
  const body = 'see ![shot](https://github.com/user-attachments/assets/1b2c-3d) and\n<img width="300" src="https://github.com/user-attachments/assets/zz">\nhttps://example.com/a.PNG. also https://example.com/page and ![shot](https://github.com/user-attachments/assets/1b2c-3d)';
  assert.deepEqual(imageUrls(body), ["https://github.com/user-attachments/assets/1b2c-3d", "https://github.com/user-attachments/assets/zz", "https://example.com/a.PNG"]);
  assert.deepEqual(imageUrls(null), []);
  const get = (p) => p === "issues/7" ? { json: { title: "t", body: "![a](https://github.com/user-attachments/assets/a1)", user: { login: "bryce" }, created_at: "d0" } }
    : { json: [{ id: 9, body: "https://github.com/user-attachments/assets/b2 and ![a](https://github.com/user-attachments/assets/a1)", user: { login: "bryce" }, created_at: "d1" }] };
  assert.deepEqual(collect(7, get).rows.map((r) => `${r.where}:${r.url.slice(-2)}`), ["body:a1", "comment 9:b2"]);
  assert.match(collect(7, () => ({ error: "HTTP 404" })).error, /issue #7: HTTP 404/);
  assert.equal(run("tools/ui/issue-shots.mjs").code, 2);
});

test("imageSize reads PNG, JPEG and GIF headers", () => {
  const png = Buffer.alloc(24); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(2000, 16); png.writeUInt32BE(923, 20);
  assert.deepEqual(imageSize(png), { width: 2000, height: 923, type: "png" });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x9b, 0x07, 0xd0, 0x03, 0, 0]);
  assert.deepEqual(imageSize(jpg), { width: 2000, height: 923, type: "jpeg" });
  const gif = Buffer.alloc(10); gif.write("GIF89a"); gif.writeUInt16LE(10, 6); gif.writeUInt16LE(20, 8);
  assert.deepEqual(imageSize(gif), { width: 10, height: 20, type: "gif" });
  assert.equal(imageSize(Buffer.from("not an image at all, just text....")), null);
});

// A plane with three textured boxes (no period: a seeded hash), and a "phone" plane that draws the same layout at `s`.
function scene(s) {
  const W = 320, H = 150, data = new Float32Array(W * H).fill(30);
  const boxes = [{ x: 30, y: 20, w: 70, h: 24 }, { x: 180, y: 60, w: 60, h: 30 }, { x: 110, y: 110, w: 90, h: 18 }];
  const tex = (i, j, k) => { let v = (i * 73856093) ^ (j * 19349663) ^ (k * 83492791); v = (v ^ (v >>> 13)) * 1274126177; return ((v >>> 8) & 255); };
  const base = { w: W, h: H, data };
  boxes.forEach((b, k) => { for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) data[(b.y + j) * W + b.x + i] = tex(i >> 2, j >> 2, k); });
  if (s === 1) return { plane: base, boxes };
  const small = resample(base, W * s, H * s), out = new Float32Array(W * H).fill(30);
  for (let j = 0; j < Math.min(H, small.h); j++) for (let i = 0; i < Math.min(W, small.w); i++) out[j * W + i] = small.data[j * small.w + i];
  return { plane: { w: W, h: H, data: out }, boxes };
}

test("shot-match: recovers the scale an element is drawn at, and refuses a flat or tiny one", () => {
  const live = scene(1);
  for (const s of [1, 0.6, 1.3]) {
    const phone = scene(s).plane, phoneHalf = halve(phone);
    const m = matchElement(live.plane, phone, live.boxes[0], { phoneHalf });
    assert.equal(m.ok, true, `scale ${s}`);
    assert.ok(Math.abs(m.scale - s) <= 0.04 * s, `scale ${s}: got ${m.scale}`);
    assert.ok(m.score > 0.6, `scale ${s}: score ${m.score}`);
    assert.ok(Math.abs(m.x - live.boxes[0].x * s) <= 3 && Math.abs(m.y - live.boxes[0].y * s) <= 3, `scale ${s}: at ${m.x},${m.y}`);
  }
  assert.deepEqual(matchElement(live.plane, live.plane, { x: 250, y: 5, w: 40, h: 12 }), { ok: false, why: "flat (no texture to match)" });
  assert.deepEqual(matchElement(live.plane, live.plane, { x: 30, y: 20, w: 6, h: 6 }), { ok: false, why: "too small to match" });
  assert.equal(contrast(crop(live.plane, 250, 5, 40, 12)), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});

test("summarize + reportLines: the screen factor is the median; an element off it is listed as DIFFERENT", () => {
  const rect = { x: 0, y: 0, w: 100, h: 40 };
  const rows = [
    { label: "button#a", rect, match: { ok: true, scale: 0.47, score: 0.9 } },
    { label: "button#b", rect, match: { ok: true, scale: 0.48, score: 0.8 } },
    { label: "div.hud", rect, match: { ok: true, scale: 0.46, score: 0.7 } },
    { label: "button#big", rect, match: { ok: true, scale: 0.94, score: 0.85 } },
    { label: "span.weak", rect, match: { ok: true, scale: 2, score: 0.2 } },
    { label: "div.panel", rect, match: { ok: false, why: "flat (no texture to match)" } },
  ];
  const sum = summarize(rows);
  assert.equal(sum.globalScale, 0.475);
  assert.equal(sum.matched, 4);
  assert.deepEqual(sum.different.map((r) => r.label), ["button#big"]);
  assert.equal(sum.different[0].phone, "94x38");
  assert.deepEqual(sum.unmatched.map((r) => r.label), ["span.weak", "div.panel"]);
  const text = reportLines(sum, { shot: "s.png", window: "standalone", pxPerCss: 2.3474, liveUiScale: 1.09 }).join("\n");
  assert.match(text, /SCREEN: the screenshot draws this screen at 0\.475x the live render \(4 of 6 elements matched\); live UI SIZE var is 1\.09, so the phone's effective UI SIZE is about 52 %/);
  assert.match(text, /button#big: live 100x40 → phone 94x38 \(0\.94x, 1\.979x the screen factor, score 0\.85\)/);
  assert.match(text, /= phone-shot-diff: screen 0\.475x, 1 element\(s\) differ, 2 unmatched$/);
  assert.match(reportLines(summarize([rows[5]]), { shot: "s.png", window: "standalone", pxPerCss: 2 }).join("\n"), /no confident match/);
});
