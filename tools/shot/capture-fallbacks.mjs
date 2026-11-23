// @doc What a capture drew LESS of, or loaded MORE of, than a player's page (#5790): the TLX software-renderer fallbacks
// and the baked models a tool prefetched beyond the circuit's own set. Print it beside every image.
//
// Why. On a box with no real GPU TLX deliberately draws less (a zenith-only fallback sky, instanced batches skipped on
// software WebGPU, liteGpu), and `apex26.tlxForceHw=<list>` puts most of it back (docs/ARCHITECTURE.md). A capture
// that does not say which was active can be filed as a renderer finding when it was the fallback sky reflected in wet
// tarmac. Likewise the capture tools call Assets.loadModels() (the WHOLE pack) where a player's page loads only the
// models its circuit's scenery names (Assets.modelIds(src), lazy-bundles.js sceneryModels), so a tool can frame a
// model a player never gets.

// Runs IN THE PAGE (page.evaluate(readCaptureFallbacks, trackId)): self-contained, never throws.
export function readCaptureFallbacks(trackId) {
  const out = { tlx: false };
  try {
    const t = typeof GLX !== "undefined" && GLX ? GLX.__tlx : null;
    if (t) {
      out.tlx = true;
      const b = typeof t.backendState === "function" ? t.backendState() : null;
      if (b) {
        out.softwareGL = !!b.softwareGL; out.softAdapter = !!b.softAdapter;
        out.skipBatches = !!b.skipBatches; out.liteGpu = !!b.liteGpu;
      }
      const s = typeof t.skyState === "function" ? t.skyState() : null;
      if (s) out.skyFallback = !!s.fallback;
    }
  } catch (e) { out.err = String((e && e.message) || e); }
  try {
    out.forceHw = String(localStorage.getItem("apex26.tlxForceHw") || "").split(",").map((p) => p.trim()).filter(Boolean);
  } catch (_) { out.forceHw = []; }
  try {
    if (typeof Assets !== "undefined" && Assets && typeof Assets.models === "function" && typeof Assets.modelSync === "function") {
      out.resident = Assets.models().filter((id) => !!Assets.modelSync(id));
      const id = trackId || (window.__apex && window.__apex.info && window.__apex.info().track) || null;
      const list = typeof Tracks !== "undefined" && Tracks && Tracks.LIST ? Tracks.LIST : [];
      const def = id ? list.find((d) => d && d.id === id) : null;
      const registry = (typeof TrackScenery !== "undefined" && TrackScenery) || (window.TrackScenery) || null;
      // Prefer TrackDef.scenerySource so ENGINE_MODELS flags (e.g. bakedPines → pine_lod0) count as player models (#6037).
      const src = def && typeof TrackDef !== "undefined" && TrackDef && typeof TrackDef.scenerySource === "function"
        ? TrackDef.scenerySource(def, registry)
        : ((def && def.scenery) || (id && registry && registry[id]) ? String((def && def.scenery) || registry[id]) : null);
      out.track = id;
      out.playerModels = src && typeof Assets.modelIds === "function" ? Assets.modelIds(src) : null;
    }
  } catch (e) { out.modelsErr = String((e && e.message) || e); }
  return out;
}

// The software-only states, in print order: field → what the frame lacks while it is true.
export const FALLBACKS = Object.freeze([
  ["skyFallback", "zenith-only fallback sky (no clouds, stars, moon or sun disc)"],
  ["skipBatches", "instanced scenery batches not drawn (software WebGPU)"],
  ["softwareGL", "software renderer (shadows shrunk, env probe cleared)"],
  ["liteGpu", "liteGpu budget (no MSAA, 16-lamp cap)"],
]);

// Pure: the page state → the report. `parity` is false while any fallback is active, so a capture never calls
// itself a parity capture on the software path; `extraModels` is what the tool loaded beyond the player's set
// (null when the circuit's set could not be read, which is itself not parity-proof).
export function summarizeCaptureFallbacks(state) {
  const s = state || {};
  const active = s.tlx ? FALLBACKS.filter(([k]) => s[k] === true).map(([k]) => k) : [];
  const fields = {};
  for (const [k] of FALLBACKS) fields[k] = s.tlx ? (typeof s[k] === "boolean" ? s[k] : null) : null;
  const player = Array.isArray(s.playerModels) ? s.playerModels : null;
  const resident = Array.isArray(s.resident) ? s.resident : [];
  const extraModels = player ? resident.filter((id) => !player.includes(id)) : (resident.length ? resident.slice() : []);
  const unknownSet = !player && resident.length > 0;
  return {
    tlx: !!s.tlx, ...fields, forceHw: Array.isArray(s.forceHw) ? s.forceHw : [],
    active, parity: !!s.tlx && active.length === 0 && extraModels.length === 0 && !s.err,
    track: s.track ?? null, extraModels, playerModels: player, modelsUnknown: unknownSet,
    ...(s.err ? { err: s.err } : {}),
  };
}

// One line for the console, beside the "wrote <image>" line.
export function formatCaptureFallbacks(sum) {
  const parts = [];
  if (!sum.tlx) parts.push("backend: not TLX (no fallback fields)");
  else parts.push(sum.active.length ? `fallbacks ACTIVE: ${sum.active.join(", ")}` : "fallbacks: none");
  if (sum.forceHw.length) parts.push(`tlxForceHw=${sum.forceHw.join(",")}`);
  if (sum.extraModels.length) {
    parts.push(`${sum.modelsUnknown ? "models loaded (circuit set unknown)" : "extra models a player's page does not load"}: ${sum.extraModels.join(", ")}`);
  }
  parts.push(`parity: ${sum.parity}`);
  return `capture state — ${parts.join(" · ")}` + (sum.active.length
    ? ` (the frame lacks: ${FALLBACKS.filter(([k]) => sum.active.includes(k)).map(([, why]) => why).join("; ")}; apex26.tlxForceHw restores most)`
    : "");
}

// Read, summarize and print in one call; returns the summary for the tool's JSON report.
export async function reportCaptureFallbacks(page, trackId, log = console.log) {
  let state;
  try { state = await page.evaluate(readCaptureFallbacks, trackId || null); } catch (e) { state = { tlx: false, err: String((e && e.message) || e) }; }
  const sum = summarizeCaptureFallbacks(state);
  log(formatCaptureFallbacks(sum));
  return sum;
}

// The ONE way a capture tool prefetches the whole model pack (#5790 row 2). A player's page never calls
// Assets.loadModels(): it loads the models its circuit names. So this says what it did, and a later
// reportCaptureFallbacks() names the models beyond the circuit's own set. loadAllModelsInPage runs in the page.
export function loadAllModelsInPage() {
  if (typeof Assets === "undefined" || !Assets || typeof Assets.loadModels !== "function") return Promise.resolve({ n: 0, pack: false });
  return Assets.loadModels().then((n) => ({ n, pack: true, ids: typeof Assets.models === "function" ? Assets.models() : [] }),
    (e) => ({ n: 0, pack: true, err: String((e && e.message) || e) }));
}
export async function loadAllModels(page, { log = console.log, quiet = false } = {}) {
  let r;
  try { r = await page.evaluate(loadAllModelsInPage); } catch (e) { r = { n: 0, pack: false, err: String((e && e.message) || e) }; }
  if (!quiet && r.pack) {
    log(`models: this tool prefetched the WHOLE pack (${r.n} resident${r.err ? `, error: ${r.err}` : ""}); `
      + "a player's page loads only the models its circuit's scenery names, so a frame can show a model a player never gets "
      + "(the capture-state line names the extras)");
  }
  return r;
}

// #6037 §2: default capture path — load only the models a player's page would for this track
// (TrackDef.scenerySource + Assets.loadModelsFor). Whole-pack stays an explicit opt-in via loadAllModels /
// prefetchCaptureModels({ allModels: true }).
export function loadPlayerModelsInPage(trackId) {
  try {
    if (typeof Assets === "undefined" || !Assets || typeof Assets.loadModelsFor !== "function") {
      return Promise.resolve({ n: 0, pack: false, scope: "player", track: trackId || null });
    }
    const id = trackId || (window.__apex && window.__apex.info && window.__apex.info().track) || null;
    const list = typeof Tracks !== "undefined" && Tracks && Tracks.LIST ? Tracks.LIST : [];
    const def = id ? list.find((d) => d && d.id === id) : null;
    const registry = (typeof TrackScenery !== "undefined" && TrackScenery) || null;
    const src = def && typeof TrackDef !== "undefined" && TrackDef && typeof TrackDef.scenerySource === "function"
      ? TrackDef.scenerySource(def, registry)
      : ((def && def.scenery) || (id && registry && registry[id]) ? String((def && def.scenery) || registry[id]) : "");
    const ids = typeof Assets.modelIds === "function" ? Assets.modelIds(src) : [];
    return Assets.loadModelsFor(src).then((n) => ({
      n, pack: true, scope: "player", track: id, ids, srcLen: src.length,
    }), (e) => ({ n: 0, pack: true, scope: "player", track: id, err: String((e && e.message) || e) }));
  } catch (e) {
    return Promise.resolve({ n: 0, pack: false, scope: "player", track: trackId || null, err: String((e && e.message) || e) });
  }
}
export async function loadPlayerModels(page, trackId, { log = console.log, quiet = false } = {}) {
  let r;
  try { r = await page.evaluate(loadPlayerModelsInPage, trackId || null); }
  catch (e) { r = { n: 0, pack: false, scope: "player", track: trackId || null, err: String((e && e.message) || e) }; }
  if (!quiet && r.pack) {
    log(`models: this tool loaded the PLAYER set for ${r.track || "?"} (${r.n} resident`
      + `${Array.isArray(r.ids) ? `, ids: ${r.ids.join(",") || "(none)"}` : ""}`
      + `${r.err ? `, error: ${r.err}` : ""}); pass --all-models to prefetch the whole pack`);
  }
  return r;
}

/** Default = player set (#6037); `allModels: true` keeps the whole-pack path for tools that need it. */
export async function prefetchCaptureModels(page, { trackId = null, allModels = false, log = console.log, quiet = false } = {}) {
  if (allModels) return loadAllModels(page, { log, quiet });
  return loadPlayerModels(page, trackId, { log, quiet });
}
