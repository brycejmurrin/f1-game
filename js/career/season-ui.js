const SeasonUI = (function () {
  "use strict";

function create(G) {
  Log.info("ui", "SeasonUI.create");
  const { $, els } = G;

  let draft = null;
  let calBtns = [];

  const el = Dom.el;
  function head(text, id) {
    const h = el("h3", "sel-label", text);
    if (id) h.id = id;
    return h;
  }
  function tick() { if (G.soundOn) GameAudio.uiTick(); }

  function chipRow(parent, label, id, opts, current, pick) {
    parent.appendChild(head(label, id + "-label"));
    const row = el("div", "chip-row");
    row.id = id;
    row.setAttribute("role", "group");
    row.setAttribute("aria-labelledby", id + "-label");
    for (const [val, text] of opts) {
      const b = el("button", "sel-chip" + (val === current ? " active" : ""), text);
      b.type = "button";
      b.setAttribute("aria-pressed", val === current ? "true" : "false");
      b.onclick = () => { pick(val); tick(); build(); };
      row.appendChild(b);
    }
    parent.appendChild(row);
  }

  function buildCalendar() {
    const pane = $("ss-cal");
    pane.textContent = "";
    pane.appendChild(head(`CALENDAR — ${draft.trackIds.length}`
      + (draft.trackIds.length === 1 ? " ROUND" : " ROUNDS")));
    const byId = new Map(Tracks.LIST.map((t) => [t.id, t]));
    calBtns = [];
    draft.trackIds.forEach((id, i) => {
      const t = byId.get(id);
      if (!t) return;
      const row = el("div", "season-upcoming-row");
      row.append(el("span", "sur-rnd", `R${i + 1}`), el("span", "sur-name", t.name));
      const perRound = draft.sprint === "rounds";
      const sprintHere = perRound && sprintIds().indexOf(id) >= 0;
      const ctl = [
        ["↑", "Move up", i > 0, () => { swap(i, i - 1); return i - 1; }],
        ["↓", "Move down", i < draft.trackIds.length - 1, () => { swap(i, i + 1); return i + 1; }],
        ["✕", "Remove", draft.trackIds.length > 1,
          () => { draft.trackIds.splice(i, 1); return Math.min(i, draft.trackIds.length - 1); }],
      ];
      if (perRound) ctl.push([sprintHere ? "SPRINT" : "GP", "Sprint weekend", true, () => { toggleSprint(id); return i; }]);
      const btns = [];
      ctl.forEach(([glyph, label, on, act], k) => {
        const b = el("button", "sel-chip", glyph);
        b.type = "button";
        b.disabled = !on;
        b.setAttribute("aria-label", `${label} — ${t.name}`);
        if (k === 3) b.setAttribute("aria-pressed", sprintHere ? "true" : "false");
        b.onclick = () => { const row = act(); tick(); build(); focusCal(row, k); };
        row.appendChild(b);
        btns.push(b);
      });
      calBtns.push(btns);
      pane.appendChild(row);
    });
  }
  function focusCal(row, k) {
    const btns = calBtns[row] || [];
    const b = btns[k] && !btns[k].disabled ? btns[k] : btns.find((x) => !x.disabled);
    (b || $("ss-apply")).focus();
  }
  function sprintIds() { return Array.isArray(draft.sprintIds) ? draft.sprintIds : (draft.sprintIds = []); }
  function toggleSprint(id) {
    const ids = sprintIds();
    const at = ids.indexOf(id);
    if (at >= 0) ids.splice(at, 1);
    else ids.push(id);
  }
  function swap(a, b) {
    const ids = draft.trackIds;
    const t = ids[a];
    ids[a] = ids[b];
    ids[b] = t;
  }

  function buildPool() {
    const pane = $("ss-pool");
    pane.textContent = "";

    pane.appendChild(head("PRESETS", "ss-presets-label"));
    const pre = el("div", "chip-row balanced-row");
    pre.id = "ss-presets";
    pre.setAttribute("role", "group");
    pre.setAttribute("aria-labelledby", "ss-presets-label");
    for (const p of SeasonCal.PRESETS) {
      const b = el("button", "sel-chip", p.label);
      b.type = "button";
      b.onclick = () => {
        const next = SeasonCal.preset ? SeasonCal.preset(p.id) : { trackIds: SeasonCal.presetIds(p.id) };
        Object.assign(draft, next);
        if (next.sprintIds) draft.sprintIds = next.sprintIds.slice();
        tick(); build();
      };
      pre.appendChild(b);
    }
    for (const [label, act] of [
      ["SHUFFLE", () => { draft.trackIds = SeasonCal.shuffled(draft.trackIds); }],
      ["REVERSE", () => { draft.trackIds = draft.trackIds.slice().reverse(); }],
    ]) {
      const b = el("button", "sel-chip", label);
      b.type = "button";
      b.onclick = () => { act(); tick(); build(); };
      pre.appendChild(b);
    }
    pane.appendChild(pre);

    chipRow(pane, "QUALIFYING", "ss-quali",
      [[true, "ON"], [false, "OFF"]], draft.quali, (v) => { draft.quali = v; });
    chipRow(pane, "SPRINT RACE", "ss-sprint",
      [[false, "OFF"], [true, "ON"], ["rounds", "SPRINT ROUNDS"]], draft.sprint, (v) => { draft.sprint = v; });
    chipRow(pane, "RACE DISTANCE", "ss-laps",
      SeasonCal.LAP_OPTS.map((n) => [n, n + (n === 1 ? " LAP" : " LAPS")]),
      draft.laps, (v) => { draft.laps = v; });
    chipRow(pane, "POINTS", "ss-points",
      [["modern", "25-18-15… (2010–)"], ["classic", "10-6-4… (1991–2002)"]],
      draft.points, (v) => { draft.points = v; });
    chipRow(pane, "FASTEST LAP POINT", "ss-fl",
      [[false, "OFF"], [true, "+1 (2019–2024 RULE)"]],
      draft.flPoint, (v) => { draft.flPoint = v; });
    chipRow(pane, "DROPPED SCORES", "ss-drop",
      SeasonCal.DROP_OPTS.map((n) => [n, n ? "DROP WORST " + n : "ALL COUNT"]),
      draft.drop, (v) => { draft.drop = v; });

    const note = el("div", "sur-country");
    note.id = "ss-note";
    const marked = draft.trackIds.filter((id) => sprintIds().indexOf(id) >= 0).length;
    note.textContent = (draft.sprint === "rounds"
      ? `${marked} of ${draft.trackIds.length} rounds are sprint weekends: a sprint runs a third of the `
        + `distance before the Grand Prix and pays ${SeasonCal.SPRINT_POINTS.join(" · ")} pts.`
      : draft.sprint
      ? `A sprint runs a third of the distance before the Grand Prix and pays `
        + `${SeasonCal.SPRINT_POINTS.join(" · ")} pts. Both legs score.`
      : "One race per round.")
      + (draft.flPoint ? " The fastest Grand Prix lap pays one point to a top-ten finisher." : "")
      + (draft.drop ? ` Only a driver's best ${Math.max(1, draft.trackIds.length - draft.drop)}`
        + ` of ${draft.trackIds.length} rounds count, as until 1990.` : "");
    pane.appendChild(note);

    const used = new Set(draft.trackIds);
    const rest = Tracks.LIST.filter((t) => !t.custom && !used.has(t.id));
    pane.appendChild(head(rest.length ? "ADD A CIRCUIT" : "EVERY CIRCUIT IS ON THE CALENDAR"));
    for (const t of rest) {
      const row = el("button", "track-row");
      row.type = "button";
      row.setAttribute("aria-label", `Add ${t.name} to the calendar`);
      const nm = el("span", "track-row-name", t.name);
      if (t.classic) nm.appendChild(el("span", "trb trb-classic", "CLASSIC"));
      row.append(nm, el("span", "track-row-meta", t.country || ""));
      row.onclick = () => { draft.trackIds.push(t.id); tick(); build(); };
      pane.appendChild(row);
    }
  }

  function restartsProgress() {
    const season = G.season;
    return !(SeasonCal.canRace(season) && SeasonCal.matchesConfig(season, draft)) && (SeasonCal.hasProgress(season)
      || !!(season && Array.isArray(season.qualiOrder) && season.qualiOrder.length));
  }

  function build() {
    if (!draft) return;
    const panes = () => { buildCalendar(); buildPool(); };
    if (window.TopModal && TopModal.keepFocus) TopModal.keepFocus($("season-setup"), panes);
    else panes();
    const live = restartsProgress();
    const ab = $("ss-apply");
    delete ab.dataset.armed;
    ab.classList.remove("armed");
    ab.textContent = live ? "APPLY — RESTART SEASON" : "APPLY";
    const bb = $("ss-back");
    delete bb.dataset.armed;
    bb.classList.remove("armed");
    bb.textContent = "BACK";
    if (window.ScrollFade) ScrollFade.refresh();
  }

  function open() {
    draft = Object.assign({}, SeasonCal.config());
    draft.trackIds = draft.trackIds.slice();
    draft.sprintIds = Array.isArray(draft.sprintIds) ? draft.sprintIds.slice() : [];
    build();
    $("season-setup").hidden = false;
    Log.info("ui", "SeasonUI.open");
    if (G.soundOn) GameAudio.uiSelect();
  }
  function close() {
    $("season-setup").hidden = true;
    draft = null;
    Log.info("ui", "SeasonUI.close");
  }

  function refreshTitle() {
    const btn = $("mb-season");
    const lab = btn && btn.querySelector && btn.querySelector("span");
    const textNode = lab && lab.childNodes ? Array.prototype.find.call(lab.childNodes, (x) => x.nodeType === 3) : null;
    if (!textNode) return;
    const season = G.season;
    const n = SeasonCal.rounds();
    const r = (SeasonCal.hasProgress(season) && n) ? Math.min((season.round || 0) + 1, n) : 0;
    textNode.nodeValue = (r ? `SEASON · R${r} OF ${n}` : "SEASON") + " ";
    const sub = btn.querySelector(".mb-sub"), tag = sub ? String(sub.textContent || "") : "";
    btn.setAttribute("aria-label", (r ? `Season · R${r} of ${n}` : "Season")
      + (tag ? " — " + tag.charAt(0) + tag.slice(1).toLowerCase() : ""));
  }

  $("ss-back").onclick = () => {
    const leave = () => { close(); if (G.soundOn) GameAudio.uiSelect(); };
    if (draft && !SeasonCal.matchesConfig({ config: SeasonCal.config() }, draft)) G.armConfirm($("ss-back"), "DISCARD EDITS?", leave);
    else leave();
  };
  $("ss-apply").onclick = () => {
    const apply = () => {
      Log.info("ui", "SeasonUI.apply");
      const result = SeasonCal.applyConfig(draft);
      if (!result.ok) {
        G.season = SeasonCal.load();
        build();
        refreshTitle();
        const note = $("ss-note");
        if (note) {
          note.setAttribute("role", "status");
          note.textContent = "Season changed in another tab — loaded the latest save. Review, then APPLY again.";
        }
        return;
      }
      G.season = result.season;
      if (!result.durable && G.announce) G.announce("SEASON IS SESSION ONLY — STORAGE IS FULL", 4, "race");
      G.trackIdx = SeasonCal.trackIndex(G.season.round);
      close();
      G.buildSelect();
      G.refreshCareerButton();
      if (G.soundOn) GameAudio.uiSelect();
    };
    if (restartsProgress()) {
      if (G.soundOn) GameAudio.uiTick();
      G.armConfirm($("ss-apply"), "RESTART? — SEASON IS LOST", apply);
    } else apply();
  };

  return { open, close, build, refreshTitle };
}

return { create };
})();
Object.freeze(SeasonUI);
