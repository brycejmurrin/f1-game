"use strict";
const FlybyEditor = (function () {
"use strict";
const {
  clone, fromSaved, shotErrors, toBlob, savedForm, EASES, AT_KINDS, FIELD,
  FIELD_IDS, FOV, SLOTS, CORNER_NS, RANKS, DUR, addShot, duplicateShot, deleteShot, moveShot,
  normaliseDurs, validateShots, switchPoseAt, poseFields, fieldLabel,
} = FlybyPanel;

let _refresh = null;

function create(G) {
Log.info("game", "FlybyPanel.create");
const { $, els, store } = G;

let shots = null;
let sel = 0;
let u = 0;

function defaults() {
  return (typeof FlybySeq === "undefined") ? [] : clone(FlybySeq.DEFAULT);
}

function persist() {
  const list = shots || [];
  const pristine = !list.length || JSON.stringify(list) === JSON.stringify(defaults());
  try { store.set("flybyShots", pristine ? null : savedForm(list)); }
  catch (e) { Log.warn("game", "flyby shots did not save", e); }
}

function loadSaved() {
  let saved = null;
  try { saved = store.get("flybyShots", null); } catch (_) { return null; }
  if (!saved) return null;
  const list = fromSaved(saved);
  if (!list) { Log.warn("game", "saved flyby shots predate the current pose meaning — playing the shipped sequence"); return null; }
  const bad = shotErrors(list);
  if (bad.length) { Log.warn("game", "saved flyby shots unusable: " + bad[0]); return null; }
  return clone(list);
}

function ensure() { if (!shots) shots = loadSaved() || defaults(); return shots; }

function span(i) {
  const list = ensure();
  let total = 0;
  for (const s of list) total += s.dur || 0;
  if (!(total > 0)) total = 1;
  let acc = 0;
  for (let k = 0; k < i && k < list.length; k++) acc += list[k].dur || 0;
  return { from: acc / total, to: (acc + ((list[i] && list[i].dur) || 0)) / total };
}
function midOf(i) { const s = span(i); return (s.from + s.to) / 2; }

function cur() { const list = ensure(); return list[Math.max(0, Math.min(list.length - 1, sel))]; }
function poseOf(slot) { const s = cur(); return s && s[slot.arr] && s[slot.arr][slot.i]; }

function fmt(d, v, field) {
  if (field === "distR" || field === "yR") {
    try {
      const b = G.track && typeof FlybySeq !== "undefined" && FlybySeq.bounds(G.track);
      const metric = FlybyPanel.metricValue(field, v, b && b.rad);
      if (metric) return metric;
    } catch (_) {  }
  }
  const dec = (String(d.step).split(".")[1] || "").length;
  return (+v).toFixed(Math.min(dec, 3)) + (d.unit || "");
}


function apiReady() {
  return typeof __apex !== "undefined" && !!__apex && !!__apex.flybyCam;
}

let playKey = "", playList = null;
function playable() {
  const key = JSON.stringify(ensure());
  if (key !== playKey || !playList) { playKey = key; playList = clone(ensure()); }
  return playList;
}
function preview() {
  if (!apiReady()) { askApi(); status(null, "preview unavailable — loading the dev API…"); return; }
  let r = null;
  try { r = __apex.flybyCam(u, playable()); } catch (e) { status(null, "preview failed: " + (e && e.message)); return; }
  if (!r) { status(null, "no track built yet — start a race, then pause"); return; }
  if (r.index !== sel) { sel = r.index; refreshChips(); refreshRows(); }
  status(r, "");
}

function status(r, note) {
  const host = $("fb-status"); if (!host) return;
  if (!r) { host.textContent = note || ""; host.classList.remove("fb-inside"); return; }
  const offRoad = !!r.onRoad && !(Math.abs(r.lat) <= 12);
  const bad = r.onRoad ? offRoad : !!r.inside;
  const verdict = r.onRoad
    ? (offRoad ? "  ·  ON-ROAD SHOT " + (r.lat == null ? "OFF THE TRACK" : Math.abs(r.lat).toFixed(1) + " m OFF THE ROAD") + " — move this eye"
      : "  ·  clear (on road)")
    : r.inside ? "  ·  INSIDE A " + String(r.inside.kind).toUpperCase() + " — move this eye"
      : "  ·  clear";
  const lift = r.lift > 0.05 ? "  ·  lifted " + r.lift.toFixed(1) + " m" : "";
  host.textContent = "u " + r.u.toFixed(3) + "  ·  " + r.shot + " [" + r.index + "]" +
    "  ·  eye " + r.eye.join(", ") + "  ·  fov " + r.fov + lift + verdict;
  host.classList.toggle("fb-inside", bad);
}


function relabel(id, label) {
  const row = $("fb-row-" + id), inp = $("fb-in-" + id);
  const span = row && row.querySelector(".tune-label");
  if (span && span.firstChild && span.firstChild.nodeType === 3) span.firstChild.nodeValue = label + " ";
  if (inp) inp.setAttribute("aria-label", label);
}

function numberRow(host, id, label, d, onInput) {
  const item = document.createElement("div");
  item.className = "adv-item"; item.id = "fb-row-" + id;
  const lab = document.createElement("label"); lab.className = "tune-row";
  const span = document.createElement("span"); span.className = "tune-label";
  span.textContent = label + " ";
  const b = document.createElement("b"); b.id = "fb-v-" + id;
  span.appendChild(b);
  const inp = document.createElement("input");
  inp.type = "range"; inp.min = d.min; inp.max = d.max; inp.step = d.step;
  inp.id = "fb-in-" + id;
  inp.setAttribute("aria-label", label);
  inp.oninput = () => onInput(parseFloat(inp.value));
  lab.appendChild(span); lab.appendChild(inp);
  item.appendChild(lab);
  host.appendChild(item);
  return item;
}

function selectRow(host, id, label, values, onChange) {
  const item = document.createElement("div");
  item.className = "adv-item"; item.id = "fb-row-" + id;
  const lab = document.createElement("label"); lab.className = "tune-row";
  const span = document.createElement("span"); span.className = "tune-label";
  span.textContent = label;
  const s = document.createElement("select");
  s.id = "fb-in-" + id;
  s.setAttribute("aria-label", label);
  for (const v of values) {
    const o = document.createElement("option");
    o.value = String(v); o.textContent = String(v).toUpperCase();
    s.appendChild(o);
  }
  s.onchange = () => onChange(s.value);
  lab.appendChild(span); lab.appendChild(s);
  item.appendChild(lab);
  host.appendChild(item);
  return item;
}

function edited() { persist(); refreshChips(); refreshRows(); preview(); }

const cardDefs = () => (typeof LoadingScreen !== "undefined" && LoadingScreen.CARD) || {};
const cardKeys = () => (typeof LoadingScreen !== "undefined" && LoadingScreen.CARD_KEYS) || [];

function cardHost() {
  const ls = G.loadingScreen;
  return ls && typeof ls.setCard === "function" ? ls : null;
}
function cardInfo() {
  try { return typeof G.loadingInfo === "function" ? G.loadingInfo() : null; } catch (_) { return null; }
}

function showCard(on) {
  const ls = cardHost(); if (!ls) return;
  if (!on) { ls.stop(); return; }
  const info = cardInfo();
  if (info) { try { ls.hold(info); } catch (e) { Log.warn("game", "card preview failed", e); } }
}

function buildCardRows(host) {
  const ls = cardHost();
  const defs = cardDefs(), keys = cardKeys();
  if (!ls || !keys.length) return;
  const head = document.createElement("h3");
  head.textContent = "TRACK CARD"; head.className = "fb-group";
  host.appendChild(head);
  for (const k of keys) {
    numberRow(host, "card-" + k, defs[k].label, defs[k], (v) => {
      refreshCard(ls.setCard({ [k]: v }));
    });
    const inp = $("fb-in-card-" + k);
    if (inp) inp.onchange = () => showCard(true);
  }
  const item = document.createElement("div");
  item.className = "adv-item";
  const btn = document.createElement("button");
  btn.type = "button"; btn.id = "fb-card-reset";
  btn.textContent = "RESET CARD";
  btn.title = "Put the track card back at its shipped size and position. Leaves the shots alone.";
  btn.onclick = () => { refreshCard(ls.resetCard()); showCard(true); };
  item.appendChild(btn);
  host.appendChild(item);
}

function refreshCard(geom) {
  const defs = cardDefs();
  const g = geom || (cardHost() && cardHost().card()) || null;
  if (!g) return;
  for (const k of cardKeys()) if (typeof g[k] === "number") setNum("card-" + k, defs[k], g[k]);
}

function annHost() {
  const a = G.announcer;
  return a && typeof a.scriptFor === "function" ? a : null;
}

function buildAnnRows(host) {
  const a = annHost(); if (!a) return;
  const head = document.createElement("h3");
  head.textContent = "ANNOUNCER"; head.className = "fb-group";
  host.appendChild(head);
  const item = document.createElement("div");
  item.className = "adv-item";
  const text = document.createElement("p");
  text.id = "fb-ann-script"; text.className = "as-note";
  const ops = document.createElement("div");
  ops.className = "balanced-row";
  const play = document.createElement("button");
  play.type = "button"; play.id = "fb-ann-play"; play.textContent = "PLAY";
  play.title = "Read the script aloud, at the voice, pitch and rate set in SETTINGS → AUDIO.";
  play.onclick = () => {
    const live = annHost(), info = cardInfo();
    if (!live || !info || !live.preview(info)) {
      flash(play, live && live.available() ? "SOUND OFF" : "NO VOICES");
    }
  };
  const stop = document.createElement("button");
  stop.type = "button"; stop.id = "fb-ann-stop"; stop.textContent = "STOP";
  stop.onclick = () => { const live = annHost(); if (live) live.stop(); };
  ops.append(play, stop);
  item.append(text, ops);
  host.appendChild(item);
}

function refreshAnn() {
  const a = annHost(), el = $("fb-ann-script");
  if (!a || !el) return;
  const info = cardInfo();
  let lines = [];
  try { lines = info ? a.scriptFor(info) : []; } catch (_) { lines = []; }
  el.textContent = lines.length ? lines.join(" ") : "No circuit loaded — start a race, then pause.";
}

function buildRows() {
  const host = $("fb-rows");
  if (host.dataset.built) return;
  host.dataset.built = "1";

  buildCardRows(host);

  const head = document.createElement("h3");
  head.textContent = "SHOT"; head.className = "fb-group";
  host.appendChild(head);
  numberRow(host, "dur", "DURATION (share of the run)", DUR, (v) => { cur().dur = v; setU(midOf(sel)); edited(); });
  selectRow(host, "ease", "EASING", EASES, (v) => { cur().ease = v; edited(); });
  numberRow(host, "fov0", "FOV FROM", FOV, (v) => { cur().fov[0] = v; edited(); });
  numberRow(host, "fov1", "FOV TO", FOV, (v) => { cur().fov[1] = v; edited(); });

  buildAnnRows(host);

  for (const slot of SLOTS) {
    const h = document.createElement("h3");
    h.textContent = slot.label; h.className = "fb-group";
    host.appendChild(h);
    selectRow(host, slot.key + "-at", slot.label + " ANCHOR", AT_KINDS, (v) => {
      const s = cur();
      s[slot.arr][slot.i] = switchPoseAt(poseOf(slot), v);
      edited();
    });
    selectRow(host, slot.key + "-n", slot.label + " CORNER", CORNER_NS, (v) => {
      const p = poseOf(slot);
      p.n = /^\d+$/.test(v) ? parseInt(v, 10) : v;
      edited();
    });
    selectRow(host, slot.key + "-rank", slot.label + " LANDMARK", RANKS, (v) => {
      poseOf(slot).rank = parseInt(v, 10) || 0;
      edited();
    });
    for (const f of FIELD_IDS) {
      numberRow(host, slot.key + "-" + f, slot.label + " " + FIELD[f].label, FIELD[f], (v) => {
        poseOf(slot)[f] = v;
        edited();
      });
    }
  }
}

function refreshChips() {
  const host = $("fb-shots"); if (!host) return;
  const list = ensure();
  host.textContent = "";
  list.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "lt-tab"; b.id = "fb-tab-" + i;
    b.textContent = String(i + 1);
    b.title = (s.id || ("shot " + (i + 1))) + " — " + (s.dur || 0).toFixed(3) + " of the run";
    b.setAttribute("aria-label", "Shot " + (i + 1) + ": " + (s.id || i));
    b.setAttribute("role", "tab");
    b.setAttribute("aria-controls", "fb-rows");
    b.setAttribute("aria-selected", i === sel ? "true" : "false");
    b.classList.toggle("active", i === sel);
    b.tabIndex = i === sel ? 0 : -1;
    b.onclick = () => { sel = i; setU(midOf(i)); refreshChips(); refreshRows(); preview(); };
    b.onkeydown = (e) => chipKey(i, e);
    host.appendChild(b);
  });
  const activeTab = $("fb-tab-" + sel);
  if (activeTab) host.setAttribute("aria-labelledby", activeTab.id);
  else host.removeAttribute("aria-labelledby");
  const prof = $("fb-profile");
  if (prof) {
    let sum = 0;
    for (const s of list) sum += (s.dur || 0);
    prof.textContent = list.length + " shots  ·  durations sum " + sum.toFixed(3) +
      (Math.abs(sum - 1) > 0.01 ? "  (press NORMALISE)" : "");
  }
}

function chipKey(i, e) {
  const list = ensure();
  let next = null;
  if (e.key === "ArrowRight") next = (i + 1) % list.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + list.length) % list.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = list.length - 1;
  if (next == null) return;
  e.preventDefault(); e.stopPropagation();
  sel = next; setU(midOf(next)); refreshChips(); refreshRows(); preview();
  const el = $("fb-tab-" + next); if (el && el.focus) el.focus();
}

function show(id, on) {
  const row = $("fb-row-" + id);
  if (row) row.style.display = on ? "" : "none";
}
function setNum(id, d, v, field) {
  const inp = $("fb-in-" + id), b = $("fb-v-" + id);
  if (inp) inp.value = v;
  if (b) b.textContent = fmt(d, v, field);
}

function refreshRows() {
  const host = $("fb-rows");
  if (!host.dataset.built) return;
  const s = cur();
  if (!s) return;
  setNum("dur", DUR, s.dur);
  setNum("fov0", FOV, s.fov[0]);
  setNum("fov1", FOV, s.fov[1]);
  const ease = $("fb-in-ease"); if (ease) ease.value = s.ease;
  for (const slot of SLOTS) {
    const p = poseOf(slot) || {};
    const at = $("fb-in-" + slot.key + "-at"); if (at) at.value = p.at || "start";
    show(slot.key + "-n", p.at === "corner");
    show(slot.key + "-rank", p.at === "landmark");
    const n = $("fb-in-" + slot.key + "-n"); if (n) n.value = String(p.n === undefined ? "first" : p.n);
    const rank = $("fb-in-" + slot.key + "-rank"); if (rank) rank.value = String(p.rank || 0);
    const fields = poseFields(p);
    for (const f of FIELD_IDS) {
      const on = fields.indexOf(f) !== -1;
      show(slot.key + "-" + f, on);
      if (on && f === "y") relabel(slot.key + "-y", slot.label + " " + fieldLabel(p.at, "y"));
      if (on) setNum(slot.key + "-" + f, FIELD[f], typeof p[f] === "number" ? p[f] : FIELD[f].def, f);
    }
  }
}

function setU(v) {
  u = Math.max(0, Math.min(1, v));
  const inp = $("fb-u"); if (inp) inp.value = Math.round(u * 1000);
  const lab = $("fb-u-val"); if (lab) lab.textContent = u.toFixed(3);
}


function isOpen() { return !$("flyby").hidden; }

let _apiLoad = null, _apiAsked = false;
function setApiLoader(fn) {
  _apiLoad = typeof fn === "function" ? fn : null;
  if (_apiLoad && isOpen()) askApi();
}
function askApi() {
  if (_apiAsked || !_apiLoad || apiReady()) return;
  _apiAsked = true;
  Promise.resolve(_apiLoad()).then(() => { if (isOpen()) { preview(); refreshRows(); } })
    .catch((e) => { status(null, "the dev API did not load — preview unavailable"); Log.warn("game", "flyby panel: agent surface failed", e); });
}

function openFlyby() {
  Log.info("game", "FlybyPanel.open");
  askApi();
  ensure();
  buildRows();
  sel = Math.max(0, Math.min(ensure().length - 1, sel));
  setU(midOf(sel));
  $("flyby").hidden = false;
  $("fb-json").hidden = true;
  document.body.classList.add("lt-open");
  refreshCard(null);
  refreshAnn();
  showCard(true);
  els.pmsettings.hidden = true;
  const visualPage = $("pm-panel-visual");
  if (visualPage) visualPage.hidden = true;
  refreshChips(); refreshRows(); preview();
}

function closeFlyby(showPauseMenu) {
  if (!isOpen()) return;
  Log.info("game", "FlybyPanel.close");
  $("flyby").hidden = true;
  document.body.classList.remove("lt-open");
  showCard(false);
  { const a = annHost(); if (a) a.stop(); }
  if (typeof __apex !== "undefined" && __apex && __apex.view) {
    try { __apex.view("chase"); } catch (_) {  }
  }
  G.snapGameCam();
  if (showPauseMenu && G.paused) {
    els.pmsettings.hidden = false;
    const visualPage = $("pm-panel-visual");
    if (visualPage) visualPage.hidden = false;
  }
}


function flash(btn, msg) {
  if (!btn._fbLabel) btn._fbLabel = btn.textContent;
  btn.textContent = msg;
  clearTimeout(btn._fbT);
  btn._fbT = setTimeout(() => { btn.textContent = btn._fbLabel; btn._fbLabel = ""; }, 1800);
}

function setPose(end, r) {
  const s = ensure()[sel];
  if (!s || !r || !r.shot) return "";
  s.eye[end] = r.shot.eye[0]; s.look[end] = r.shot.look[0];
  s.fov[end] = Math.min(FOV.max, Math.max(FOV.min, r.shot.fov[0]));
  edited();
  return "Shot " + (sel + 1) + (end ? " ends" : " starts") + " here (round trip: eye " + r.err.eye + " m, look " + r.err.look + " m).";
}
function freeCam() {
  if (typeof FreeCam === "undefined" || !FreeCam.enterFrom) return;
  const c = G.dbgCam;
  const from = c ? { eye: c.eye.slice(), target: c.target.slice(), fov: c.fov } : {};
  closeFlyby(false);
  const ok = FreeCam.enterFrom(Object.assign(from, {
    lens: "flyby",
    back: openFlyby,
    actions: [
      { label: "SET SHOT START", title: "Make this view where the selected shot begins", run: (r) => setPose(0, r) },
      { label: "SET SHOT END", title: "Make this view where the selected shot ends", run: (r) => setPose(1, r) },
    ],
  }));
  if (!ok) openFlyby();
}
$("pm-flyby").onclick = openFlyby;
if ($("fb-freecam")) $("fb-freecam").onclick = freeCam;
$("fb-close").onclick = () => closeFlyby(true);
$("fb-u").oninput = () => { setU(parseFloat($("fb-u").value) / 1000); preview(); };
$("fb-add").onclick = () => { shots = addShot(ensure(), sel); sel += 1; setU(midOf(sel)); edited(); };
$("fb-dup").onclick = () => { shots = duplicateShot(ensure(), sel); sel += 1; setU(midOf(sel)); edited(); };
$("fb-del").onclick = () => {
  const before = ensure().length;
  shots = deleteShot(ensure(), sel);
  if (shots.length === before) { flash($("fb-del"), "NEED ONE"); return; }
  sel = Math.max(0, Math.min(shots.length - 1, sel)); setU(midOf(sel)); edited();
};
$("fb-up").onclick = () => {
  if (sel <= 0) return;
  shots = moveShot(ensure(), sel, -1); sel -= 1; setU(midOf(sel)); edited();
};
$("fb-down").onclick = () => {
  if (sel >= ensure().length - 1) return;
  shots = moveShot(ensure(), sel, 1); sel += 1; setU(midOf(sel)); edited();
};
$("fb-norm").onclick = () => { shots = normaliseDurs(ensure()); edited(); };
$("fb-reset").onclick = () => { shots = defaults(); sel = 0; setU(midOf(0)); $("fb-json").hidden = true; edited(); };

$("fb-copy").onclick = () => {
  const btn = $("fb-copy");
  const list = ensure();
  const bad = validateShots(list);
  const json = (bad.length ? "// THIS LIST WILL NOT BAKE:\n// " + bad.join("\n// ") + "\n" : "") + toBlob(list);
  const ta = $("fb-json");
  ta.value = json; ta.hidden = false;
  ta.focus(); if (ta.setSelectionRange) ta.setSelectionRange(0, json.length);
  ApexClipboard.write(json, { preferSync: true }).then((ok) => flash(btn,
    bad.length ? "COPIED (INVALID)" : (ok ? "COPIED ✓" : "SELECT & COPY ↑")));
};

_refresh = () => { if (isOpen()) { refreshChips(); refreshRows(); } };
return { openFlyby, closeFlyby, isOpen, setApiLoader, loadSaved, list: () => clone(ensure()) };
}

return { create, refresh: () => { if (_refresh) _refresh(); } };
})();
Object.freeze(FlybyEditor);
