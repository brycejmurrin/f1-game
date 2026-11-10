#!/usr/bin/env node
// @doc Compare a phone screenshot with the live page on the Bryce-phone preset: which elements are a different SIZE.
// phone-shot-diff.mjs — a screenshot in, a size table out (docs/notes/TOOLING-HUNT-2026-11-09.md).
//
// The owner sends a 2000x923 screenshot; the report used to be re-typed by hand as measurements. This boots the working
// tree on the shared preset (tools/lib/bryce-phone.mjs: 852x393, insets, his export), drives it to the same screen
// (--eval), screenshots it at the screenshot's own pixel density, lists the visible UI elements, and finds each one in
// the phone image by template matching over scale (tools/lib/shot-match.mjs). It prints
//   - the SCREEN factor: the median phone/live size over confident matches ("the phone draws this screen at 0.47x:
//     an effective UI SIZE of about 51 % against the 109 % the profile says"), and
//   - the elements whose own factor departs from that (the ones that are individually the wrong size), and
//   - what it could not find (absent on the phone, different content, or a flat panel with nothing to match).
// A match needs texture: text and icons match, the 3D scene behind them differs and is ignored by restricting to
// elements. It measures SIZE and says nothing about colour. Not a test: an instrument, with the score beside each row.
//
//   node tools/ui/phone-shot-diff.mjs --shot artifacts/phone-shots/5218/shot-1.png
//   node tools/ui/phone-shot-diff.mjs --shot s.png --eval "__apex.open('settings')" --ui-scale 109 --json
//   --selector "#pause *"   only elements under it     --max 30   element cap     --window standalone|safari (default: from the image's aspect)
// Starts a browser: parent session only, one at a time (AGENTS.md rule 5). Exit 0 reported, 2 usage, 3 the image is unusable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictFlags } from "../lib/cli-args.mjs";
import { classifyShot, openBrycePhone, BRYCE_WINDOWS } from "../lib/bryce-phone.mjs";
import { halve, matchElement, summarize } from "../lib/shot-match.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const USAGE = `usage: node tools/ui/phone-shot-diff.mjs --shot <image> [--eval "<js>"] [--url /path] [--selector <css>] [--max N] [--window standalone|safari]
                                        [--ui-scale P] [--no-profile] [--wait ms] [--keep <dir>] [--json]
  Boots the working tree on the Bryce-phone preset, reaches the screen (--eval runs in the page first), and reports which
  visible elements are a different size in the screenshot: the screen-wide factor, per-element outliers, and what did not match.`;
export const KNOWN = ["--shot", "--eval", "--url", "--selector", "--max", "--window", "--ui-scale", "--no-profile", "--wait", "--keep", "--json"];

/** In-page: the visible, uncovered UI elements worth matching, biggest text-bearing first. */
export function listElementsInPage({ selector, max }) {
  const vw = innerWidth, vh = innerHeight, out = [];
  const pool = selector ? document.querySelectorAll(selector) : document.querySelectorAll("button, a, input, select, label, h1, h2, h3, h4, [role], [id], [class]");
  for (const el of pool) {
    if (el === document.body || el === document.documentElement || el.tagName === "CANVAS" || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 14 || r.height < 10 || r.width * r.height > 0.35 * vw * vh) continue;
    if (r.left < 0 || r.top < 0 || r.right > vw || r.bottom > vh) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.2) continue;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !(top === el || el.contains(top))) continue;
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    const leafish = el.children.length <= 3;
    if (!ownText && !leafish && !["BUTTON", "A", "INPUT", "SELECT"].includes(el.tagName)) continue;
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 28);
    const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/)[0] : "";
    out.push({ label: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : cls ? "." + cls : ""}${text ? ` "${text}"` : ""}`,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height }, weight: (ownText ? 2 : 1) * Math.min(r.width * r.height, 20000), fontPx: parseFloat(cs.fontSize) || null });
  }
  // Drop an element that wraps an already-kept one almost exactly (the same pixels twice).
  out.sort((a, b) => b.weight - a.weight);
  const kept = [];
  for (const e of out) {
    if (kept.some((k) => Math.abs(k.rect.x - e.rect.x) < 3 && Math.abs(k.rect.y - e.rect.y) < 3 && Math.abs(k.rect.w - e.rect.w) < 6 && Math.abs(k.rect.h - e.rect.h) < 6)) continue;
    kept.push(e);
    if (kept.length >= max) break;
  }
  return kept;
}

/** The lines of the human report. Pure. */
export function reportLines(sum, { shot, window, pxPerCss, liveUiScale = null }) {
  const lines = [`phone-shot-diff: ${shot} (${window} window, ${pxPerCss} px per CSS px) against the live page`];
  if (sum.globalScale === null) { lines.push("= no confident match: is the page on the same screen as the screenshot? (--eval to reach it; --selector to narrow)"); return lines; }
  const pct = (x) => `${(x * 100).toFixed(0)} %`;
  lines.push(`SCREEN: the screenshot draws this screen at ${sum.globalScale}x the live render (${sum.matched} of ${sum.of} elements matched)` +
    (liveUiScale ? `; live UI SIZE var is ${liveUiScale}, so the phone's effective UI SIZE is about ${pct(sum.globalScale * liveUiScale)}` : ""));
  if (sum.different.length) {
    lines.push(`DIFFERENT SIZE (${sum.different.length}; own factor against the screen factor):`);
    for (const r of sum.different) lines.push(`  ${r.label}: live ${r.live} → phone ${r.phone} (${r.scale}x, ${r.vsScreen}x the screen factor, score ${r.score})`);
  } else lines.push("DIFFERENT SIZE: none beyond the screen factor");
  lines.push(`SAME AS THE SCREEN FACTOR: ${sum.sameSize.length}${sum.sameSize.length ? ` (${sum.sameSize.slice(0, 6).map((r) => r.label).join("; ")}${sum.sameSize.length > 6 ? "; …" : ""})` : ""}`);
  if (sum.unmatched.length) lines.push(`NOT MATCHED (${sum.unmatched.length}): ${sum.unmatched.slice(0, 10).map((r) => `${r.label} [${r.why}]`).join("; ")}${sum.unmatched.length > 10 ? "; …" : ""}`);
  lines.push(`= phone-shot-diff: screen ${sum.globalScale}x, ${sum.different.length} element(s) differ, ${sum.unmatched.length} unmatched`);
  return lines;
}

async function gray(sharp, input, w, h) {
  const { data } = await sharp(input).removeAlpha().greyscale().resize(w, h, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
  return { w, h, data: Float32Array.from(data) };
}

async function main(flags) {
  const shot = flags.flag("--shot", null);
  if (!shot || !fs.existsSync(path.resolve(ROOT, shot))) { console.error(`phone-shot-diff: --shot needs an existing image${shot ? ` (${shot} not found)` : ""}\n\n${USAGE}`); return 2; }
  const sharp = (await import("sharp")).default;
  const file = path.resolve(ROOT, shot);
  const meta = await sharp(file).metadata();
  const cls = classifyShot(meta.width, meta.height);
  const window = flags.flag("--window", null) || cls.window;
  if (!window || !BRYCE_WINDOWS[window]) { console.error(`phone-shot-diff: ${meta.width}x${meta.height} is neither of his windows by aspect (nearest ${cls.nearest}, off ${(cls.aspectError * 100).toFixed(1)} %): cropped, or pass --window`); return 3; }
  if (cls.orientation !== "landscape") { console.error("phone-shot-diff: portrait screenshots are not supported yet"); return 3; }
  const win = BRYCE_WINDOWS[window];
  const { launchChromium, startStaticServer, shutdown } = await import("../lib/harness.mjs");
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  try {
    const ui = flags.flag("--ui-scale", null);
    const { page } = await openBrycePhone(browser, { window, dpr: 2, profile: !flags.has("--no-profile"), ...(ui ? { uiScale: Number(ui) } : {}) });
    await page.goto(srv.url + String(flags.flag("--url", "/")).replace(/^\//, ""), { waitUntil: "load" });
    await page.waitForTimeout(Number(flags.flag("--wait", 1500)));
    if (flags.flag("--eval", null)) { await page.evaluate(String(flags.flag("--eval"))); await page.waitForTimeout(600); }
    const els = await page.evaluate(listElementsInPage, { selector: flags.flag("--selector", null), max: Number(flags.flag("--max", 30)) });
    const liveUiScale = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || null);
    const livePng = await page.screenshot();
    const keep = flags.flag("--keep", null);
    if (keep) { fs.mkdirSync(path.resolve(ROOT, keep), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, keep, "live.png"), livePng); }
    // Both planes on one grid: 1 sample per CSS px of the window.
    const live = await gray(sharp, livePng, win.width, win.height), phone = await gray(sharp, file, win.width, win.height);
    const phoneHalf = halve(phone);
    let rows = els.map((e) => ({ label: e.label, rect: e.rect, match: matchElement(live, phone, e.rect, { phoneHalf }) }));
    // Second pass: an element the first window missed is searched over the whole image at the screen factor.
    const first = summarize(rows);
    if (first.globalScale !== null) rows = rows.map((r) => (r.match.ok && r.match.score >= 0.6 ? r : (() => {
      const again = matchElement(live, phone, r.rect, { phoneHalf, minScale: first.globalScale / 1.12, maxScale: first.globalScale * 1.12, window: 2 });
      return again.ok && (!r.match.ok || again.score > r.match.score) ? { ...r, match: again } : r;
    })()));
    const sum = summarize(rows);
    if (flags.has("--json")) console.log(JSON.stringify({ shot, window, pxPerCss: cls.pxPerCss, liveUiScale, ...sum }, null, 2));
    else console.log(reportLines(sum, { shot, window, pxPerCss: cls.pxPerCss, liveUiScale }).join("\n"));
    return 0;
  } finally { await browser.close().catch(() => {}); await srv.close?.(); shutdown?.(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = strictFlags(process.argv.slice(2), KNOWN, USAGE);
  main(flags).then((c) => process.exit(c), (e) => { console.error(`phone-shot-diff: ${e.message}`); process.exit(3); });
}
