// @doc Bounded presentation diagnostics, late-resource cleanup, and scene-specific picker receipts for probes.
// Tools-only presentation evidence. These functions are also serialized into pages.
export function presentationDiagnostics() {
  const gfx = typeof GLX === "undefined" ? null : GLX;
  const read = (obj, method) => { try { return obj?.[method]?.() ?? null; } catch (e) { return { error: String(e) }; } };
  const tlx = gfx?.__tlx;
  const backend = read(tlx || gfx, "backendState");
  const soft = read(gfx, "softPresentState");
  const canvases = ["game", "game-soft"].map((id) => {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const style = getComputedStyle(canvas);
    const rect = canvas.getBoundingClientRect();
    return { id, width: canvas.width, height: canvas.height, display: style.display,
      visibility: style.visibility, opacity: style.opacity, cssWidth: rect.width, cssHeight: rect.height,
      visible: !canvas.hidden && style.display !== "none" && !["hidden", "collapse"].includes(style.visibility)
        && Number(style.opacity) !== 0 && canvas.width > 0 && canvas.height > 0 && rect.width > 0 && rect.height > 0 };
  }).filter(Boolean);
  const visible = canvases.filter((c) => c.visible);
  // WGX's 2D display is #game. TLX/GLX soft displays use #game-soft.
  const wgx = Number.isFinite(soft?.sceneGen) || String(backend?.backend || "").includes("wgx");
  const preferred = wgx ? "game" : gfx?.softPresent?.() ? "game-soft" : "game";
  const canvas = visible.find((c) => c.id === preferred) || visible[0] || null;
  return { at: Date.now(), backend, memory: read(tlx, "memState"), soft,
    gpuErrors: read(gfx, "gpuErrors"), gpuFirstError: read(gfx, "gpuFirstError"), canvas, canvases };
}

// Node-side watchdog: unlike page timers this also bounds blocked JS and stopped rAF.
export function presentationDeadline(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("positive wall timeout required");
  const deadline = Date.now() + timeoutMs;
  return async (label, operation) => {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error("presentation wall deadline exceeded: " + label);
    let timer;
    try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("presentation wall deadline exceeded: " + label)), left);
    })]); } finally { clearTimeout(timer); }
  };
}

/** Dispose acquisitions that resolve after their caller's wall deadline.
 * The late handler remains attached even after the caller has begun teardown. */
export async function acquirePresentationResource(bounded, label, acquire, dispose) {
  let abandoned = false;
  const pending = Promise.resolve().then(acquire);
  const owned = pending.then(async (resource) => {
    if (abandoned) {
      await dispose(resource);
      throw new Error("late acquisition disposed: " + label);
    }
    return resource;
  });
  owned.catch(() => {}); // bounded may reject before it attaches its race handler
  try { return await bounded(label, () => owned); }
  catch (error) { abandoned = true; throw error; }
}

export function installPickerReceipt(id) {
  window.__pickerPresentation?.restore?.();
  const gfx = typeof GLX === "undefined" ? null : GLX;
  const recs = Log.records();
  const receipt = window.__pickerPresentation = { id, after: recs.at(-1)?.id ?? -1,
    built: null, warm: null, target: null, mode: null, error: null };
  if (!gfx?.present || !gfx.softPresentState) { receipt.error = "missing presentation observer API"; return; }
  const present = gfx.present;
  const first = gfx.softPresentState();
  receipt.epoch = first.epoch ?? null;
  receipt.display = first.display || null;
  // WGX invalidation preserves the pending map. One scene token per visit.
  if (gfx.softPresent?.() && Number.isFinite(first.sceneGen)) {
    if (!gfx.invalidateSoftPresent) { receipt.error = "missing scene invalidation API"; return; }
    gfx.invalidateSoftPresent();
    receipt.sceneGen = gfx.softPresentState().sceneGen;
  }
  const wrapped = function (...args) {
    const logs = Log.records().filter((r) => r.id > receipt.after);
    const builds = logs.filter((r) => String(r.msg).startsWith("build done "));
    const built = builds.at(-1);
    const matching = built && String(built.msg).startsWith("build done " + id + " ");
    const warm = matching && logs.find((r) => r.id > built.id && r.msg === "menu warm drawn " + id);
    const before = gfx.softPresentState();
    if (warm && receipt.target == null && gfx.softPresent?.() && Number.isFinite(before.gen)
        && !Number.isFinite(before.submittedGen) && !Number.isFinite(before.sceneGen)) {
      // GLX only copies its drawing buffer on demand. Arm the qualifying
      // final draw itself, since the paused picker may never draw again.
      if (gfx.invalidateSoftPresent) gfx.invalidateSoftPresent();
      else receipt.error = "missing synchronous capture invalidation API";
    }
    const native = warm && !gfx.softPresent?.() && gfx.awaitSoftPresent && receipt.target == null;
    if (native) {
      // Register before the final warm draw: the paused picker has no next frame.
      // TLX/GLX resolve "frame" from their successful present branch only.
      receipt.mode = "native-frame"; receipt.target = 1; receipt.nativeShown = 0;
      receipt.phase = "final-warm"; receipt.submissionBuilt = built.id;
      Promise.resolve(gfx.awaitSoftPresent(1000, "frame")).then((value) => {
        if (value === "frame") receipt.nativeShown = 1;
        else receipt.error = "native presentation incomplete: no successful frame notification";
      }, (e) => { receipt.error = String(e); });
      receipt.built = built.id; receipt.warm = warm.id; receipt.epoch = before.epoch ?? null;
    }
    const inspect = () => {
      const safe = (obj, method) => { try { return obj?.[method]?.() ?? null; } catch (e) { return { error: String(e) }; } };
      return { warming: safe(gfx, "warming"), warm: safe(gfx.__tlx, "memState")?.warm ?? null,
        backend: safe(gfx.__tlx || gfx, "backendState") };
    };
    const warmBefore = warm && !receipt.finalPresent ? inspect() : null;
    const result = present.apply(this, args);
    const after = gfx.softPresentState();
    let observed = null;
    if (matching && gfx.softPresent?.()) {
      if (Number.isFinite(before.submittedGen) && after.submittedGen > before.submittedGen)
        observed = { mode: "source-generation", target: after.submittedGen };
      else if (Number.isFinite(receipt.sceneGen) && after.seq > before.seq)
        observed = { mode: "scene-generation", target: receipt.sceneGen, requiredSeq: after.seq };
      else if (Number.isFinite(before.gen) && after.gen > before.gen)
        observed = { mode: "synchronous-generation", target: after.gen };
      if (observed) receipt.candidate = { ...observed, built: built.id,
        phase: warm ? "final-warm" : "earlier-warm", epoch: after.epoch ?? null,
        display: after.display ? [...after.display] : null };
    }
    if (native) {
      // present() may resize synchronously. Freeze the actual qualifying
      // submission's display, rather than the preceding scene's dimensions.
      receipt.epoch = after.epoch ?? null;
      receipt.display = after.display ? [...after.display] : null;
    }
    if (warm && !receipt.finalPresent) receipt.finalPresent = {
      built: built.id, warm: warm.id, before, after, warmBefore, warmAfter: inspect(),
    };
    if (warm && receipt.target == null) {
      receipt.built = built.id; receipt.warm = warm.id;
      const candidate = receipt.candidate;
      // Backpressure can make the final warm draw intentionally submit nothing.
      // Only a submission actually observed after THIS build can satisfy it.
      if (candidate && candidate.built === built.id && candidate.epoch === (after.epoch ?? null)
          && JSON.stringify(candidate.display) === JSON.stringify(after.display || null)) {
        Object.assign(receipt, { mode: candidate.mode, target: candidate.target,
          requiredSeq: candidate.requiredSeq, epoch: candidate.epoch, display: candidate.display,
          submissionBuilt: candidate.built, phase: candidate.phase });
      } else if (!gfx.softPresent?.() && result === true) {
        receipt.mode = "native-return"; receipt.target = 1;
        receipt.epoch = after.epoch ?? null; receipt.display = after.display ? [...after.display] : null;
      } else receipt.error = "final warm present has no proven submission; presentation incomplete";
    }
    return result;
  };
  gfx.present = wrapped;
  receipt.restore = () => { if (gfx.present === wrapped) gfx.present = present; };
  receipt.renderer = gfx;
  receipt.present = wrapped;
  receipt.tlx = gfx.__tlx;
  receipt.tlxRenderer = gfx.__tlx?.renderer;
  receipt.backendState = gfx.backendState;
  receipt.tlxBackendState = gfx.__tlx?.backendState;
}

export function pickerReceiptStatus(id) {
  const r = window.__pickerPresentation;
  const gfx = typeof GLX === "undefined" ? null : GLX;
  if (!r || r.id !== id) return { ok: false, error: "no scene-specific picker receipt" };
  const s = gfx?.softPresentState?.() || {};
  let error = r.error;
  if (gfx !== r.renderer || gfx?.present !== r.present || gfx?.__tlx !== r.tlx
      || gfx?.__tlx?.renderer !== r.tlxRenderer || gfx?.backendState !== r.backendState
      || gfx?.__tlx?.backendState !== r.tlxBackendState) error = "renderer replaced";
  if (s.hold) error = "presentation held";
  if (r.target != null && r.epoch != null && s.epoch !== r.epoch) error = "display epoch changed";
  if (r.target != null && r.display && JSON.stringify(r.display) !== JSON.stringify(s.display)) error = "display resized";
  const builds = Log.records().filter((v) => v.id > r.after && String(v.msg).startsWith("build done "));
  if (r.built != null && builds.at(-1)?.id !== r.built) error = "conflicting build identity";
  const shown = r.mode === "native-frame" ? r.nativeShown : r.mode === "native-return" ? 1 : r.mode === "synchronous-generation" ? s.gen : s.shownGen;
  const ok = !error && r.target != null && Number.isFinite(shown) && shown >= r.target
    && (r.mode !== "scene-generation" || (Number.isFinite(s.shown) && s.shown >= r.requiredSeq));
  return { ok, error, id, built: r.built, warm: r.warm, mode: r.mode, target: r.target, requiredSeq: r.requiredSeq ?? null, shown,
    submissionBuilt: r.submissionBuilt ?? null, phase: r.phase ?? null, candidate: r.candidate ?? null, finalPresent: r.finalPresent ?? null,
    boundary: "renderer display completion; not physical scanout",
    backend: gfx?.__tlx?.backendState?.() || gfx?.backendState?.() || null, state: s };
}
