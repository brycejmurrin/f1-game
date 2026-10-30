// @doc UI flows browser probes: real taps/keys, one fresh context per check group; evidence for flows/core.mjs.
// @skill ui-menu-a11y
// Ported from the 2026-10-29 hunt's scratch jobs (sweep, dbl3, persist, rot, stale, bfs, back).
// No overlay reset: a group that loses the title opens a fresh context instead
// (tools/ui/explorer/browser.mjs openSession), so nothing here depends on a harness reset.
// Touch API: https://playwright.dev/docs/api/class-touchscreen (tap = touchstart+touchend → click);
// Back: https://playwright.dev/docs/api/class-page#page-go-back (same-document entries resolve null).
import { openSession, performAction } from "../explorer/browser.mjs";
import { SETTINGS_PAGES, PERSIST_SKIP, BACK_DOORS, SEARCH_QUERY, SCREENS } from "./core.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const msg = (e) => String((e && e.message) || e).split("\n")[0].slice(0, 300);

/** Top layer, focus, race flag and Settings route, read in the page. */
export const st = (p) => p.evaluate(() => {
  const t = UiLayers.top(), a = document.activeElement;
  return { top: t ? t.id : null, focus: a && a !== document.body ? (a.id || a.tagName.toLowerCase()) : "body",
    inRace: document.body.classList.contains("in-race"),
    route: typeof SettingsNav !== "undefined" && SettingsNav.current ? SettingsNav.current() : null };
});

/** Poll st() until pred holds or ms elapse; returns the last state. */
async function waitSt(p, pred, ms = 8000) {
  const end = Date.now() + ms; let s;
  do { s = await st(p); if (pred(s)) return s; await sleep(150); } while (Date.now() < end);
  return s;
}

async function activate(s, sel) {
  const l = s.page.locator(sel).first();
  await l.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
  if (s.touch) await l.tap({ timeout: 8000 }); else await l.click({ timeout: 8000 });
}
async function press(p, k) { await p.keyboard.press(k); await sleep(250); }
async function toTitle(p) {
  for (let i = 0; i < 3; i++) { if ((await st(p)).top === "overlay") return true; await press(p, "Escape"); await sleep(400); }
  return (await st(p)).top === "overlay";
}
/** Open a SCREENS chain from the title; each door must change the top layer or route. */
async function openScreen(s, name) {
  const scr = SCREENS.find((x) => x.name === name);
  if (!scr) throw new Error(`unknown screen ${name}`);
  for (const sel of scr.open) {
    const before = await st(s.page);
    await activate(s, sel);
    await waitSt(s.page, (x) => x.top !== before.top || x.route !== before.route, 8000);
    await sleep(600);
  }
}

/** One check group: a fresh context on demand; page errors of every context collected. */
async function group(env, run) {
  let s = null; const errors = [];
  const close = async () => { if (s) { errors.push(...s.logs.errors); await s.context.close().catch(() => {}); s = null; } };
  const fresh = async () => {
    await close();
    s = await openSession(env.browser, env.url, { touch: env.touch, viewport: env.viewport, background: true, timeout: 120000 });
    s.touch = env.touch;
    return s;
  };
  try { return { evidence: await run(fresh), errors }; } finally { await close(); }
}

/** doors + focus: tap each door, Escape (≤2) back to the title, read focus. */
export function probeDoors(env, doors) {
  return group(env, async (fresh) => {
    let s = await fresh(); const out = [];
    for (const door of doors) {
      const ev = { door };
      out.push(ev);
      try {
        if (!(await s.page.locator("#" + door).isVisible())) { ev.missing = true; continue; }
        await activate(s, "#" + door);
        const o = await waitSt(s.page, (x) => x.inRace || (x.top && x.top !== "overlay"), 10000);
        ev.opened = o.top; ev.inRace = o.inRace;
        if (o.inRace) { s = await fresh(); continue; }
        if (!o.top || o.top === "overlay") continue;
        await sleep(600);
        ev.escapes = [];
        for (let i = 0; i < 2; i++) {
          await s.page.keyboard.press("Escape");
          // #loading is a transition plate (closing the GARAGE shows RETURNING
          // for ~3 s on SwiftShader): wait it out before judging where Escape went.
          const x = await waitSt(s.page, (y) => y.top === "overlay", 2500)
            .then((y) => y.top === "loading" ? waitSt(s.page, (z) => z.top !== "loading", 20000) : y);
          ev.escapes.push(x.top);
          if (x.top === "overlay") { await sleep(400); ev.focusAfter = (await st(s.page)).focus; break; }
        }
        if (ev.escapes[ev.escapes.length - 1] !== "overlay") s = await fresh();
      } catch (e) { ev.err = msg(e); s = await fresh(); }
    }
    return out;
  });
}

/** doubletap: two taps 120 ms apart at the door's centre; a capture listener records every click that got past the shield. */
export function probeDoubletap(env, doors) {
  return group(env, async (fresh) => {
    let s = await fresh(); const out = [];
    for (const door of doors) {
      const ev = { door, webdriverForced: true };
      out.push(ev);
      try {
        if (!(await toTitle(s.page))) s = await fresh();
        const p = s.page;
        if (!(await p.locator("#" + door).isVisible())) { ev.missing = true; continue; }
        await p.evaluate(() => {
          // modal.js onClickShield returns early when navigator.webdriver === true; an own property shadows the getter.
          Object.defineProperty(navigator, "webdriver", { get: () => false, configurable: true });
          window.__flowClicks = [];
          if (window.__flowClicksOn) return;
          window.__flowClicksOn = true;
          // document capture runs after modal.js's window-capture shield, so a swallowed tap never lands here.
          document.addEventListener("click", (e) => {
            const t = UiLayers.top(), el = e.target;
            const c = (el.closest && el.closest("button,summary,a,input,select,label,[role=tab],.track-row")) || el;
            window.__flowClicks.push({ el, at: performance.now(), top: t ? t.id : null, inTop: !!t && t.id !== "overlay" && t.contains(el),
              id: (c.id ? "#" + c.id : c.tagName.toLowerCase() + "." + String(c.className).split(" ")[0]) + (c.textContent ? "«" + c.textContent.trim().replace(/\s+/g, " ").slice(0, 22) + "»" : "") });
          }, true);
        });
        await p.locator("#" + door).scrollIntoViewIfNeeded().catch(() => {});
        const bb = await p.locator("#" + door).boundingBox();
        const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
        if (s.touch) { await p.touchscreen.tap(x, y); await sleep(120); await p.touchscreen.tap(x, y); }
        else { await p.mouse.click(x, y); await sleep(120); await p.mouse.click(x, y); }
        await sleep(1800);
        Object.assign(ev, await p.evaluate((d) => {
          const door = document.getElementById(d), t = UiLayers.top(), list = window.__flowClicks || [];
          const t0 = list.length ? list[0].at : 0;
          return { finalTop: t ? t.id : null, inRace: document.body.classList.contains("in-race"),
            clicks: list.map((c) => ({ id: c.id, top: c.top, inTop: c.inTop, inDoor: !!door && (door === c.el || door.contains(c.el)), dt: Math.round(c.at - t0) })) };
        }, door));
        if (ev.inRace || !(await toTitle(p))) s = await fresh();
      } catch (e) { ev.err = msg(e); s = await fresh(); }
    }
    return out;
  });
}

/** escape: Settings → sub-page → Escape → Escape. */
export function probeEscape(env) {
  return group(env, async (fresh) => {
    let s = await fresh(); const out = [];
    for (const pg of SETTINGS_PAGES) {
      const ev = { route: pg.route };
      out.push(ev);
      try {
        if (!(await toTitle(s.page))) s = await fresh();
        const p = s.page;
        await activate(s, "#mb-settings");
        await waitSt(p, (x) => x.top === "pmsettings", 8000);
        await activate(s, "#" + pg.door);
        ev.opened = await waitSt(p, (x) => x.route === pg.route, 4000);
        await sleep(400);
        await p.keyboard.press("Escape");
        await waitSt(p, (x) => x.route !== pg.route || x.top !== "pmsettings", 2500);
        await sleep(500); ev.step1 = await st(p);
        await p.keyboard.press("Escape");
        await waitSt(p, (x) => x.top === "overlay", 2500);
        await sleep(300); ev.step2 = await st(p);
      } catch (e) { ev.err = msg(e); s = await fresh(); }
    }
    return out;
  });
}

/** back: tap a door (user activation arms the deep-link sentinel), then browser Back. */
export function probeBack(env) {
  return group(env, async (fresh) => {
    let s = await fresh(); const out = [];
    for (const door of BACK_DOORS) {
      const ev = { door };
      out.push(ev);
      try {
        if (!(await toTitle(s.page))) s = await fresh();
        const p = s.page;
        await activate(s, "#" + door);
        ev.opened = (await waitSt(p, (x) => x.top && x.top !== "overlay", 8000)).top;
        await sleep(600);
        ev.histBefore = await p.evaluate(() => history.length);
        await p.goBack({ timeout: 8000, waitUntil: "commit" }).catch((e) => { ev.goBackErr = msg(e); });
        await sleep(1500);
        ev.after = await p.evaluate(() => ({ href: location.href, hasApex: !!window.__apex,
          top: typeof UiLayers !== "undefined" && UiLayers.top() ? UiLayers.top().id : null })).catch(() => null);
        if (!ev.after || !ev.after.hasApex) s = await fresh();
      } catch (e) { ev.err = msg(e); s = await fresh(); }
    }
    return out;
  });
}

const readSettings = (p) => p.evaluate(() => {
  const o = {}, t = UiLayers.top();
  for (const el of t.querySelectorAll(".set-row select, input[type=checkbox][id], input[type=range][id]")) {
    if (el.getBoundingClientRect().height === 0 && el.tagName !== "SELECT") continue;
    const row = el.closest(".set-row"); if (row && row.getBoundingClientRect().height === 0) continue;
    o[el.id] = el.type === "checkbox" ? el.checked : el.value;
  }
  return o;
});
async function openSettingsPage(s, door) {
  if ((await st(s.page)).top !== "pmsettings") { await activate(s, "#mb-settings"); await waitSt(s.page, (x) => x.top === "pmsettings", 8000); }
  await activate(s, "#" + door); await sleep(900);
}

/** persist: step every visible row's next button, reload in the SAME context, compare. */
export function probePersist(env) {
  return group(env, async (fresh) => {
    const s = await fresh(); const p = s.page; const changed = {}; const errors = [];
    for (const pg of SETTINGS_PAGES) {
      try {
        await openSettingsPage(s, pg.door);
        const ids = await p.evaluate((skip) => {
          const t = UiLayers.top();
          return [...t.querySelectorAll('.set-row [data-step="1"], input[type=checkbox][id]')].filter((b) => {
            const row = b.closest(".set-row") || b.closest("label") || b;
            return row.getBoundingClientRect().height > 0 && !b.disabled && !new RegExp(skip, "i").test(b.id);
          }).map((b) => b.id);
        }, PERSIST_SKIP.source);
        const before = await readSettings(p);
        for (const id of ids) { await p.evaluate((i) => document.getElementById(i).click(), id); await sleep(120); }
        await sleep(400);
        const after = await readSettings(p);
        for (const k of Object.keys(after)) if (after[k] !== before[k]) changed[pg.door + ":" + k] = [before[k], after[k]];
        await toTitle(p);
      } catch (e) { errors.push(pg.route + ": " + msg(e)); await toTitle(p).catch(() => {}); }
    }
    await performAction(s, { type: "reload" });
    await p.locator("#mb-race").waitFor({ state: "visible", timeout: 90000 }); await sleep(1500);
    const now = {};
    for (const pg of SETTINGS_PAGES) {
      try {
        await openSettingsPage(s, pg.door);
        for (const [k, v] of Object.entries(await readSettings(p))) now[pg.door + ":" + k] = v;
        await toTitle(p);
      } catch (e) { errors.push("after reload " + pg.route + ": " + msg(e)); }
    }
    const rows = Object.entries(changed).map(([key, [before, set]]) => ({ key, before, set, afterReload: Object.hasOwn(now, key) ? now[key] : null }));
    return { rows, errors };
  });
}

/** search: type a query into FIND A SETTING, close Settings, reopen, read the field. */
export function probeSearch(env) {
  return group(env, async (fresh) => {
    const s = await fresh(); const p = s.page; const ev = { query: SEARCH_QUERY };
    const field = "#pmsettings [data-settings-search] input";
    try {
      await activate(s, "#mb-settings"); await waitSt(p, (x) => x.top === "pmsettings", 8000);
      await p.locator(field).first().fill(SEARCH_QUERY); await sleep(800);
      ev.filtered = await p.evaluate(() => [...document.querySelectorAll("#pmsettings .settings-find-results li")].filter((e) => e.getBoundingClientRect().height > 0).length);
      await press(p, "Escape"); await sleep(400);
      ev.firstEscTop = (await st(p)).top;
      if (!(await toTitle(p))) throw new Error("Settings did not close to the title");
      await activate(s, "#mb-settings"); await waitSt(p, (x) => x.top === "pmsettings", 8000); await sleep(500);
      ev.reopenValue = await p.evaluate((sel) => { const i = document.querySelector(sel); return i ? i.value : null; }, field);
    } catch (e) { ev.err = msg(e); }
    return ev;
  });
}

const rotSnap = (p) => p.evaluate(() => {
  const t = UiLayers.top(), a = document.activeElement, r = a.getBoundingClientRect();
  return { top: t ? t.id : null, focus: a && a !== document.body ? (a.id || a.tagName.toLowerCase()) : "body",
    focusInView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
});

/** rotate: focus a mid control, swap the viewport's sides, swap back. */
export function probeRotate(env, screens) {
  return group(env, async (fresh) => {
    let s = await fresh(); const out = [];
    const { width: w, height: h } = env.viewport;
    for (const screen of screens) {
      const ev = { screen };
      out.push(ev);
      try {
        if (!(await toTitle(s.page))) s = await fresh();
        const p = s.page;
        await openScreen(s, screen);
        await p.evaluate(() => {
          const t = UiLayers.top(); const f = [...t.querySelectorAll("button")].filter((b) => b.getBoundingClientRect().height > 0 && !b.disabled);
          const m = f[Math.floor(f.length * 0.6)]; if (m) { m.focus(); m.scrollIntoView({ block: "center" }); }
        });
        await sleep(400); ev.a = await rotSnap(p);
        await p.setViewportSize({ width: h, height: w }); await sleep(1200); ev.portrait = await rotSnap(p);
        await p.setViewportSize({ width: w, height: h }); await sleep(1200); ev.back = await rotSnap(p);
      } catch (e) { ev.err = msg(e); s = await fresh(); }
    }
    return out;
  });
}

// Stable control id inside the top layer: #id, else index among MenuNav.FOCUSABLE + text.
const IDENT = `(e)=>{ if(!e) return null; if(e.id) return '#'+e.id; const t=UiLayers.top(); const all=[...t.querySelectorAll(MenuNav.FOCUSABLE||'button')]; return 'idx'+all.indexOf(e)+':'+(e.textContent||'').trim().slice(0,14); }`;
async function bfs(p, maxN = 90) {
  const start = await p.evaluate(`(${IDENT})(document.activeElement)`);
  const nodes = await p.evaluate(`(()=>{ const id=${IDENT}; const t=UiLayers.top(); return [...t.querySelectorAll(MenuNav.FOCUSABLE||'button')].filter(e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&!e.disabled}).map(id); })()`);
  const seen = new Set([start]), q = [start]; let steps = 0;
  while (q.length && steps < maxN) {
    const cur = q.shift(); steps++;
    for (const k of ["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"]) {
      const ok = await p.evaluate(`(()=>{ const id=${IDENT}; const t=UiLayers.top(); if(!t) return false; const e=[...t.querySelectorAll(MenuNav.FOCUSABLE||'button'), ...document.querySelectorAll('[id]')].find(x=>id(x)===${JSON.stringify(cur)}); if(!e) return false; e.focus(); return document.activeElement===e; })()`);
      if (!ok) break;
      await p.keyboard.press(k); await sleep(60);
      const to = await p.evaluate(`(${IDENT})(document.activeElement)`);
      if (to && !seen.has(to)) { seen.add(to); q.push(to); }
    }
  }
  return { start, n: nodes.length, reached: nodes.filter((x) => seen.has(x)).length, unreached: nodes.filter((x) => !seen.has(x)), truncated: q.length > 0 };
}

/** dpad: BFS over the arrow keys from each screen's initial focus. */
export function probeDpad(env, screens) {
  return group(env, async (fresh) => {
    let s = await fresh(); const out = [];
    for (const screen of screens) {
      const ev = { screen };
      out.push(ev);
      try {
        if (!(await toTitle(s.page))) s = await fresh();
        await openScreen(s, screen); await sleep(800);
        Object.assign(ev, await bfs(s.page, 90));
      } catch (e) { ev.err = msg(e); s = await fresh(); }
    }
    return out;
  });
}
