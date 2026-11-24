/* Circuit Details dialog, loaded from the circuit picker or Appearance. */
const CircuitDetailsPanel = (function () {
"use strict";

function create({ G, whenCircuit, favList, toggleFav, drawElevProfile, drsZoneLapMetre, drsZoneWraps, vt }) {
// The track-detail map's size observer (openTrackDetail). Module-scoped so a
// re-open disconnects the previous one instead of stacking a fresh observer —
// and a stale closure over the PREVIOUS circuit — on every visit.
let detailRO = null, detailZoom = null;

function openTrackDetail() {
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  const modal = document.getElementById("track-detail");
  if (!modal) return;
  // A meta stub reads "0 turns", blank map: repaint when it lands (#5890).
  whenCircuit(t, () => { if (!modal.hidden) openTrackDetail(); });
  const crns = TrackMaps.corners(t);
  document.getElementById("track-detail-name").textContent = t.name + (t.gp ? "  ·  " + t.gp : "");
  // Canvas labels name this circuit, so each map reads distinctly to a screen reader.
  const mapCanvas = document.getElementById("track-detail-canvas");
  if (mapCanvas) mapCanvas.setAttribute("aria-label", t.name + " circuit layout diagram");
  const elevCanvas = document.getElementById("track-detail-elev");
  if (elevCanvas) elevCanvas.setAttribute("aria-label", t.name + " elevation profile");
  const dz = TrackMaps.drsZones(t);
  const dir = TrackMaps.direction(t);
  const elev = TrackMaps.elevRange(t);
  const meta = [
    t.country,
    t.lengthKm ? t.lengthKm.toFixed(1) + " km" : "",
    crns.length + " turns",
    dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "",
    elev > 2 ? "+" + elev + " m elev" : "",
    dz && dz.length ? dz.length + (dz.length === 1 ? " aero zone" : " aero zones") : ""
  ].filter(Boolean).join("  ·  ");
  document.getElementById("track-detail-meta").textContent = meta;

  // Circuit type flags
  const nightEl = document.getElementById("tdf-night");
  const streetEl = document.getElementById("tdf-street");
  const bankedEl = document.getElementById("tdf-banked");
  if (nightEl) nightEl.hidden = !t.night;
  if (streetEl) streetEl.hidden = !t.street;
  if (bankedEl) bankedEl.hidden = !t.banked;

  // ☆ FAVOURITE — built here, not in index.html, so the shell carries no node
  // for it; created once and repainted per circuit.
  const panel = document.getElementById("track-detail-panel");
  let fav = panel && panel.querySelector("#track-detail-fav");
  if (!fav && panel) {
    fav = document.createElement("button");
    fav.type = "button";
    fav.id = "track-detail-fav";
    fav.className = "sel-chip";
    panel.insertBefore(fav, document.getElementById("track-detail-flags"));
  }
  if (fav) {
    const paintFav = () => {
      const on = favList().includes(t.id);
      fav.textContent = on ? "★ FAVOURITE" : "☆ FAVOURITE";
      fav.classList.toggle("active", on);
      fav.setAttribute("aria-pressed", on ? "true" : "false");
    };
    fav.onclick = () => { toggleFav(t.id); paintFav(); };
    paintFav();
  }

  // Legend built once (like FAVOURITE), not in the shell. Fast/medium/slow/hairpin
  // reuse tdc-* colour; Sector is the grey S2 stroke the canvas key never named.
  const wrap = document.getElementById("track-detail-canvas-wrap");
  let legend = document.getElementById("track-detail-legend");
  if (!legend && wrap) {
    legend = document.createElement("ul");
    legend.id = "track-detail-legend";
    legend.setAttribute("aria-label", "Circuit map colours");
    wrap.appendChild(legend);
  }
  let controls = document.getElementById("track-detail-modes");
  if (!controls && wrap) {
    controls = document.createElement("div");
    controls.id = "track-detail-modes";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Circuit map overlay");
    wrap.insertBefore(controls, mapCanvas);
  }
  let mapFrame = wrap?.querySelector("#track-detail-map");
  if (!mapFrame && wrap && mapCanvas && TrackMaps.attachZoom) {
    mapFrame = document.createElement("div");
    mapFrame.id = "track-detail-map";
    wrap.insertBefore(mapFrame, legend);
    mapFrame.appendChild(mapCanvas);
    const tools = document.createElement("div");
    tools.id = "track-detail-map-tools";
    const zoomControls = document.createElement("div");
    wrap.insertBefore(tools, mapFrame);
    tools.append(controls, zoomControls);
    detailZoom = TrackMaps.attachZoom(mapCanvas, mapFrame, zoomControls, "sel-chip");
  }
  detailZoom?.reset();
  let mode = "overview";
  const speeds = crns.map(TrackMaps.cornerSpeed);
  const sectorItems = TrackMaps.sectorColors().map((color, i) => ["S" + (i + 1), color]);
  const aeroItems = dz.length ? [["Active Aero", TrackMaps.aeroColor()]] : [];
  const options = [
    ["overview", "Overview"], ["aero", "Active Aero", aeroItems], ["sectors", "Sectors", sectorItems],
    ["corners", "Corner Speed", speeds.some(Number.isFinite) && TrackMaps.cornerSpeedColors().map((color, i) => [
      ["Slow", "Medium", "Fast"][i], color,
    ])],
  ];
  options[0][2] = sectorItems.concat(aeroItems, ["Hairpin", "Slow", "Medium", "Fast"].map(
    (label) => [label, TrackMaps.classColor(label.toUpperCase())]));
  function selectMap(next, label, items) {
    mode = next;
    mapCanvas.setAttribute("aria-label", t.name + " circuit map · " + label);
    for (const button of controls.children) {
      const on = button.value === next;
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("active", on);
    }
    legend.replaceChildren();
    for (const [name, color] of items) {
      const li = document.createElement("li");
      const sw = document.createElement("i");
      const caption = document.createElement("span");
      caption.textContent = name;
      sw.style.color = color;
      li.append(sw, caption);
      legend.appendChild(li);
    }
  }
  if (controls && legend && mapCanvas) {
    controls.replaceChildren();
    for (const [value, label, items] of options) {
      if (!items?.length || (value === "sectors" && t.sectors?.length !== 2)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sel-chip";
      button.value = value;
      button.textContent = label;
      button.onclick = () => { selectMap(value, label, items); drawDetail(); };
      controls.appendChild(button);
    }
    selectMap(...options[0]);
  }

  // Elevation sparkline — same painter as the preview chart above; here the
  // canvas has a WRAPPER that carries the hidden state (the preview canvas
  // hides itself), which was the only real difference between the two blocks.
  drawElevProfile(document.getElementById("track-detail-elev"), t,
                  document.getElementById("track-detail-elev-wrap"));

  // Active-aero (straight-mode) zones with metre positions — the 2026 rules have no DRS
  const drsWrap = document.getElementById("track-detail-drs-wrap");
  const drsList = document.getElementById("track-detail-drs-list");
  if (drsWrap && drsList) {
    if (dz && dz.length) {
      const trackLen = (t.lengthKm || 5) * 1000;
      // A zone across the line: AeroZones leaves end > total (z.b > 1, z.wrap),
      // or a drawer already folded b into the next lap (z.b < z.a). Either way
      // "4870 m – 514 m" looked broken — name the S/F wrap. Place-keys stay on
      // Tracks / AeroZones; this is only the label.
      drsList.replaceChildren(...dz.map((zone, index) => {
        const row = document.createElement("div");
        row.className = "tdd-zone";
        const start = drsZoneLapMetre(zone.a, trackLen);
        const end = drsZoneLapMetre(zone.b, trackLen) + " m";
        row.textContent = "Zone " + (index + 1) + ": " + start + " m";
        if (drsZoneWraps(zone)) {
          const marker = document.createElement("span");
          marker.setAttribute("aria-label", "crossing start/finish");
          marker.textContent = " → S/F → ";
          const finish = document.createElement("span");
          finish.textContent = end;
          row.append(marker, finish);
        } else {
          row.textContent += " – " + end;
        }
        return row;
      }));
      drsWrap.hidden = false;
    } else {
      drsWrap.hidden = true;
    }
  }

  // Turns list — class from TrackMaps (radius + heading sweep), not raw |k|.
  // Literal tdc-* class names kept here so docs/COMPONENTS.md inventory still
  // sees them (dynamic "tdc-" + x would look unused to the audit).
  const TDC_CLS = {
    HAIRPIN: "tdc-hairpin",
    SLOW: "tdc-slow",
    MEDIUM: "tdc-medium",
    FAST: "tdc-fast"
  };
  const list = document.getElementById("track-detail-list");
  list.replaceChildren(...crns.map(corner => {
    const label = corner.cls || "MEDIUM";
    const chip = document.createElement("div");
    chip.className = "tdc-corner";
    const number = document.createElement("span");
    number.className = "tdc-num";
    number.textContent = "T" + corner.n;
    const speed = document.createElement("span");
    speed.className = TDC_CLS[label] || TDC_CLS.MEDIUM;
    speed.textContent = label;
    speed.style.color = TrackMaps.classColor(TDC_CLS[label] ? label : "MEDIUM");
    chip.append(number, speed);
    return chip;
  }));

  // Crossfade into the full-screen circuit-detail modal (progressive
  // enhancement; the content above is already populated while hidden).
  Log.info("ui", "Menus.open track-detail");
  vt(() => { modal.hidden = false; });
  const cv = document.getElementById("track-detail-canvas");
  // Give the desktop facts rail more room for an upright circuit. Key the rail
  // on the circuit's own shape so the canvas measurement cannot feed back
  // into the size of its frame.
  const circuitAspect = TrackMaps.aspect(t);
  const sheet = document.getElementById("td-inner");
  modal.setAttribute("data-map-tall", circuitAspect < 1 ? "1" : "0");
  let lastFit = "";
  const drawDetail = function () {
    // A queued rAF/ResizeObserver delivery may arrive after CLOSE. Never
    // measure and redraw a hidden modal, and never retain its circuit closure.
    if (modal.hidden) return;
    // The strip was drawn while the modal was display:none (a zero box, so deferred).
    drawElevProfile(document.getElementById("track-detail-elev"), t, document.getElementById("track-detail-elev-wrap"));
    // Fit the canvas to the wrap in local (pre-zoom) CSS pixels. clientWidth
    // is correct inside `zoom: var(--ui-scale)` sheets; gBCR would mix visual
    // pixels and re-introduce stretch at UI SIZE ≠ 100%.
    const wrapW = (mapFrame || wrap)?.clientWidth || (window.innerWidth - 24);
    const legendH = legend && getComputedStyle(legend).position !== "absolute" ? legend.offsetHeight : 0;
    const controlsH = controls ? controls.offsetHeight : 0;
    const gap = wrap ? parseFloat(getComputedStyle(wrap).rowGap) || 0 : 0;
    const wrapH = mapFrame ? mapFrame.clientHeight : wrap ? Math.max(0, wrap.clientHeight - legendH - controlsH - gap * (legendH ? 2 : 1)) : (window.innerHeight - 80);
    // Floors apply ONLY to the unmeasured fallbacks. Flooring a MEASURED wrap
    // at 200/150 pinned a canvas bigger than its box whenever the local wrap
    // was smaller than the floor — fitCanvas writes an inline max-width, which
    // beats the stylesheet's max-width:100% belt — so at UI SIZE 200% on a
    // landscape phone the map overflowed its wrap by 98px a side (2026-08-21
    // sweep). A measured wrap is the honest budget however small; fitCanvas's
    // own 40px transient floor still guards the degenerate frame.
    const maxW = wrapW > 0 ? wrapW : Math.max(200, Math.min(window.innerWidth - 24, 600));
    const maxH = wrapH > 0 ? wrapH : Math.max(150, Math.round(maxW / 1.2));
    // Zoom×dpr joins the KEY as well as the buffer: with a CSS-px-only key a
    // DPR change under an unchanged box (drag to another monitor, browser
    // zoom) produced an identical key and the early return skipped the refit.
    const ratio = Math.min(3, Math.max(1,
      (cv.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
    // Fit a tall circuit sideways only in the side-by-side layout, where it
    // can use the extra width. The projection is independent of overlay mode.
    const uprightScale = Math.min(maxW / circuitAspect, maxH);
    const sidewaysScale = Math.min(maxW, maxH / circuitAspect);
    const rotate = sheet?.dataset.shape === "wide" && mapFrame?.clientWidth > 0 &&
      wrapH > 0 && maxW > maxH && circuitAspect < 1 && sidewaysScale > uprightScale * 1.15;
    const key = maxW + "x" + maxH + "@" + ratio.toFixed(2) + ":" + rotate + ":" + mode;
    if (key === lastFit) return;   // the observer below also fires on our own pin
    lastFit = key;
    const fit = TrackMaps.fitCanvas(cv, maxW, maxH, t, true, rotate);
    // The biggest circuit diagram in the game had NO dpr/zoom term: inside
    // zoom: var(--ui-scale) at dpr 2 + 200% it painted at 4x its backing
    // store. Same buffer expansion + buffer-ratio param scaling as the
    // picker preview above; CSS size stays the local fit.
    if (ratio > 1.01) {
      cv.width = Math.round(fit.w * ratio);
      cv.height = Math.round(fit.h * ratio);
    }
    const mk = Math.min(1, fit.w / 520, fit.h / 300);
    const br = fit.w ? (cv.width / fit.w) : 1;
    TrackMaps.draw(cv, t, {
      checkeredStart: true, rotate,
      width: Math.max(2 * br, Math.round(5 * mk * br)), pad: Math.max(12 * br, Math.round(42 * mk * br)),
      corners: mode === "overview", cornerR: Math.max(4 * br, Math.round(6 * mk * br)), cornerFont: Math.max(8 * br, Math.round(12 * mk * br)),
      sectors: mode === "overview" || mode === "sectors", drs: mode === "overview" || mode === "aero",
      color: mode === "corners" || mode === "aero" ? "#b8c2d1" : undefined,
      cornerSpeeds: mode === "corners" ? speeds : null, legend: false
    });
    detailZoom?.refit();
  };
  requestAnimationFrame(drawDetail);
  // ONE rAF LANDS TOO EARLY. The modal opens through a view transition, so the
  // first frame measures the dialog mid-animation: 500px of an eventual 645px
  // wrap, a fifth of the map's height thrown away on every open, and the map
  // stayed that size because nothing re-measured afterwards. Re-fit whenever
  // the wrap's box actually changes — which also covers a UI SIZE change or a
  // rotation while the modal is open. Guarded by lastFit so pinning the canvas
  // cannot feed itself a second pass.
  if (wrap && typeof ResizeObserver === "function") {
    if (detailRO) detailRO.disconnect();
    detailRO = new ResizeObserver(drawDetail);
    detailRO.observe(mapFrame || wrap);
  }
}
function closeTrackDetail() {
  const modal = document.getElementById("track-detail");
  if (modal) modal.hidden = true;
  if (detailRO) detailRO.disconnect();
  detailRO = null;
}
return { openTrackDetail, closeTrackDetail };
}
return { create };
})();
Object.freeze(CircuitDetailsPanel);
