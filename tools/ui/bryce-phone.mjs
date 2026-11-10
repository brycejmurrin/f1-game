#!/usr/bin/env node
// @doc Print the shared "Bryce's phone" preset, or boot the page on it and prove the emulation took (--measure).
// bryce-phone.mjs — the one command for tools/lib/bryce-phone.mjs (docs/notes/TOOLING-HUNT-2026-11-09.md).
//
//   node tools/ui/bryce-phone.mjs                         # the preset: window, DPR, insets, profile summary
//   node tools/ui/bryce-phone.mjs --json                  # all of it, localStorage entries included
//   node tools/ui/bryce-phone.mjs --measure               # boot the working tree on it; read viewport, env() insets, stored sizes back
//   node tools/ui/bryce-phone.mjs --measure --eval "document.querySelector('#title').getBoundingClientRect().width" --shot artifacts/phone/title.png
//   --window standalone|safari   --dpr N (1 on this software-GL box for HUD fit work)   --ui-scale P (percent)   --no-profile
//
// --measure starts a browser: parent session only, one browser at a time (AGENTS.md rule 5). Exit 0 the page reported
// what the preset asked for, 1 it did not (each mismatch is printed), 2 usage.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strictFlags, makeFlags } from "../lib/cli-args.mjs";
import { brycePhone, openBrycePhone, readBackInPage, mismatches } from "../lib/bryce-phone.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const USAGE = `usage: node tools/ui/bryce-phone.mjs [--window standalone|safari] [--dpr N] [--ui-scale P] [--no-profile] [--json]
       node tools/ui/bryce-phone.mjs --measure [--url /path] [--eval "<js expression>"] [--shot out.png] [--wait ms] [same preset flags]
  The owner's iPhone as one emulation recipe (tools/lib/bryce-phone.mjs): 852x393, DPR 3, env() insets 59/0/59/21, his settings export.
  --measure boots the working tree on it (one browser; parent session only) and prints what the page reports; exit 1 on a mismatch.`;
export const KNOWN = ["--window", "--dpr", "--ui-scale", "--no-profile", "--json", "--measure", "--url", "--eval", "--shot", "--wait"];

/** argv → preset options. Pure. */
export function presetOptions(flags) {
  const num = (name) => { const v = flags.flag(name); if (v === undefined || v === null) return undefined; const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${name} needs a number (got ${v})`); return n; };
  const o = { window: flags.flag("--window") || "standalone", profile: !flags.has("--no-profile") };
  const dpr = num("--dpr"), ui = num("--ui-scale");
  if (dpr !== undefined) o.dpr = dpr;
  if (ui !== undefined) o.uiScale = ui;
  return o;
}

/** The human summary of a preset. Pure. */
export function describe(p) {
  const i = p.insets;
  return [`${p.name}: ${p.viewport.width}x${p.viewport.height} CSS px, DPR ${p.deviceScaleFactor}, env() insets L${i.left} T${i.top} R${i.right} B${i.bottom}`,
    `  verified: ${p.verified}`,
    p.profile ? `  profile: ${p.profile.file} (exported ${p.profile.exportedAt}), ${Object.keys(p.localStorage).length} keys, UI SIZE ${p.profile.uiScale === "export" ? "as exported" : p.profile.uiScale + " %"}` : "  profile: none (fresh boot)",
    `  limits: ${p.limits}`].join("\n");
}

async function measure(flags, opts) {
  const { launchChromium, startStaticServer, shutdown } = await import("../lib/harness.mjs");
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
  try {
    const { page, preset } = await openBrycePhone(browser, opts);
    await page.goto(srv.url + String(flags.flag("--url") || "/").replace(/^\//, ""), { waitUntil: "load" });
    await page.waitForTimeout(Number(flags.flag("--wait") || 1500));
    const got = await page.evaluate(readBackInPage);
    const bad = mismatches(preset, got);
    const out = { preset: preset.name, got, mismatches: bad };
    if (flags.flag("--eval")) out.eval = await page.evaluate(String(flags.flag("--eval")));
    if (flags.flag("--shot")) {
      const file = path.resolve(ROOT, String(flags.flag("--shot")));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file });
      out.shot = path.relative(ROOT, file);
    }
    console.log(JSON.stringify(out, null, 2));
    console.log(bad.length ? `= bryce-phone: ${bad.length} mismatch(es): ${bad.join("; ")}` : `= bryce-phone: emulation took (${got.viewport.width}x${got.viewport.height}, DPR ${got.deviceScaleFactor}, insets ${got.insets.left}/${got.insets.top}/${got.insets.right}/${got.insets.bottom})`);
    return bad.length ? 1 : 0;
  } finally { await browser.close().catch(() => {}); await srv.close?.(); shutdown?.(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  strictFlags(argv, KNOWN, USAGE);
  try {
    const flags = makeFlags(argv, KNOWN);
    const opts = presetOptions(flags);
    if (flags.has("--measure")) process.exit(await measure(flags, opts));
    const p = brycePhone(opts);
    console.log(flags.has("--json") ? JSON.stringify(p, null, 2) : describe(p));
  } catch (e) { console.error(`bryce-phone: ${e.message}`); process.exit(2); }
}
