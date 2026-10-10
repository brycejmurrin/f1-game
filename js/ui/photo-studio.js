"use strict";
/* Photo Studio captures only the renderer, then composes a cropped image.
 * Camera ownership is borrowed from FreeCam or the garage and always returned.
 * Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
 * Persistence: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/put */
const PhotoStudio = (function () {
const KEY = "apex26.photoBackground", DB = "apex26.photoLibrary", LIMIT = 6;
const ASPECTS = { scene: 0, wide: 16 / 9, square: 1, portrait: 4 / 5 };
let live = null;
const text = (v, max) => String(v || "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max || 80);
function filename(label) { return "apex26-" + (text(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo") + ".png"; }
function crop(width, height, aspect) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height)), r = ASPECTS[aspect] || w / h;
  const cw = Math.min(w, h * r), ch = Math.min(h, w / r);
  return { x: (w - cw) / 2, y: (h - ch) / 2, width: cw, height: ch };
}
function background() {
  try { const v = localStorage.getItem(KEY); return v && /^data:image\/(jpeg|png);base64,/.test(v) && v.length < 240000 ? v : ""; } catch (_) { return ""; }
}
function setBackground(value) {
  if (value && (!/^data:image\/(jpeg|png);base64,/.test(value) || value.length >= 240000)) return false;
  try {
    if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("apex26:photo-background", { detail: { available: !!value } }));
    return true;
  } catch (_) { return false; }
}
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Photo storage unavailable")); return; }
    const req = indexedDB.open(DB, 1); let abandoned = false;
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id" });
    req.onerror = () => reject(req.error || new Error("Photo storage unavailable"));
    req.onsuccess = () => { if (abandoned) req.result.close(); else resolve(req.result); };
    req.onblocked = () => { abandoned = true; reject(new Error("Close another game tab to open photo storage")); };
  });
}
async function library(action, value) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("photos", action === "list" ? "readonly" : "readwrite"), store = tx.objectStore("photos");
      let result = null, failure = null;
      const req = action === "delete" ? store.delete(value) : store.getAll();
      req.onsuccess = () => {
        if (action !== "save") { result = req.result; return; }
        // Queue every mutation in this active request callback. Readwrite
        // transactions on the same store serialize across tabs; an await here
        // would let this transaction become inactive and lose that isolation.
        try {
          const photos = req.result.filter((p) => p.id !== value.id).concat(value)
            .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
          const keep = photos.slice(0, LIMIT);
          for (const old of photos.slice(LIMIT)) if (old.id !== value.id) store.delete(old.id);
          if (keep.some((p) => p.id === value.id)) {
            const put = store.put(value); put.onsuccess = () => { result = put.result; };
          }
        } catch (e) { failure = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = (e) => { failure = failure || (e && e.target && e.target.error) || tx.error; };
      // Reject only once abort has finished rolling back the whole write.
      tx.onabort = () => reject(failure || tx.error || new Error("Photo storage is full or unavailable"));
    });
  } finally { db.close(); }
}
function blobOf(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob((b) => b ? resolve(b) : reject(new Error("The image could not be encoded")), type || "image/png", quality); }
    catch (e) { reject(e); }
  });
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function create(G, deps) {
  deps = deps || {};
  const root = G.$("photo-studio");
  if (!root) return null;
  const st = { open: false, source: "race", aspect: "wide", grid: "thirds", postcard: false, busy: false, closing: false, metadata: {}, back: null, snapshot: null, borrowed: null, generation: 0, subject: null };
  const E = {}, session = [];
  let last = null, focus = null, libraryPaint = 0;
  const mk = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === "attrs") { for (const a in props[k]) el.setAttribute(a, props[k][a]); } else el[k] = props[k];
    }
    if (props && props.id) E[props.id] = el;
    if (kids) for (const c of kids) el.appendChild(c);
    return el;
  };
  const button = (label, run, id) => {
    const b = mk("button", { type: "button", textContent: label, id: id || "" });
    b.addEventListener("click", run); return b;
  };
  const select = (label, list, read, run, id) => {
    const row = SettingRow.build(id + "-row", label, list);
    row.sel.id = id; E[id] = row.sel;
    SettingRow.wire(row.row, { read, write: run }); return row.row;
  };
  const shots = mk("div", { id: "ps-shots", className: "balanced-row", attrs: { role: "group", "aria-label": "Shot presets" } });
  const guide = mk("div", { id: "ps-guide", attrs: { "aria-hidden": "true" } }, [mk("div", { id: "ps-grid" })]);
  const importFile = mk("input", { id: "ps-import", type: "file", accept: "image/png,image/jpeg,image/webp", attrs: { "aria-label": "Import a personal photo" } });
  importFile.addEventListener("change", () => importPhoto(importFile.files && importFile.files[0]));
  const group = (title, kids) => mk("section", { attrs: { "aria-label": title } }, [mk("h3", { className: "adv-sec", textContent: title }), ...kids]);
  const captureButton = button("CAPTURE", capture, "ps-capture"), done = button("DONE", () => close(true), "ps-close");
  captureButton.className = "bigbtn"; done.className = "bigbtn alt";
  // SUBJECT: the Home door opens on whatever the Home scene shows, and the
  // default scene is the garage, so the circuit shoot (free camera over the
  // track) was reachable only by changing Appearance › Scene · Home first.
  // The row hands the pick to the door (opts.subject), which swaps the Home
  // world for this visit and reopens the studio; the stored scene is untouched.
  const subjectValue = () => (isGarage() ? "garage" : "circuit");
  const subjectRow = select("Subject", [["garage", "Garage"], ["circuit", "Circuit"]], subjectValue,
    (v) => { if (st.subject && !st.busy && v !== subjectValue()) st.subject(v); }, "ps-subject");
  const subjectGroup = group("SUBJECT", [subjectRow,
    mk("p", { className: "adv-help", textContent: "Your car in the garage, or the free camera on the circuit. Your Home scene stays as it is." })]);
  const panel = mk("section", { id: "ps-panel", className: "sheet", attrs: { "aria-label": "Photo Studio" } }, [
    mk("header", { className: "sheet-head" }, [mk("h2", { textContent: "PHOTO STUDIO" })]),
    mk("div", { id: "ps-body", className: "sheet-body pane" }, [
      mk("p", { id: "ps-context", className: "adv-help" }),
      subjectGroup,
      group("COMPOSITION", [
        select("Frame", [["scene", "Full scene"], ["wide", "16:9"], ["square", "1:1"], ["portrait", "4:5"]], () => st.aspect, (v) => { st.aspect = v; guides(); }, "ps-aspect"),
        select("Guide", [["off", "Off"], ["thirds", "Thirds"], ["centre", "Centre"]], () => st.grid, (v) => { st.grid = v; guides(); }, "ps-grid-select"),
        shots, mk("p", { id: "ps-help", className: "adv-help" }),
        select("Caption", [["off", "Off"], ["on", "Postcard"]], () => st.postcard ? "on" : "off", (v) => { st.postcard = v === "on"; }, "ps-postcard"),
      ]),
      group("YOUR PHOTO", [
        mk("img", { id: "ps-preview", alt: "Captured photo preview", hidden: true }),
        mk("div", { className: "balanced-row" }, [button("DOWNLOAD PNG", exportPhoto, "ps-export"), button("SAVE PHOTO", savePhoto, "ps-save")]),
        mk("div", { className: "balanced-row" }, [button("USE AS MENU BACKGROUND", useBackground, "ps-background"), button("CLEAR BACKGROUND", () => say(setBackground("") ? "Menu background cleared." : "Background could not be cleared."))]),
        mk("label", { className: "tune-row" }, [mk("span", { className: "tune-label", textContent: "Import your photo" }), importFile]),
      ]),
      mk("details", {}, [mk("summary", { textContent: "MY PHOTOS · up to 6" }), mk("div", { id: "ps-library" })]),
      mk("p", { id: "ps-message", attrs: { "aria-live": "polite", role: "status" } }),
    ]),
    mk("footer", { className: "sheet-foot" }, [captureButton, done]),
  ]);
  root.appendChild(guide); root.appendChild(panel);
  root.setAttribute("aria-label", "Photo Studio");
  root.setAttribute("data-esc-close", "ps-close");
  const say = (s) => { E["ps-message"].textContent = s; };
  function busy(value) {
    st.busy = value;
    const closing = !!st.closing;
    panel.setAttribute("aria-busy", value || closing ? "true" : "false");
    root.setAttribute("aria-busy", value || closing ? "true" : "false");
    // Keep #ps-close enabled: it is the data-esc-close / Start door. close()
    // already no-ops while st.closing, and TopModal.onEscape skips a disabled
    // door — so disabling DONE during CAPTURE/CLOSING trapped Escape until the
    // async restore finished (~10s on software GL).
    for (const id of ["ps-capture", "ps-export", "ps-save", "ps-background"]) {
      E[id].disabled = value || closing || (id !== "ps-capture" && !last);
    }
    E["ps-close"].disabled = false;
    E["ps-capture"].textContent = value && !closing ? "CAPTURING…" : "CAPTURE";
    E["ps-close"].textContent = closing ? "CLOSING…" : "DONE";
  }
  function guides() { root.dataset.aspect = st.aspect; root.dataset.grid = st.grid; }
  function camera() { return deps.freeCam || (typeof FreeCam !== "undefined" ? FreeCam : null); }
  function isGarage() { return st.source === "home" || st.source === "garage"; }
  function setShot(id) {
    if (isGarage()) { if (deps.garage && deps.garage.shot) deps.garage.shot(id); }
    else {
      const fc = camera(); if (!fc || !fc.cmd) return;
      fc.cmd(id === "corner" ? { snap: "corner" } : { snap: "car", fov: id === "detail" ? 35 : id === "wide" ? 80 : 60 });
    }
  }
  function open(opts) {
    opts = opts || {};
    if (st.open) close(false);
    last = null; E["ps-preview"].hidden = true;
    st.source = opts.source || "race"; st.metadata = opts.metadata || {}; st.back = typeof opts.back === "function" ? opts.back : null;
    st.subject = typeof opts.subject === "function" ? opts.subject : null;
    focus = document.activeElement;
    if (isGarage()) {
      if (!deps.garage) return false;
      st.snapshot = deps.garage.snapshot ? deps.garage.snapshot() : null;
    } else {
      const fc = camera();
      const prior = fc && (fc.state ? fc.state() : fc.cmd ? fc.cmd() : null);
      st.borrowed = { open: prior && prior.open, state: prior, photo: !!G.photoMode,
        pose: G.photoCam ? { pos: G.photoCam.pos.slice(), yaw: G.photoCam.yaw, pitch: G.photoCam.pitch, fov: G.photoCam.fov } : null };
      if (!fc || !fc.enterFrom || !fc.enterFrom({})) return false;
      if (opts.view && fc.cmd) fc.cmd({ eye: opts.view.eye, target: opts.view.tgt, fov: opts.view.fov });
      const p = fc.panel ? fc.panel() : G.$("freecam-inner"); if (p) p.hidden = true;
      if (fc.setOverlaysVisible) fc.setOverlaysVisible(false);
    }
    st.open = true; st.generation++; root.hidden = false;
    subjectGroup.hidden = !st.subject;
    if (st.subject) SettingRow.paint(subjectRow, subjectValue());
    document.body.classList.add("photo-studio-open");
    E["ps-context"].textContent = text(st.metadata.title || (isGarage() ? "Your garage" : G.track && (G.track.name || G.track.id)) || "Race photo");
    E["ps-help"].textContent = isGarage() ? "Choose a shot or drag the scene to orbit. Guides stay out of the exported photo." : "WASD move · drag to look · R/F height · Shift boost. Guides and HUD stay out of the photo.";
    shots.replaceChildren();
    const list = isGarage() ? [["hero", "HERO"], ["front", "FRONT"], ["side", "SIDE"], ["rear", "REAR"], ["top", "TOP"]] : [["car", "CHASE"], ["wide", "WIDE"], ["detail", "DETAIL"], ["corner", "CORNER"]];
    for (const [id, label] of list) shots.appendChild(button(label, () => setShot(id)));
    st.closing = false; guides(); busy(false); say("Capture the frame, then save or download it."); paintLibrary(); E["ps-close"].focus();
    return true;
  }
  function close(back) {
    if (!st.open) return;
    if (back) {
      if (st.closing) return;
      st.closing = true;
      const gen = st.generation;
      busy(true);
      say("Restoring the scene…");
      // Paint CLOSING… before garage/home restore takes the main thread (~10s
      // on software GL). Lifecycle teardown (back=false) stays synchronous.
      const go = () => { if (st.generation === gen && st.closing) finishClose(true); };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
      else go();
      return;
    }
    finishClose(false);
  }
  function finishClose(back) {
    if (!st.open && !st.closing) return;
    const returnTo = st.back; st.generation++; st.open = false; st.back = null; st.closing = false;
    if (isGarage()) { if (deps.garage && deps.garage.restore && st.snapshot) deps.garage.restore(st.snapshot); st.snapshot = null; }
    else {
      const fc = camera(), prior = st.borrowed;
      if (back && prior && prior.open && fc && fc.cmd) {
        fc.cmd(prior.state); if (fc.setOverlaysVisible) fc.setOverlaysVisible(true); const p = fc.panel ? fc.panel() : G.$("freecam-inner"); if (p) p.hidden = false;
      } else {
        if (fc && fc.close) fc.close(false, !!(back && prior && prior.photo)); else if (fc && fc.cmd) fc.cmd(false);
        if (back && prior && prior.photo && prior.pose && G.photoCam) {
          G.photoCam.pos.splice(0, 3, ...prior.pose.pos); G.photoCam.yaw = prior.pose.yaw; G.photoCam.pitch = prior.pose.pitch; G.photoCam.fov = prior.pose.fov;
        }
      }
      st.borrowed = null;
    }
    if (deps.onClose) deps.onClose({ restoredPhoto: !!G.photoMode });
    // Hide before returnTo(): body.photo-studio-open forces #rotate-device
    // display:none, so setPaused → syncRotateBlocker would miss the portrait
    // gate and leave the pause card up (photo-studio.spec.js race close).
    const target = focus, generation = st.generation;
    // Release the composed canvas (up to 2048 px, ~17 MB RGBA) and its preview data URL; open() rebuilds both.
    last = null; E["ps-preview"].removeAttribute("src"); E["ps-preview"].hidden = true;
    root.hidden = true; document.body.classList.remove("photo-studio-open");
    busy(false);
    if (back && returnTo) returnTo();
    // Let the caller paint its restored visibility after modal isolation settles.
    if (back && target && target.focus) requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!st.open && st.generation === generation && target.isConnected) target.focus();
    }));
  }
  async function frame() {
    const gfx = G.gfx;
    if (gfx && gfx.invalidateSoftPresent && gfx.softPresent && gfx.softPresent()) gfx.invalidateSoftPresent();
    const pending = gfx && gfx.softPresent && gfx.softPresent() && gfx.awaitSoftPresent ? gfx.awaitSoftPresent(15000) : null;
    if (deps.renderFrame) deps.renderFrame();
    // Read WebGL before yielding: its unpreserved backbuffer is cleared after compositing.
    let pixels = null;
    if (gfx && gfx.capturePixels) {
      let read;
      try { read = gfx.capturePixels(); } catch (e) { read = Promise.reject(e); }
      // Observe both immediately, even when one rejects before the other is
      // ready. The raw pixels are captured now; software presentation may finish later.
      const [presented, captured] = await Promise.allSettled([pending || Promise.resolve(), read]);
      if (presented.status === "rejected") throw presented.reason;
      if (captured.status === "fulfilled") pixels = captured.value;
      else {
        // Native WebGPU canvases can compose directly even when a backend has
        // no readback render target. Draw and copy in this same task instead.
        Log.warn("ui", "backend readback unavailable; copying the scene canvas", captured.reason);
      }
    } else if (pending) await pending;
    if (!pixels && !pending && deps.renderFrame) {
      // Repaint immediately before a native canvas copy; no await may come
      // between this draw and drawImage below.
      deps.renderFrame();
    }
    const canvas = mk("canvas");
    if (pixels && pixels.data && pixels.width && pixels.height) {
      canvas.width = pixels.width; canvas.height = pixels.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image composition is unavailable");
      const image = ctx.createImageData(pixels.width, pixels.height); image.data.set(pixels.data); ctx.putImageData(image, 0, 0);
    } else {
      const soft = document.getElementById("game-soft"), source = pending && soft ? soft : G.canvas || G.$("game");
      if (!source || !source.width || !source.height) throw new Error("No rendered scene is ready");
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image composition is unavailable"); ctx.drawImage(source, 0, 0);
    }
    return canvas;
  }
  function compose(source) {
    const box = crop(source.width, source.height, st.aspect), scale = Math.min(1, 2048 / box.width, 2048 / box.height), out = mk("canvas");
    out.width = Math.round(box.width * scale); out.height = Math.round(box.height * scale);
    const ctx = out.getContext("2d"); if (!ctx) throw new Error("Image composition is unavailable");
    ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    if (st.postcard) {
      const h = Math.max(54, out.height * 0.11), pad = Math.max(16, out.width * 0.025);
      ctx.fillStyle = "rgba(12,12,20,0.9)"; ctx.fillRect(0, out.height - h, out.width, h);
      ctx.fillStyle = "#f6f6f9"; ctx.font = "bold " + Math.round(h * 0.32) + "px sans-serif";
      ctx.fillText("APEX 26 · " + text(st.metadata.title || G.track && G.track.name || "GARAGE", 70), pad, out.height - h * 0.5, out.width - pad * 2);
      ctx.font = Math.round(h * 0.22) + "px sans-serif";
      ctx.fillText(text(st.metadata.subtitle || (isGarage() ? "PERSONAL PHOTO" : "RACE MOMENT"), 90), pad, out.height - h * 0.18, out.width - pad * 2);
    }
    return out;
  }
  function thumbnail(canvas) {
    const thumb = mk("canvas"), scale = Math.min(1, 640 / canvas.width, 360 / canvas.height);
    thumb.width = Math.max(1, Math.round(canvas.width * scale)); thumb.height = Math.max(1, Math.round(canvas.height * scale));
    thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.7);
  }
  async function capture() {
    if (!st.open || st.busy) return false;
    const gen = st.generation; busy(true); say("Capturing the rendered scene…");
    try {
      const source = await frame(); if (gen !== st.generation) return false;
      last = compose(source); E["ps-preview"].src = thumbnail(last); E["ps-preview"].hidden = false;
      say("Captured " + last.width + " × " + last.height + ". Ready to download or save."); return true;
    } catch (e) { Log.warn("ui", "capture failed", e); if (gen === st.generation) say("Capture failed: " + text(e.message, 120) + ". Try again once the scene is ready."); return false; }
    finally { if (gen === st.generation) busy(false); }
  }
  async function exportPhoto() {
    if (!st.open || !last || st.busy) return;
    const gen = st.generation, name = filename(st.metadata.title || "photo"), canvas = last;
    try { download(await blobOf(canvas), name); if (gen === st.generation) say("PNG download requested."); }
    catch (e) { if (gen === st.generation) say("Download failed: " + text(e.message)); }
  }
  async function savePhoto() {
    if (!st.open || !last || st.busy) return;
    const gen = st.generation, canvas = last, title = text(st.metadata.title || "Photo");
    busy(true);
    try {
      const blob = await blobOf(canvas, "image/jpeg", 0.88);
      if (blob.size > 3 * 1024 * 1024) throw new Error("This photo is too large. Download the PNG instead");
      const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), at: Date.now(), title, blob, thumb: thumbnail(canvas) };
      try {
        await library("save", entry);
        if (gen === st.generation) say("Saved to My Photos on this device.");
      } catch (_) { session.unshift(entry); session.splice(LIMIT); if (gen === st.generation) say("Device storage is unavailable. Saved for this visit; download to keep it."); }
      if (gen === st.generation) await paintLibrary();
    } catch (e) { if (gen === st.generation) say("Save failed: " + text(e.message)); }
    finally { if (gen === st.generation) busy(false); }
  }
  function useBackground() { if (last) say(setBackground(thumbnail(last)) ? "Personal photo set as menu background. Select My Photo in Appearance." : "Device storage is full. Download the photo to keep it."); }
  async function paintLibrary() {
    const gen = st.generation, paint = ++libraryPaint;
    let photos; try { photos = await library("list"); } catch (_) { photos = []; }
    if (!st.open || gen !== st.generation || paint !== libraryPaint) return;
    const box = E["ps-library"];
    // DELETE repaints the list under the focused button; keepFocus lands on the
    // same slot in the new list instead of dropping focus to <body>.
    const render = () => { box.replaceChildren(); paintPhotos(box, photos); };
    if (typeof TopModal !== "undefined" && TopModal.keepFocus) TopModal.keepFocus(box, render); else render();
  }
  function paintPhotos(box, photos) {
    photos = photos.concat(session).sort((a, b) => b.at - a.at).slice(0, LIMIT);
    if (!photos.length) { box.appendChild(mk("p", { className: "adv-help", textContent: "Capture a frame and save it here. Photos stay on this device." })); return; }
    for (const p of photos) {
      const row = mk("div", { className: "pane" }, [mk("img", { src: p.thumb, alt: p.title || "Saved photo" }), mk("span", { textContent: p.title || "Photo" }),
        button("DOWNLOAD", () => download(p.blob, filename(p.title).replace(/\.png$/, ".jpg"))),
        button("MENU BACKGROUND", () => say(setBackground(p.thumb) ? "Personal menu background selected." : "Device storage is unavailable.")),
        button("DELETE", async () => { const i = session.findIndex((x) => x.id === p.id); if (i >= 0) session.splice(i, 1); else try { await library("delete", p.id); } catch (_) { say("Photo could not be deleted."); return; } paintLibrary(); }),
      ]);
      box.appendChild(row);
    }
  }
  async function importPhoto(file) {
    if (!file || !st.open || st.busy) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) { say("Choose a PNG, JPEG or WebP photo under 12 MB."); return; }
    const gen = st.generation; busy(true);
    try {
      const image = await createImageBitmap(file, { resizeWidth: 1024, resizeQuality: "high" });
      try {
        if (gen !== st.generation) return;
        if (image.height > 4096) throw new Error("Choose a photo with a less extreme aspect ratio");
        last = compose(image); E["ps-preview"].src = thumbnail(last); E["ps-preview"].hidden = false; say("Personal photo imported. Save it or use it as your menu background.");
      }
      finally { image.close(); }
    } catch (e) { if (gen === st.generation) say("This photo could not be opened: " + text(e.message)); }
    finally { if (gen === st.generation) { busy(false); importFile.value = ""; } }
  }
  function state() { return { open: st.open, source: st.source, subject: !!st.subject, aspect: st.aspect, grid: st.grid, postcard: st.postcard, busy: st.busy, captured: !!last, background: !!background() }; }
  const api = { open, close, capture, state, background, setBackground, exportPhoto, savePhoto };
  live = api; busy(false); return api;
}
return Object.freeze({ create, background, setBackground, crop, filename, ASPECTS, LIMIT, state: () => live ? live.state() : { open: false } });
})();
