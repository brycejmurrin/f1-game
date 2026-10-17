import { settleLayout, compareSweepPaths } from "./transitions.mjs";
import { collectCssEvidence } from "./css-evidence.mjs";
import { captureAuditEnvironment, joinAuditFindings } from "./audit-evidence.mjs";
// @doc Read-only UI inspection: semantic controls, explicit live bindings, hit tests, CDP styles and state differences.
// Browser APIs: https://chromedevtools.github.io/devtools-protocol/tot/CSS/
// https://playwright.dev/docs/trace-viewer — interaction traces remain owned by explorer replay.

/** Self-contained: safe to pass to page.evaluate, or install on a local dev page. */
export function inspectUI(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Inspector options must be an object");
  if (options.install) {
    if (!window.__apex) throw new Error("Game dev API unavailable");
    if (window.__apex.ui && window.__apex.ui.tool !== "apex-ui-inspector") throw new Error("Existing __apex.ui namespace belongs to another tool");
    Object.defineProperty(window.__apex, "ui", { configurable: true, value: Object.freeze({ tool: "apex-ui-inspector", version: 1, inspect: inspectUI }) });
    return { installed: true, readOnly: true };
  }
  const limit = options.limit ?? 500;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new RangeError("limit must be 1..500");
  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const text = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
  const visible = e => {
    if (!e || e.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    for (let p = e.parentElement; p; p = p.parentElement) {
      if (p.tagName === "DETAILS" && !p.open && !p.querySelector(":scope > summary")?.contains(e)) return false;
    }
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 0 && r.height > 0;
  };
  const selectors = new WeakMap();
  const selector = e => {
    if (!e) return null;
    if (selectors.has(e)) return selectors.get(e);
    const parts = [];
    for (let n = e; n && n.nodeType !== 9; n = n.parentElement) {
      if (n.id && document.querySelectorAll(`#${CSS.escape(n.id)}`).length <= 1) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const tag = n.tagName.toLowerCase();
      const siblings = n.parentElement ? [...n.parentElement.children].filter(c => c.tagName === n.tagName) : [n];
      parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(n) + 1})`);
    }
    const result = parts.join(" > "); selectors.set(e, result); return result;
  };
  const name = e => {
    const ids = (e.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    return text(e.getAttribute("aria-label") || ids.map(id => document.getElementById(id)?.textContent || "").join(" ") ||
      (e.labels ? [...e.labels].map(l => l.textContent).join(" ") : "") || e.textContent || e.getAttribute("title") || "");
  };
  const role = e => e.getAttribute("role") || ({ BUTTON: "button", SUMMARY: "button", TEXTAREA: "textbox",
    SELECT: e.multiple || Number(e.size) > 1 ? "listbox" : "combobox", A: "link" })[e.tagName] ||
    (e.tagName === "INPUT" ? ({ range: "slider", checkbox: "checkbox", radio: "radio", number: "spinbutton", search: "searchbox",
      button: "button", submit: "button", reset: "button" })[e.type] || "textbox" : e.tagName.toLowerCase());
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const css = (style, properties) => Object.fromEntries(properties.split(" ").map(k => [k, style.getPropertyValue?.(k).trim() || null]));
  const layoutProperties = "display position box-sizing width height min-width min-height max-width max-height overflow-x overflow-y zoom transform font-size line-height white-space flex-direction flex-wrap grid-template-columns gap container-type container-name --sheet-scale --sheet-eff-scale --fit-at --compact-at --pair-at --rail-at --tall-at";
  const adaptation = e => Object.fromEntries(["shape", "density", "pair", "rail", "fit"].filter(k => e.dataset?.[k] !== undefined).map(k => [k, e.dataset[k]]));
  const layoutContexts = new Map(); let layoutContextsTruncated = false;
  const scalar = value => typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || typeof value === "string" ? value : null;
  const stored = key => {
    try { return typeof GameStore !== "undefined" ? { status: "read", value: GameStore.store.get(key, null) } : { status: "unavailable", value: null }; }
    catch (_) { return { status: "unavailable", value: null }; }
  };
  const binding = e => {
    const scales = { "pm-uiscale": ["uiScale", "--ui-scale"], "pm-hudscale": ["hudScale", "--hud-scale"], "pm-btnscale": ["hudBtnScale", "--hud-btn-scale"],
      "pm-btnopacity": ["hudBtnOpacity", "--hud-btn-opacity"], "pm-panelopacity": ["hudPanelOpacity", "--hud-panel-a"],
      "as-uiScale": ["uiScale", "--ui-scale"], "as-hudScale": ["hudScale", "--hud-scale"], "as-hudBtnScale": ["hudBtnScale", "--hud-btn-scale"] };
    if (scales[e.id]) {
      const [key, property] = scales[e.id], saved = stored(key);
      const raw = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
      const runtime = raw && Number.isFinite(Number(raw)) ? Number(raw) * 100 : null;
      return { kind: "css-scale", key, source: "js/ui/scale.js", saved, runtime, property, unit: "%",
        status: runtime === null ? "unavailable" : Math.abs(Number(e.value) - runtime) < 0.000001 ? "matches" : "mismatch" };
    }
    const appearance = { "pm-uitheme-sel": ["uiTheme", "theme"], "pm-menuaccent-sel": ["menuAccent", "menuAccent"],
      "pm-hudaccent-sel": ["hudAccent", "hudAccent"], "pm-textsize-sel": ["textSize", "textSize"],
      "pm-contrast-sel": ["uiContrast", "contrast"], "pm-cvd-sel": ["cvdMode", "cvdMode"], "pm-units-sel": ["speedUnits", "units"], "pm-helptext-sel": ["menuHelp", "help"] };
    if (appearance[e.id] && typeof AppearanceOpts !== "undefined") {
      const [key, getter] = appearance[e.id], runtime = safe(() => AppearanceOpts[getter]());
      return { kind: "appearance-preference", key, source: "js/ui/appearance-opts.js", saved: stored(key), runtime,
        status: runtime === null ? "unavailable" : String(e.value) === String(runtime) ? "matches" : "mismatch" };
    }
    if (e.id?.startsWith("ct-cin-") && typeof CamTune !== "undefined") {
      const key = e.id.slice(7), raw = stored("camComfort"), runtime = safe(() => CamTune.comfortGet(key));
      if (!safe(() => CamTune.comfortDefs().some(d => d.id === key), false)) return { status: "unmapped", reason: "Unknown camera comfort key" };
      return { kind: "camera-comfort", key, runtime, saved: { status: raw.status, value: scalar(raw.value?.[key]) },
        status: runtime == null ? "unavailable" : Math.abs(Number(e.value) - runtime) < 0.000001 ? "matches" : "mismatch" };
    }
    if (e.id?.startsWith("ct-in-") && typeof CamTune !== "undefined") {
      const key = e.id.slice(6), global = !!document.querySelector('#ct-scope [data-scope="global"][aria-pressed="true"]');
      if (!safe(() => CamTune.defs().some(d => d.id === key), false)) return { status: "unmapped", reason: "Unknown camera offset key" };
      const mode = document.querySelector('#ct-modes [aria-selected="true"]')?.dataset.mode;
      if (!global && !mode) return { status: "unmapped", reason: "Camera mode is not selected" };
      const raw = stored(global ? "camTuneGlobal" : "camTune"), pack = global ? raw.value : raw.value?.[mode];
      const runtime = safe(() => global ? CamTune.getGlobal(key) : CamTune.getModeOnly(mode, key));
      return { kind: "camera-offset", key, mode: global ? "global" : mode, source: "js/camera/tuner-panel.js",
        runtime: scalar(runtime), resolved: safe(() => CamTune.values(mode || "chase")[key]),
        saved: { status: raw.status, value: scalar(pack?.[key]) },
        status: runtime == null ? "unavailable" : Math.abs(Number(e.value) - runtime) < 0.000001 ? "matches" : "mismatch",
        limitation: "Resolved camera offset; rendered lens and pixels require a separate frame check" };
    }
    if (e.id?.startsWith("lt-in-") && typeof LightTune !== "undefined") {
      const key = e.id.slice(6), runtime = scalar(LightTune.LT[key]);
      if (!safe(() => LightTune.TUNE_DEFS.some(d => d.id === key), false)) return { status: "unmapped", reason: "Unknown lighting key" };
      return { kind: "lighting-input", key, source: "js/lighting/tuner-panel.js", runtime,
        status: runtime === null ? "unavailable" : Math.abs(Number(e.value) - runtime) < 0.000001 ? "matches" : "mismatch",
        saved: { status: "unmapped", value: null }, limitation: "Profile persistence and rendered lighting not inferred from the slider" };
    }
    return { status: "unmapped", reason: "No explicit runtime adapter registered" };
  };
  // UiLayers.top() stamps modal ordering; inspect DOM focus without mutating it.
  const top = safe(() => document.activeElement?.closest('dialog[open],[role="dialog"]'));
  const scope = options.root ? document.querySelector(options.root) : document;
  if (!scope) throw new Error(`Inspector root missing: ${options.root}`);
  const roots = [...document.querySelectorAll('.screen,dialog,[role="dialog"],#overlay,#hud,#pausemenu,#photo-studio')].filter(visible).map(e => e.id || name(e));
  const candidates = [...scope.querySelectorAll('button,a[href],input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="switch"],[role="slider"],[role="checkbox"],[role="radio"]')].filter(visible);
  const controls = [], issues = [];
  for (const e of candidates.slice(0, limit)) {
    const r = e.getBoundingClientRect(), sel = selector(e), label = name(e);
    let left = Math.max(0, r.x), right = Math.min(innerWidth, r.right), topY = Math.max(0, r.y), bottom = Math.min(innerHeight, r.bottom);
    let scrollX = false, scrollY = false;
    let reachableX = [r.x, r.right], reachableY = [r.y, r.bottom];
    const clippedBy = [], layoutAncestors = [];
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p), b = p.getBoundingClientRect();
      if (layoutAncestors.length < 12) {
        const key = selector(p);
        if (!layoutContexts.has(key) && layoutContexts.size < 256) layoutContexts.set(key, { selector: key, box: box(p),
          boxGenerated: s.display !== "contents", adaptation: adaptation(p), computed: css(s, layoutProperties),
          scroll: { left: p.scrollLeft, top: p.scrollTop, width: p.scrollWidth, height: p.scrollHeight, clientWidth: p.clientWidth, clientHeight: p.clientHeight } });
        if (layoutContexts.has(key)) layoutAncestors.push(key); else layoutContextsTruncated = true;
      } else layoutContextsTruncated = true;
      // display:contents has no principal box. Its zero rect cannot clip children;
      // continue walking so an outer real scrolling/clipping box still counts.
      if (s.display === "contents") continue;
      const sx = /(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1;
      const sy = /(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 1;
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
        const outside = scrollX ? reachableX[1] <= b.x || reachableX[0] >= b.right : reachableX[0] < b.x - 1 || reachableX[1] > b.right + 1;
        if (!sx && outside) clippedBy.push({ selector: selector(p), axis: "x" });
        left = Math.max(left, b.x); right = Math.min(right, b.right);
      }
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY)) {
        const outside = scrollY ? reachableY[1] <= b.y || reachableY[0] >= b.bottom : reachableY[0] < b.y - 1 || reachableY[1] > b.bottom + 1;
        if (!sy && outside) clippedBy.push({ selector: selector(p), axis: "y" });
        topY = Math.max(topY, b.y); bottom = Math.min(bottom, b.bottom);
      }
      if (sx) reachableX = [b.x, b.right];
      if (sy) reachableY = [b.y, b.bottom];
      scrollX ||= sx; scrollY ||= sy;
    }
    const disabled = e.matches ? e.matches(":disabled") || e.getAttribute("aria-disabled") === "true" : !!e.disabled;
    const hit = right > left && bottom > topY ? safe(() => document.elementFromPoint((left + right) / 2, (topY + bottom) / 2)) : null;
    // A native label activates its control, so a tap landing on it is a hit and
    // its box is part of the target (a checkbox inside a full-width label row).
    const labels = safe(() => [...(e.labels || [])], []);
    const hits = hit && (hit === e || e.contains(hit) || labels.some(l => l === hit || l.contains(hit)));
    // The root itself answering means nothing painted takes the point (a
    // transition, pointer-events:none): not another control covering this one.
    const bare = hit && !hits && (hit === document.documentElement || hit === document.body);
    // A scroller edge can leave a sliver of the control visible, its centre under the sibling past the edge
    // (customize NAME/CODE, T11): that control is scrolled away, not blocked, so a tap needs a scroll first.
    const sliver = (scrollX || scrollY) && (right - left) * (bottom - topY) < 0.5 * r.width * r.height;
    const reachability = { scrollX, scrollY, clippedBy, hit: disabled ? "disabled" : !hit ? "not-tested" : hits ? "hits" : bare ? "not-hit-testable" : sliver ? "needs-scroll" : "blocked", interceptor: hit && !hits ? selector(hit) : null };
    const area = labels.reduce((a, l) => { const b = l.getBoundingClientRect();
      return b.width && b.height ? { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) } : a; },
      { x: r.x, y: r.y, right: r.right, bottom: r.bottom });
    const target = { width: area.right - area.x, height: area.bottom - area.y };
    const c = { selector: sel, role: role(e), name: label, disabled, checked: e.checked, expanded: e.getAttribute("aria-expanded"),
      pressed: e.getAttribute("aria-pressed"), selected: e.getAttribute("aria-selected"), open: e.tagName === "SUMMARY" ? e.parentElement?.open : undefined,
      value: e.type === "password" || /password|secret|token/i.test(e.name || "") ? "[redacted]" : typeof e.value === "string" ? e.value.slice(0, 512) : e.value,
      min: e.min || null, max: e.max || null, step: e.step || null, box: box(e), reachability, binding: binding(e),
      layout: css(getComputedStyle(e), layoutProperties), layoutAncestors };
    controls.push(c);
    const issue = (kind, message) => issues.push({ kind, selector: sel, message });
    if (!label) issue("unnamed", "Visible control has no name in this DOM screening.");
    if (((r.x < -1 || r.right > innerWidth + 1) && !scrollX) || ((r.y < -1 || r.bottom > innerHeight + 1) && !scrollY)) issue("offscreen", `${label || sel} escapes the viewport without scrolling on that axis.`);
    if (clippedBy.length) issue("clipped", `${label || sel} extends past a non-scrolling clip.`);
    if (reachability.hit === "blocked" && !disabled) issue("blocked", `${label || sel} is intercepted by ${reachability.interceptor}.`);
    if (reachability.hit === "not-hit-testable" && !disabled) issue("not-hit-testable", `${label || sel}: its visible centre hit-tests to ${reachability.interceptor} (nothing painted takes the point).`);
    if (!disabled && Math.min(target.width, target.height) < (matchMedia("(pointer:coarse)").matches ? 44 : 24)) issue("tiny-target", `${label || sel} target is ${target.width.toFixed(1)} × ${target.height.toFixed(1)} CSS px${labels.length ? " including its label" : ""}.`);
    if (c.binding.status === "mismatch") issue("binding-mismatch", `${label || sel}: DOM value differs from its live binding.`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 2) issues.push({ kind: "overflow", selector: "html", message: "Document has horizontal overflow." });
  const rootStyle = getComputedStyle(document.documentElement), vv = window.visualViewport;
  const media = ["(orientation: portrait)", "(pointer: coarse)", "(hover: hover)", "(prefers-reduced-motion: reduce)", "(forced-colors: active)"];
  const adaptive = { visualViewport: vv ? { width: vv.width, height: vv.height, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, scale: vv.scale } : null,
    devicePixelRatio: window.devicePixelRatio || null, media: Object.fromEntries(media.map(q => [q, matchMedia(q).matches])),
    rootTokens: css(rootStyle, "--ui-scale --hud-scale --hud-btn-scale --safe-t --safe-r --safe-b --safe-l --safe-w --safe-h --tap-min --tap-paint"),
    preferences: Object.fromEntries(["uiTheme", "menuAccent", "hudAccent", "textSize", "uiContrast", "cvd", "menuHelp", "motion"].filter(k => document.documentElement.dataset[k] !== undefined).map(k => [k, document.documentElement.dataset[k]])) };
  return { version: 1, readOnly: true, title: document.title, url: location.href, root: options.root || null,
    roots: [...new Set(roots)], topLayer: top ? selector(top) : null, topLayerSource: "focused-dialog; stacking order not inferred",
    dialogs: [...document.querySelectorAll('dialog[open],[role="dialog"]')].filter(visible).map(e => e.id || name(e)),
    viewport: { width: innerWidth, height: innerHeight, textScale: Number(document.documentElement.dataset.explorerTextScale || 100) },
    adaptive, layoutContexts: [...layoutContexts.values()], layoutContextsTruncated,
    controls, issues, totalControls: candidates.length, truncated: candidates.length > limit,
    focus: document.activeElement ? { selector: selector(document.activeElement), name: name(document.activeElement), tag: document.activeElement.tagName } : null,
    errorOverlay: [...document.querySelectorAll('#__err_overlay,#vite-error-overlay')].filter(visible).map(e => e.textContent.slice(0, 1000)),
    game: { devAPI: !!window.__apex }, limitations: ["DOM names are screening; accessibility snapshot is authoritative", "Only explicit scale/appearance/camera/lighting bindings are mapped", "No game dev hooks invoked: some getters lazily build tracks", "CSS tokens retain browser serialization, including unresolved calc expressions; visual viewport metadata does not prove virtual keyboard behavior", "Layout ancestry is bounded to 12 ancestors per control and 256 unique contexts; clipping still checks every ancestor"] };
}

export async function installInspector(page) { return page.evaluate(inspectUI, { install: true }); }

/** Browser-computed values plus matched source declarations; never guesses cascade winners. */
export async function inspectPage(page, { root, styles, source = null, audits = null } = {}) {
  const report = await page.evaluate(inspectUI, { root });
  const aria = await page.locator(root || "body").ariaSnapshot({ timeout: 10000 });
  report.accessibility = aria.slice(0, 64000); report.accessibilityTruncated = aria.length > 64000;
  report.environment = await page.evaluate(captureAuditEnvironment, { root: root || "body", source });
  if (styles) report.styles = await collectCssEvidence(page, { selector: styles });
  if (audits !== null) report.auditEvidence = joinAuditFindings(report, audits);
  return report;
}

/** Settle (one retry), inspect, and mark issues provisional when the layout never stopped moving. */
export async function inspectSettled(page, { root, styles, source = null, audits = null } = {}) {
  let settlement = await page.evaluate(settleLayout, { root });
  // One more budget before judging: the first resize after boot often
  // outlasts a single sample window. Still moving after that, the issues are
  // provisional — a hit test mid-transition is not a defect.
  // No frames at all (rAF paused, e.g. a background tab) cannot settle with more time: no retry.
  if (settlement && settlement.stable === false && settlement.frames > 0) settlement = { ...await page.evaluate(settleLayout, { root }), retried: true };
  const inspection = await inspectPage(page, { root, styles, source, audits });
  if (settlement && settlement.stable === false) {
    inspection.provisional = true;
    for (const i of inspection.issues || []) i.provisional = true;
  }
  return { settlement, inspection };
}

export function diffInspections(before, after) {
  const index = report => new Map(report.controls.map(c => [c.selector, c]));
  const a = index(before), b = index(after), changed = [], layout = [];
  const semantics = c => { const { box, reachability, layout, layoutAncestors, ...rest } = c; return rest; };
  for (const [selector, control] of b) if (a.has(selector)) {
    if (JSON.stringify(semantics(a.get(selector))) !== JSON.stringify(semantics(control))) changed.push({ selector, before: semantics(a.get(selector)), after: semantics(control) });
    if (JSON.stringify([a.get(selector).box, a.get(selector).reachability, a.get(selector).layout, a.get(selector).layoutAncestors]) !== JSON.stringify([control.box, control.reachability, control.layout, control.layoutAncestors])) layout.push(selector);
  }
  const contexts = new Map((before.layoutContexts || []).map(c => [c.selector, c]));
  const layoutContexts = (after.layoutContexts || []).filter(c => JSON.stringify(contexts.get(c.selector)) !== JSON.stringify(c)).map(c => c.selector);
  layoutContexts.push(...[...contexts.keys()].filter(k => !(after.layoutContexts || []).some(c => c.selector === k)));
  return { added: [...b.keys()].filter(k => !a.has(k)), removed: [...a.keys()].filter(k => !b.has(k)), changed: changed.slice(0, 100), changedTotal: changed.length, truncated: changed.length > 100, layout,
    layoutContexts,
    viewportChanged: JSON.stringify(before.viewport) !== JSON.stringify(after.viewport), environmentChanged: JSON.stringify(before.adaptive) !== JSON.stringify(after.adaptive),
    focusChanged: JSON.stringify(before.focus) !== JSON.stringify(after.focus), rootsChanged: JSON.stringify(before.roots) !== JSON.stringify(after.roots), issues: after.issues };
}

/** Explicit viewport mutation only. Reuse the current tab/state; never guess a screen's opener or change saved settings. */
export async function inspectResponsive(page, { viewports, root, styles, roundTrip = false, source = null, audits = null } = {}) {
  if (!Array.isArray(viewports) || viewports.length < 1 || viewports.length > 8 || viewports.some(v => !v || !Number.isInteger(v.width) || !Number.isInteger(v.height) || v.width < 240 || v.width > 3840 || v.height < 240 || v.height > 2160))
    throw new RangeError("viewports must contain 1..8 sizes: integer width 240..3840, height 240..2160");
  if (typeof roundTrip !== "boolean") throw new TypeError("roundTrip must be boolean");
  const originalViewport = page.viewportSize();
  if (!originalViewport) throw new Error("Viewport sweep requires an explicit, restorable Playwright viewport");
  const records = [], sequence = viewports.map((viewport, sourceIndex) => ({ viewport, sourceIndex, phase: "forward" }));
  if (roundTrip) for (let i = viewports.length - 2; i >= 0; i--) sequence.push({ viewport: viewports[i], sourceIndex: i, phase: "reverse" });
  try {
    for (const { viewport, sourceIndex, phase } of sequence) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { settlement, inspection } = await inspectSettled(page, { root, styles, source, audits });
      records.push({ requestedViewport: { width: viewport.width, height: viewport.height }, sourceIndex, phase, settlement, inspection,
        diff: records.length ? diffInspections(records.at(-1).inspection, inspection) : null });
    }
  } finally { await page.setViewportSize(originalViewport); }
  return { version: 1, mode: "viewport-sweep", roundTrip, originalViewport, restoredViewport: true, records,
    ...(roundTrip ? { paths: compareSweepPaths(records) } : {}),
    limitations: ["Only viewport size is changed; pointer, safe-area, scale and appearance settings remain those of the current page (inspect --touch/--boot/--safe set them for the whole session)", "Issues from a record that did not settle after one retry are marked provisional", "Stability samples up to 500 elements for at most 120 frames / two seconds; quiet samples cannot rule out later asynchronous changes", "Resize handlers can change application state; restoring viewport does not undo those transitions", "Advisories are not functional passes or confirmed CSS defects"] };
}
