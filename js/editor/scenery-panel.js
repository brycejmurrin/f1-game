/* Apex 26 — DesignerScenery: the track designer's scenery inspector. Theme
   discovery and placement preferences stay UI-only; edits go through the
   designer's undo/draft pipeline and the existing look/props codec. */
const DesignerScenery = (function () {
  "use strict";
  const CATEGORIES = Object.freeze({
    all: null,
    nature: ["parkland", "alpine", "autumn", "tuscany", "savanna", "ardennes", "winter", "jungle", "lakeside", "moorland", "vineyard"],
    coast: ["harbour", "marina", "coast", "twilight", "lakeside", "shipyard", "island"],
    city: ["harbour", "marina", "tilke", "airfield", "metropolis", "shipyard", "stadium"],
    desert: ["oasis", "desertnight", "canyon", "saltflat"],
    night: ["desertnight", "marina", "twilight", "stadium"],
  });
  const PRESETS = Object.freeze({
    default: { label: "THEME DEFAULT", time: "auto", trees: "normal", crowd: "normal" },
    golden: { label: "GOLDEN HOUR", time: "dusk", trees: "many", crowd: "few" },
    race: { label: "RACE NIGHT", time: "night", trees: "normal", crowd: "packed" },
  });
  const LOOK_ROWS = [["time", "TIME OF DAY"], ["trees", "TREES"], ["crowd", "CROWD"]];
  // Match the live prop renderer's clearance floors (gap is from road edge).
  const MIN_GAP = { stand: 14, gantry: 0, trees: 20, water: 24, flood: 18, billboard: 6 };
  function matches(id, category, query) {
    const ids = CATEGORIES[category] || null, p = TrackThemes.get(id);
    const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    const text = (p.label + " " + p.blurb).toLowerCase();
    return (!ids || ids.includes(id)) && words.every((w) => text.includes(w));
  }
  function create({ el, btn, group, stepper, onTheme, onLook, onPreset, onKind, onPlace, onRemove, onRemoveAt }) {
    const root = group("SCENERY");
    root.dataset.role = "scenery";
    let category = "all", current = null, side = 1, lastProps = null;
    const gaps = Object.assign({}, TrackDesignerProps.DEFAULT_GAP);
    const summary = el("div", "td-group"); summary.dataset.role = "theme-summary";
    const activeName = el("div", "td-label");
    const blurb = el("div", "td-hint"); blurb.dataset.role = "theme-blurb";
    blurb.setAttribute("aria-live", "polite");
    summary.append(activeName, blurb);
    const searchRow = el("div", "td-chips"); searchRow.dataset.role = "theme-search";
    const search = el("input", "td-input"); search.type = "search";
    search.placeholder = "Find a theme…"; search.setAttribute("aria-label", "Find a scenery theme");
    const clear = btn("CLEAR", "sel-chip", () => {
      search.value = ""; category = "all"; filter(); search.focus();
    });
    clear.setAttribute("aria-label", "Clear theme search and filters");
    searchRow.append(search, clear);
    const filters = el("div", "td-chips"); filters.dataset.role = "theme-filters";
    filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "Theme categories");
    for (const id of Object.keys(CATEGORIES)) {
      const b = btn(id === "all" ? "ALL " + TrackThemes.ORDER.length : id.toUpperCase(), "sel-chip", () => { category = id; filter(); });
      b.dataset.category = id; filters.appendChild(b);
    }
    const themes = el("div", "td-chips"); themes.dataset.role = "themes";
    themes.setAttribute("role", "group"); themes.setAttribute("aria-label", "Theme");
    for (const id of TrackThemes.ORDER) {
      const p = TrackThemes.get(id), label = p.label || id.toUpperCase();
      const b = btn("", "sel-chip", () => onTheme(id));
      b.dataset.theme = id; b.title = p.blurb; b.setAttribute("aria-label", label);
      const sw = el("span", "swatch"); sw.setAttribute("aria-hidden", "true"); sw.style.background = TrackThemes.swatchCss(id);
      const name = el("span", "", label); name.dataset.role = "theme-label";
      b.append(sw, name); themes.appendChild(b);
    }
    const count = el("div", "td-hint"); count.dataset.role = "theme-results";
    count.setAttribute("role", "status");
    function pressed(b, on) { b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }
    function filter() {
      let n = 0;
      for (const b of themes.children) { b.hidden = !matches(b.dataset.theme, category, search.value); if (!b.hidden) n++; }
      for (const b of filters.children) pressed(b, b.dataset.category === category);
      clear.hidden = category === "all" && !search.value;
      count.textContent = n ? n + " of " + TrackThemes.ORDER.length + " themes" : "No themes found. Try another search or clear filters.";
      themes.hidden = !n;
      themes.scrollTop = 0;
    }
    search.addEventListener("input", filter);
    root.append(summary, searchRow, filters, themes, count);

    const atmosphere = group("ATMOSPHERE"); atmosphere.dataset.role = "atmosphere";
    const presets = el("div", "td-chips"); presets.dataset.role = "look-presets";
    for (const [id, p] of Object.entries(PRESETS)) {
      const b = btn(p.label, "sel-chip", () => onPreset(id));
      b.dataset.preset = id; b.title = "Time: " + p.time + " · trees: " + p.trees + " · crowd: " + p.crowd;
      presets.appendChild(b);
    }
    atmosphere.appendChild(presets);
    const lookRows = {};
    for (const [key, label] of LOOK_ROWS) {
      const row = el("div", "td-row"); row.setAttribute("role", "group"); row.setAttribute("aria-label", label);
      row.appendChild(el("span", "", label));
      for (const v of TrackThemes.LOOK[key]) {
        const b = btn(v.toUpperCase(), "sel-chip", () => onLook(key, v)); b.dataset.look = key + ":" + v;
        b.setAttribute("aria-label", label + " " + v); row.appendChild(b);
      }
      lookRows[key] = row; atmosphere.appendChild(row);
    }
    root.appendChild(atmosphere);

    const propsGroup = group("TRACKSIDE PROPS"); propsGroup.dataset.role = "prop-inspector";
    const props = el("div", "td-chips"); props.dataset.role = "props";
    props.setAttribute("role", "group"); props.setAttribute("aria-label", "Scenery props");
    for (const id of TrackDesignerProps.KINDS) {
      const b = btn(TrackDesignerProps.LABELS[id], "sel-chip", () => onKind(id)); b.dataset.prop = id; props.appendChild(b);
    }
    const sides = el("div", "td-chips"); sides.dataset.role = "prop-side";
    sides.setAttribute("role", "group"); sides.setAttribute("aria-label", "Track side in driving direction");
    sides.appendChild(el("span", "td-hint", "TRACK SIDE"));
    for (const [value, label] of [[-1, "LEFT"], [1, "RIGHT"]]) {
      const b = btn(label, "sel-chip", () => { side = value; if (current) refresh(current); });
      b.dataset.side = String(value); sides.appendChild(b);
    }
    const gap = stepper("ROADSIDE GAP m", () => gaps[current ? current.propKind : "stand"], (v) => {
      const kind = current ? current.propKind : "stand";
      gaps[kind] = Math.max(MIN_GAP[kind], Math.min(120, Math.round(v))); gap._refresh();
    }, 2);
    gap.dataset.role = "prop-gap";
    const hint = el("div", "td-hint"); hint.dataset.role = "props-hint";
    const actions = el("div", "td-chips"); actions.dataset.role = "prop-actions";
    const place = btn("PLACE AT POINT", "sel-edit", onPlace);
    place.setAttribute("aria-label", "Place the selected prop at the selected control point");
    const remove = btn("REMOVE LAST", "sel-chip", onRemove);
    remove.setAttribute("aria-label", "Remove the last placed prop of the selected kind");
    actions.append(place, remove);
    const list = el("ul", "td-issues"); list.dataset.role = "placed-props"; list.setAttribute("aria-label", "Placed scenery props");
    propsGroup.append(props, sides, gap, hint, actions, list); root.appendChild(propsGroup);

    function refresh(state) {
      current = state;
      const d = state.design, kind = state.propKind, p = TrackThemes.get(d.theme), look = TrackThemes.lookOf(d);
      activeName.textContent = p.label; blurb.textContent = p.blurb;
      for (const b of themes.children) pressed(b, b.dataset.theme === d.theme);
      for (const key of Object.keys(lookRows)) for (const b of lookRows[key].children) if (b.dataset.look) pressed(b, b.dataset.look === key + ":" + look[key]);
      for (const b of presets.children) pressed(b, LOOK_ROWS.every(([key]) => PRESETS[b.dataset.preset][key] === look[key]));
      const c = TrackDesignerProps.counts(d.props);
      for (const b of props.children) {
        const id = b.dataset.prop;
        pressed(b, id === kind);
        b.textContent = TrackDesignerProps.LABELS[id] + " " + c[id] + "/" + TrackDesignerProps.CAPS[id];
        // A full kind remains selectable so its placed objects can be removed.
      }
      for (const b of sides.children) if (b.dataset.side) pressed(b, +b.dataset.side === side);
      sides.hidden = gap.hidden = kind === "gantry"; gap._refresh();
      const point = state.sel >= 0 ? "point " + (state.sel + 1) : "the start line";
      hint.textContent = c.total + "/" + TrackDesignerProps.TOTAL + " placed · " + (kind === "gantry" ? "Over the road at " : "At ") + point + ". " + (state.sel < 0 ? "Select a point on the map to place elsewhere." : "Left/right follows driving direction.");
      place.textContent = state.sel >= 0 ? "PLACE AT POINT " + (state.sel + 1) : "PLACE AT START";
      place.disabled = !d.pts.length || !TrackDesignerProps.canPlace(d.props, kind);
      remove.disabled = !c[kind];
      const key = JSON.stringify(d.props || []);
      if (key !== lastProps) {
        lastProps = key;
        while (list.firstChild) list.removeChild(list.firstChild);
        for (const [i, prop] of (d.props || []).entries()) {
          const li = el("li", "td-issue");
          const where = prop.kind === "gantry" ? "OVER ROAD" : (prop.side < 0 ? "LEFT" : "RIGHT") + " · " + prop.gap + " m";
          li.appendChild(el("span", "", TrackDesignerProps.LABELS[prop.kind] + " · " + Math.round(prop.s * 100) + "% LAP · " + where));
          const del = btn("REMOVE", "sel-chip", () => {
            onRemoveAt(i);
            const next = list.children[Math.min(i, list.children.length - 1)];
            const focus = next && next.querySelector("button"); (focus || place).focus();
          });
          del.setAttribute("aria-label", "Remove placed " + TrackDesignerProps.LABELS[prop.kind].toLowerCase() + " " + (i + 1));
          li.appendChild(del); list.appendChild(li);
        }
      }
    }
    filter();
    return { root, refresh, placement: (kind) => ({ side: kind === "gantry" ? 1 : side, gap: gaps[kind] }) };
  }
  return { create, matches, PRESETS, CATEGORIES };
})();
Object.freeze(DesignerScenery);
