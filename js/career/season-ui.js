/* Apex 26 — the SEASON SETUP screen (#season-setup): the calendar the player races and the format they race it under. Opens over #select from the CUSTOMISE button… */
const SeasonUI = (function () {
  "use strict";

function create(G) {
  Log.info("ui", "SeasonUI.create");
  const { $, els } = G;

  let draft = null;
  // The calendar rows' controls, per row in draft order, from the LAST paint.
  // build() replaces every node, so the button that was just pressed is gone
  // and focus fell to <body>: a keyboard / screen-reader user reordering a
  // 24-round calendar lost their place on every press. Kept as an array, not
  // re-queried, so the refocus never depends on the pane's DOM shape.
  let calBtns = [];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
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
    pane.appendChild(head("CALENDAR — " + draft.trackIds.length
      + (draft.trackIds.length === 1 ? " ROUND" : " ROUNDS")));
    const byId = new Map(Tracks.LIST.map((t) => [t.id, t]));
    calBtns = [];
    draft.trackIds.forEach((id, i) => {
      const t = byId.get(id);
      if (!t) return;
      const row = el("div", "season-upcoming-row");
      row.append(el("span", "sur-rnd", "R" + (i + 1)), el("span", "sur-name", t.name));
      // Each action returns the row the SAME circuit sits on after it — or,
      // after a remove, the neighbour that took its place — for the refocus.
      const ctl = [
        ["↑", "Move up", i > 0, () => { swap(i, i - 1); return i - 1; }],
        ["↓", "Move down", i < draft.trackIds.length - 1, () => { swap(i, i + 1); return i + 1; }],
        ["✕", "Remove", draft.trackIds.length > 1,
          () => { draft.trackIds.splice(i, 1); return Math.min(i, draft.trackIds.length - 1); }],
      ];
      const btns = [];
      ctl.forEach(([glyph, label, on, act], k) => {
        const b = el("button", "sel-chip", glyph);
        b.type = "button";
        b.disabled = !on;
        b.setAttribute("aria-label", label + " — " + t.name);
        b.onclick = () => { const row = act(); tick(); build(); focusCal(row, k); };
        row.appendChild(b);
        btns.push(b);
      });
      calBtns.push(btns);
      pane.appendChild(row);
    });
  }
  // The same control on the row's new position; at either end of the list
  // that control is disabled, so the nearest enabled sibling; a one-round
  // calendar has none, and APPLY (a static node) is the next thing to do.
  function focusCal(row, k) {
    const btns = calBtns[row] || [];
    const b = btns[k] && !btns[k].disabled ? btns[k] : btns.find((x) => !x.disabled);
    (b || $("ss-apply")).focus();
  }
  function swap(a, b) {
    const ids = draft.trackIds;
    const t = ids[a]; ids[a] = ids[b]; ids[b] = t;
  }

  function buildPool() {
    const pane = $("ss-pool");
    pane.textContent = "";

    pane.appendChild(head("PRESETS", "ss-presets-label"));
    const pre = el("div", "chip-row");
    pre.id = "ss-presets";
    pre.setAttribute("role", "group");
    pre.setAttribute("aria-labelledby", "ss-presets-label");
    for (const p of SeasonCal.PRESETS) {
      const b = el("button", "sel-chip", p.label);
      b.type = "button";
      b.onclick = () => { draft.trackIds = SeasonCal.presetIds(p.id); tick(); build(); };
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
      [[false, "OFF"], [true, "ON"]], draft.sprint, (v) => { draft.sprint = v; });
    // Units on the chips, and no "(FULL)": the race-settings sibling's FULL is
    // the CIRCUIT's own distance (Monaco 78, Spa 44 — game.js buildRaceSettings),
    // while this 57 is a flat 57 laps preselected at every round — clamped down
    // to a shorter circuit's full distance there, never raised to a longer one's.
    chipRow(pane, "RACE DISTANCE", "ss-laps",
      SeasonCal.LAP_OPTS.map((n) => [n, n + (n === 1 ? " LAP" : " LAPS")]),
      draft.laps, (v) => { draft.laps = v; });
    chipRow(pane, "POINTS", "ss-points",
      [["modern", "25-18-15…"], ["classic", "10-6-4…"]],
      draft.points, (v) => { draft.points = v; });

    // What the two format switches actually cost, in the numbers SeasonCal will
    // pay out — so the screen answers "how long is a sprint" and "what does a
    // sprint win earn" without the player having to run one to find out.
    // .sur-country is "small dim text" and nothing else — reused rather than
    // minting a class, which css-class-ratchet.test.mjs asks for by name.
    const note = el("div", "sur-country");
    note.id = "ss-note";
    note.textContent = draft.sprint
      ? "A sprint runs a third of the distance before the Grand Prix and pays "
        + SeasonCal.SPRINT_POINTS.join(" · ") + " pts. Both legs score."
      : "One race per round.";
    pane.appendChild(note);

    // The shelf. Every circuit NOT already on the calendar, classics included —
    // a retired circuit is perfectly racable, it is simply never a round of the
    // built-in championship (js/track/tracks.js).
    const used = new Set(draft.trackIds);
    const rest = Tracks.LIST.filter((t) => !used.has(t.id));
    pane.appendChild(head(rest.length ? "ADD A CIRCUIT" : "EVERY CIRCUIT IS ON THE CALENDAR"));
    for (const t of rest) {
      const row = el("button", "track-row");
      row.type = "button";
      row.setAttribute("aria-label", "Add " + t.name + " to the calendar");
      const nm = el("span", "track-row-name", t.name);
      if (t.classic) nm.appendChild(el("span", "trb trb-classic", "CLASSIC"));
      row.append(nm, el("span", "track-row-meta", t.country || ""));
      row.onclick = () => { draft.trackIds.push(t.id); tick(); build(); };
      pane.appendChild(row);
    }
  }

  function build() {
    if (!draft) return;
    buildCalendar();
    buildPool();
    const live = SeasonCal.hasProgress(G.season);
    // #ss-apply is a STATIC shell node — unlike the rebuilt-per-paint confirm
    // buttons, node replacement never disarms it, so an armed RESTART could
    // survive close/reopen and fire without its warning. Every path repaints
    // through build(), so this is the one true disarm point.
    const ab = $("ss-apply"); delete ab.dataset.armed; ab.classList.remove("armed");
    ab.textContent = live ? "APPLY — RESTART SEASON" : "APPLY";
    if (window.ScrollFade) ScrollFade.refresh();
  }

  function open() {
    // A COPY, and a fresh one every visit: BACK has to be able to discard.
    draft = Object.assign({}, SeasonCal.config());
    draft.trackIds = draft.trackIds.slice();
    build();
    $("season-setup").hidden = false;
    Log.info("ui", "SeasonUI.open");
    if (G.soundOn) GameAudio.uiSelect();
  }
  function close() {
    $("season-setup").hidden = true; draft = null;
    Log.info("ui", "SeasonUI.close");
  }

  function refreshTitle() {
    const btn = $("mb-season");
    if (!btn) return;
    let textNode = null;
    for (let i = 0; i < btn.childNodes.length; i++) {
      const n = btn.childNodes[i];
      if (n.nodeType === 3) { textNode = n; break; }
    }
    if (!textNode) return;
    const season = G.season;
    const n = SeasonCal.rounds();
    textNode.nodeValue = (SeasonCal.hasProgress(season) && n)
      ? ("SEASON · R" + Math.min((season.round || 0) + 1, n) + " OF " + n)
      : "SEASON";
  }

  $("ss-back").onclick = () => { close(); if (G.soundOn) GameAudio.uiSelect(); };
  $("ss-apply").onclick = () => {
    const apply = () => {
      Log.info("ui", "SeasonUI.apply");
      SeasonCal.setConfig(draft);
      G.season = SeasonCal.restart();
      G.store.set("season", G.season);
      G.trackIdx = SeasonCal.trackIndex(0);
      close();
      G.buildSelect();
      G.refreshCareerButton();
      if (G.soundOn) GameAudio.uiSelect();
    };
    // Mid-season, APPLY wipes the standings — up to 23 raced rounds — and the
    // label was the entire warning. Arm-then-confirm (the career DELETE?
    // idiom) only when there is progress to lose; a fresh config applies
    // directly. build() repaints the label, which is also the disarm.
    if (SeasonCal.hasProgress(G.season)) {
      if (G.soundOn) GameAudio.uiTick();
      G.armConfirm($("ss-apply"), "RESTART? — SEASON IS LOST", apply);
    } else apply();
  };

  return { open, close, build, refreshTitle };
}

return { create };
})();
