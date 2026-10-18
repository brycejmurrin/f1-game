// All-screens UI scan: labels, silent grey-outs, and a control x effect matrix.
// node scratch/ui-scan/scan.mjs [--viewport ios-iphone-landscape] [--screens a,b] [--flip] [--out file]
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { SCREENS, VIEWPORTS } from "../tools/ui/menu-screens.mjs";
import { holdLoopInit, captureShot } from "../tools/lib/ui-mock-core.mjs";
import { leaveToMenu } from "../tools/ui/menu-mock.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const vpName = arg("--viewport", "ios-iphone-landscape");
const vpRow = VIEWPORTS.find((v) => v[0] === vpName) || VIEWPORTS[1];
const vp = { name: vpRow[0], opts: vpRow[1] };
const only = arg("--screens", null), flip = process.argv.includes("--flip"), shots = process.argv.includes("--shots");

const url = process.env.LA_URL || "http://localhost:3456/";
const exe = execFileSync("node", ["tools/lib/chromium-path.mjs", "--path"]).toString().trim();
mkdirSync("scratch/ui-scan/shots", { recursive: true });


const browser = await chromium.launch({ executablePath: exe, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"] });
const size = arg("--size", null);
if (size) { const [w, h] = size.split("x").map(Number); vp.opts = { ...vp.opts, viewport: { width: w, height: h }, screen: { width: w, height: h } }; vp.name += "-" + size; }
const ctx = await browser.newContext({ ...vp.opts, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.addInitScript(holdLoopInit);
await page.addInitScript(() => { try { localStorage.setItem("apex26.gfxBackend", "webgl2"); localStorage.setItem("apex26.seenIntro", "1"); } catch (_) {} });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
await page.goto(url);
await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 180000 });

const SCAN = (rootSel) => {
  const root = document.querySelector(rootSel) || document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden]"); };
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const labelOf = (el) => clean(el.getAttribute("aria-label") || (el.labels && el.labels[0] && el.labels[0].textContent) || (el.tagName === "SELECT" ? "" : el.textContent) || el.value || el.title || el.id);
  const rowOf = (el) => {
    const g = el.closest("[role=group],[role=radiogroup],[role=tablist]");
    if (g && g.getAttribute("aria-label")) return clean(g.getAttribute("aria-label"));
    let p = el.parentElement;
    for (let i = 0; p && i < 4; i++, p = p.parentElement) {
      const l = p.querySelector(":scope > label, :scope > .set-lbl, :scope > span[class*=lbl], :scope > .tune-label, :scope > h3, :scope > h4");
      if (l && !l.contains(el)) return clean(l.textContent).slice(0, 60);
    }
    return "";
  };
  const sectionOf = (el) => {
    let p = el;
    while (p && p !== root) {
      let s = p.previousElementSibling;
      while (s) { if (/^H[2-4]$/.test(s.tagName) || s.getAttribute("role") === "heading" || /sec|head|title/.test(s.className || "")) return clean(s.textContent).slice(0, 50); s = s.previousElementSibling; }
      p = p.parentElement;
    }
    return "";
  };
  const ctls = Array.from(root.querySelectorAll("button, input, select, textarea, [role=switch], [role=checkbox], [role=tab], [role=radio], [role=slider], a[href]")).filter(vis);
  return ctls.map((el, i) => {
    el.dataset.scanIdx = String(i);
    const near = el.closest("[aria-disabled=true]");
    return { i, tag: el.tagName.toLowerCase(), type: el.type || el.getAttribute("role") || "", id: el.id || "", label: labelOf(el), row: rowOf(el), section: sectionOf(el),
      disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true" || !!near, title: clean(el.title || (near && near.title)),
      describedBy: clean((el.getAttribute("aria-describedby") || "").split(" ").map((id) => (document.getElementById(id) || {}).textContent || "").join(" ")),
      pressed: el.getAttribute("aria-pressed") || el.getAttribute("aria-checked") || (el.type === "checkbox" ? String(el.checked) : ""),
      inGroup: !!el.closest("[role=group],[role=radiogroup]"), text: clean(el.textContent).slice(0, 40) };
  });
};

// Flip one settable control, measure, restore. Returns what moved.
const FLIP = async ([rootSel, idx]) => {
  const root = document.querySelector(rootSel) || document.body;
  const el = root.querySelector(`[data-scan-idx="${idx}"]`);
  if (!el) return { skip: "gone" };
  const ls = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith("apex26.")) o[k] = localStorage.getItem(k); } return o; };
  const states = () => Array.from(root.querySelectorAll("[data-scan-idx]")).map((c) => [c.dataset.scanIdx, (c.disabled || c.getAttribute("aria-disabled") === "true" || !!c.closest("[aria-disabled=true]")) ? "D" : "", c.closest("[hidden]") || getComputedStyle(c).display === "none" ? "H" : ""].join(""));
  const txt = () => root.innerText;
  const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  const s0 = { ls: ls(), st: states(), tx: txt() };
  const wasDisabled = el.disabled; el.disabled = false;
  let restore = null;
  if (el.tagName === "SELECT") {
    const v = el.value, o = Array.from(el.options).find((x) => x.value !== v && !x.disabled);
    if (!o) { el.disabled = wasDisabled; return { skip: "single option" }; }
    el.value = o.value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    restore = () => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  } else if (el.type === "range") {
    const v = el.value, mn = +el.min || 0, mx = +el.max || 100, nv = Math.abs(+v - mx) > Math.abs(+v - mn) ? mx : mn;
    el.value = String(nv); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    restore = () => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
  } else if (el.type === "checkbox") {
    el.click(); restore = () => el.click();
  } else {
    // a pill in a group: press it, then press the one that was pressed before
    const grp = el.closest("[role=group],[role=radiogroup]") || el.parentElement;
    const prev = Array.from(grp.querySelectorAll("button,[role=radio],[role=switch]")).find((b) => b !== el && (b.getAttribute("aria-pressed") === "true" || b.getAttribute("aria-checked") === "true" || b.classList.contains("active") || b.classList.contains("on")));
    const self = el.getAttribute("aria-pressed") === "true" || el.getAttribute("aria-checked") === "true";
    if (self && !(el.getAttribute("role") === "switch" || el.hasAttribute("aria-pressed") && !prev)) { el.disabled = wasDisabled; return { skip: "already selected" }; }
    el.click(); restore = () => (prev ? prev.click() : el.click());
  }
  await tick();
  const s1 = { ls: ls(), st: states(), tx: txt() };
  restore(); await tick(); el.disabled = wasDisabled;
  const s2 = { ls: ls(), st: states() };
  const lsKeys = Object.keys({ ...s0.ls, ...s1.ls }).filter((k) => s0.ls[k] !== s1.ls[k]);
  const deps = s1.st.map((x, i) => (x !== s0.st[i] && String(i) !== String(idx) ? x : null)).map((x, i) => (x === null ? null : [i, s0.st[i], x])).filter(Boolean);
  return { lsKeys, deps, textChanged: s0.tx !== s1.tx, restored: JSON.stringify(s0.ls) === JSON.stringify(s2.ls) };
};

const want = only ? only.split(",") : SCREENS.map((s) => s.id).filter((id) => !/^hud|loading|^lightingtunerfly/.test(id));
const out = arg("--out", `scratch/ui-scan/scan-${vp.name}.json`);
const result = { viewport: vp.name, screens: {} };
for (const id of want) {
  const sc = SCREENS.find((s) => s.id === id);
  if (!sc) continue;
  const rec = { name: sc.name, root: sc.root };
  try {
    await page.evaluate(leaveToMenu).catch(() => {});
    await page.evaluate(() => { try { for (const id of ["pmsettings", "carsetup", "select", "career", "datahub", "season-setup", "howtoplay", "trackdesigner", "vsfriend", "teampicker"]) { const e = document.getElementById(id); if (e && !e.hidden) { const back = e.querySelector("[id$=-back],[id$=-close],.back"); if (back) back.click(); } } } catch (_) {} }).catch(() => {});
    await page.goto(url); await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 180000 });
    await sc.open(page, sc.circuit);
    await page.waitForTimeout(400);
    rec.controls = await page.evaluate(SCAN, sc.root);
    if (shots) { const f = `scratch/ui-scan/shots/${vp.name}-${id}.jpg`; await captureShot(page, f, { format: "jpeg", quality: 70 }); rec.shot = f; }
    if (flip) {
      rec.flips = [];
      for (const c of rec.controls) {
        const settable = c.tag === "select" || c.type === "range" || c.type === "checkbox" || c.type === "switch" || (c.tag === "button" && (c.pressed === "true" || c.pressed === "false") && c.inGroup);
        if (!settable) continue;
        if (/reset|delete|clear|quit|import|export|load|save|download|upload|race|start|retire|restart/i.test(c.label)) continue;
        const r = await page.evaluate(FLIP, [sc.root, c.i]).catch((e) => ({ error: String(e).slice(0, 120) }));
        rec.flips.push({ i: c.i, label: c.label, row: c.row, disabled: c.disabled, ...r });
      }
    }
  } catch (e) { rec.error = String(e).slice(0, 300); }
  result.screens[id] = rec;
  console.log("[scan]", id, rec.error ? "ERROR " + rec.error.slice(0, 80) : (rec.controls || []).length + " controls" + (rec.flips ? ", " + rec.flips.length + " flips" : ""));
}
result.errors = errors;
writeFileSync(out, JSON.stringify(result, null, 1));
console.log("[scan] wrote", out);
await browser.close();
