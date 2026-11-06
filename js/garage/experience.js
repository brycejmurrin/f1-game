/* Apex 26 — reversible garage/home cameras, ambient clock, and honest part comparisons. */
const GarageExperience = (function () {
  "use strict";

  function clock(now = 0) {
    let at = now, last = now;
    return { step(wall, moving) {
      const gap = Math.max(0, Math.min(100, wall - last));
      last = wall;
      if (moving) at += gap;
      return at;
    }, reset(wall) { at = last = wall; }, get value() { return at; } };
  }

  // Composed home shots use the existing orbit rig and its panel lens shift.
  // Garage inspection presets remain unchanged; these views give a menu visit
  // its own framing without changing any saved driving or photo preference.
  const HOME_SHOTS = Object.freeze({
    hero: Object.freeze({ az: Math.PI * 0.78, el: 0.30, dist: 8.35 }),
    front: Object.freeze({ az: Math.PI * 0.16, el: 0.24, dist: 6.4, fov: 54, maxDist: 6.4 }),
    side: Object.freeze({ az: Math.PI * 0.50, el: 0.15, dist: 10.2 }),
    rear: Object.freeze({ az: Math.PI * 0.92, el: 0.28, dist: 8.2 }),
  });

  function homeShot(mode, requested) {
    const name = Object.prototype.hasOwnProperty.call(HOME_SHOTS, requested) ? requested : mode === "studio" ? "side" : "hero";
    return { name, pose: HOME_SHOTS[name] };
  }

  function homeSession(camera, reduced) {
    let home = null;
    return {
      begin(mode, opts = {}) {
        if (!["garage", "night", "studio"].includes(mode)) return false;
        if (!home) home = { saved: camera.capture(), mode, opts };
        home.mode = mode; home.opts = opts;
        const shot = homeShot(mode, opts.shot);
        home.shot = shot.name;
        camera.view(shot.name, shot.pose);
        return true;
      },
      end() {
        if (!home) return false;
        const saved = home.saved; home = null; camera.restore(saved); return true;
      },
      get active() { return !!home; },
      get mode() { return home && home.mode; },
      get panel() { return home && home.opts.panel; },
      get lens() { return home ? HOME_SHOTS[home.shot] : null; },
      get moving() { return !!home && home.opts.motion === "ambient" && !reduced(); },
      state() { return home ? { mode: home.mode, motion: this.moving ? "ambient" : "still", shot: home.shot } : null; },
    };
  }

  function canOrbit(garage, home, photo, blocked) {
    return !blocked && (!!garage || (!!home && !!photo));
  }

  function freePane(panel, canvas) {
    const w = canvas.width, h = canvas.height;
    const unit = (v) => Math.max(0, Math.min(1, v));
    if (w - panel.width >= h - panel.height) {
      return panel.left + panel.right < canvas.left + canvas.right
        ? { left: unit((panel.right - canvas.left) / w), right: 1, top: 0, bottom: 1 }
        : { left: 0, right: unit((panel.left - canvas.left) / w), top: 0, bottom: 1 };
    }
    return panel.top + panel.bottom < canvas.top + canvas.bottom
      ? { left: 0, right: 1, top: unit((panel.bottom - canvas.top) / h), bottom: 1 }
      : { left: 0, right: 1, top: 0, bottom: unit((panel.top - canvas.top) / h) };
  }

  function fitHome(hull, rig, pane) {
    if (!hull || hull.length < 3) return null;
    const ca = Math.cos(rig.az), sa = Math.sin(rig.az), ce = Math.cos(rig.el), se = Math.sin(rig.el);
    const tan = Math.tan(rig.fov * Math.PI / 360), cx = rig.center[0], cy = rig.center[1], cz = rig.center[2];
    const width = Math.max(0.05, (pane.right - pane.left) * 2 * 0.84);
    const height = Math.max(0.05, (pane.bottom - pane.top) * 2 * 0.76);
    let x0, x1, y0, y1;
    function project(dist) {
      x0 = y0 = Infinity; x1 = y1 = -Infinity;
      for (let i = 0; i < hull.length; i += 3) {
        const x = hull[i] - cx, y = hull[i + 1] - cy, z = hull[i + 2] - cz;
        const depth = dist - (x * sa * ce + y * se + z * ca * ce);
        if (depth <= 0.1) return false;
        const nx = (x * ca - z * sa) / (depth * tan * rig.aspect);
        const ny = (-x * sa * se + y * ce - z * ca * se) / (depth * tan);
        x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
      }
      return x1 - x0 <= width && y1 - y0 <= height;
    }
    let lo = rig.minDist, hi = rig.maxDist;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (project(mid)) hi = mid; else lo = mid;
    }
    project(hi);
    return { dist: hi, shiftX: (x0 + x1) / 2 - (pane.left + pane.right - 1),
      shiftY: (y0 + y1) / 2 - (1 - pane.top - pane.bottom), width: x1 - x0, height: y1 - y0 };
  }

  // The team's stats AS RACED: Career.teamStats folds in the career development
  // (tdev) that game.js modsFor applies, so the bars, the comparison and the wall
  // board all agree with the car. Outside a career it is team.stats.
  function statsOf(team) {
    const s = typeof Career !== "undefined" && Career.teamStats ? Career.teamStats(team) : null;
    return s || (team && team.stats) || null;
  }

  function compare(team, parts, cat, current, candidate, tune, cap) {
    const next = Object.assign({}, parts, { [cat.id]: candidate.id });
    const before = Parts.getMods(parts, team, tune), after = Parts.getMods(next, team, tune);
    const stats = statsOf(team);
    const deltas = Parts.STAT_KEYS.map(({ key, label }) => {
      const base = (stats && stats[key]) || 75;
      return { key, label, value: Math.round(Parts.displayStat(base * after[key])) - Math.round(Parts.displayStat(base * before[key])) };
    });
    return { deltas, cost: (candidate.cost || 0) - ((current && current.cost) || 0),
      remaining: cap - Parts.getCost(next, team) };
  }

  function partSummary(container, team, parts, cat, current, tune, cap, frame) {
    const box = document.createElement("section"); box.className = "cs-inspection";
    box.setAttribute("aria-label", "Part comparison");
    const head = document.createElement("strong"), detail = document.createElement("p");
    detail.setAttribute("aria-live", "polite"); detail.setAttribute("aria-atomic", "true");
    const inspect = document.createElement("button"); inspect.type = "button";
    inspect.className = "sel-chip"; inspect.textContent = "INSPECT " + cat.label.toUpperCase();
    inspect.onclick = frame;
    box.append(head, detail, inspect); container.appendChild(box);
    function show(opt) {
      const c = compare(team, parts, cat, current, opt, tune, cap);
      head.textContent = opt.label;
      const stats = c.deltas.filter((d) => d.value).map((d) => d.label + " " + (d.value > 0 ? "+" : "") + d.value);
      detail.textContent = opt.id === (current && current.id) ? "Fitted · inspect the car or compare another option."
        : (c.cost > 0 ? "+" : "") + c.cost + " cr vs fitted · " + (Number.isFinite(cap) ? c.remaining + " cr remaining" : "Free build")
          + (stats.length ? " · " + stats.join(" / ") : " · Same displayed performance");
    }
    if (current) show(current);
    return show;
  }

  function careerKey(ctx) {
    const a = ctx && ctx.achievements;
    return a && a.active ? [a.facility, a.wins, a.podiums, a.titles].join(":") : "-";
  }

  function buildFacility(g, liv, ctx) {
    const a = ctx && ctx.achievements;
    if (!a || !a.active) return;
    const { block, DARK, STEEL, Z_BACK, rgb } = GaragePrims;
    const accent = rgb(liv && liv.c2, STEEL);
    // Each two earned facility levels install a research workstation; geometry
    // is built only when the career metadata changes, never on the frame clock.
    const count = Math.min(4, Math.ceil(Math.max(0, a.facility) / 2));
    for (let i = 0; i < count; i++) {
      const x = -3.4 + i * 1.8;
      block(g.back, x, 0.9, Z_BACK + 0.75, 0.68, 0.10, 0.38, STEEL);
      block(g.back, x, 0.45, Z_BACK + 0.75, 0.55, 0.40, 0.29, DARK);
      block(g.back, x, 1.30, Z_BACK + 0.50, 0.39, 0.27, 0.07, DARK);
      block(g.back, x, 1.30, Z_BACK + 0.59, 0.34, 0.21, 0.01, accent);
    }
    // Earned wins become a compact trophy shelf, capped to avoid clutter.
    if (a.wins > 0) block(g.back, 2.95, 2.12, Z_BACK + 0.20, 1.05, 0.04, 0.15, STEEL);
    for (let i = 0; i < Math.min(6, a.wins); i++)
      block(g.back, 2.2 + i * 0.30, 2.32, Z_BACK + 0.20, 0.09, 0.16, 0.08, [0.72, 0.54, 0.18]);
  }

  function paintCareer(cv, ctx) {
    const a = ctx && ctx.achievements;
    if (!a || !a.active) return;
    const c = cv.getContext("2d");
    c.fillStyle = "#10141b"; c.fillRect(0, 320, 512, 64);
    c.fillStyle = "#f2f3f5"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "700 23px system-ui, sans-serif";
    c.fillText("RESEARCH FACILITY " + a.facility + " / " + a.facilityMax, 256, 341, 490);
    c.font = "600 16px system-ui, sans-serif"; c.fillStyle = "#c4ccd8";
    c.fillText(a.wins + " WINS · " + a.podiums + " PODIUMS · " + a.titles + " TITLES", 256, 365, 490);
  }

  return Object.freeze({ clock, homeShot, homeSession, canOrbit, freePane, fitHome, statsOf, compare, partSummary, careerKey, buildFacility, paintCareer });
})();
