/* Apex 26 — the SEASON SETUP screen (#season-setup): the calendar the player
   races and the format they race it under. Opens over #select from the CUSTOMISE
   button js/game/menus.js draws in its season branch, and BACK returns there.

   Rules and persistence live in js/game/season-cal.js; this file is DOM only —
   the same split, and the same reason, as js/game/career.js / career-ui.js. Live
   game state comes through the ctx façade handed to SeasonUI.create(ctx) at boot
   (see the `G` object in game.js): els, $, store, season, trackIdx, buildSelect,
   soundOn. Consumes globals Tracks, SeasonCal, GameAudio, ScrollFade.

   EVERY FIGURE ON THIS SCREEN IS READ, NEVER TYPED. The points tables, the lap
   options and the presets all come off SeasonCal, so a tune there cannot leave a
   number on this screen that the race does not honour — the rule
   js/game/career-ui.js already follows for the career guide.

   NOTHING IS LIVE UNTIL APPLY. The screen edits a DRAFT copy of the config;
   BACK discards it. That matters because applying a calendar RESETS the
   championship, and a player poking at the format to see what is there has not
   asked to throw away eleven rounds of points.

   Must load BEFORE js/game.js (see index.html). */
const SeasonUI = (function () {
  "use strict";

function create(G) {
  Log.info("ui", "SeasonUI.create");
  const { $, els } = G;

  // The working copy. Null while the screen is closed — open() takes a fresh
  // one off SeasonCal every time, so a discarded edit cannot come back.
  let draft = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // Section heading, on the shared .sel-label the whole app uses (the dim
  // uppercase text with the skewed red tick), with an id so the chip group under
  // it can point aria-labelledby at it.
  function head(text, id) {
    const h = el("h3", "sel-label", text);
    if (id) h.id = id;
    return h;
  }
  function tick() { if (G.soundOn) GameAudio.uiTick(); }

  // A row of choices, in the #race-settings idiom: a labelled group of chips
  // whose `active` chip is the current value. `opts` is [value, label] pairs.
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

  // ---------- the calendar pane ----------
  function buildCalendar() {
    const pane = $("ss-cal");
    pane.textContent = "";
    pane.appendChild(head("CALENDAR — " + draft.trackIds.length
      + (draft.trackIds.length === 1 ? " ROUND" : " ROUNDS")));
    const byId = new Map(Tracks.LIST.map((t) => [t.id, t]));
    draft.trackIds.forEach((id, i) => {
      const t = byId.get(id);
      if (!t) return;
      const row = el("div", "season-upcoming-row");
      row.append(el("span", "sur-rnd", "R" + (i + 1)), el("span", "sur-name", t.name));
      // MOVE and REMOVE. Chips rather than a drag handle: this list is 24 rows
      // long on a 390 px-tall landscape phone, where a drag is a scroll.
      const ctl = [
        ["↑", "Move up", i > 0, () => { swap(i, i - 1); }],
        ["↓", "Move down", i < draft.trackIds.length - 1, () => { swap(i, i + 1); }],
        // The LAST round cannot be removed: a zero-round calendar is not a
        // season, and SeasonCal would silently hand back the full one anyway.
        ["✕", "Remove", draft.trackIds.length > 1, () => { draft.trackIds.splice(i, 1); }],
      ];
      for (const [glyph, label, on, act] of ctl) {
        const b = el("button", "sel-chip", glyph);
        b.type = "button";
        b.disabled = !on;
        b.setAttribute("aria-label", label + " — " + t.name);
        b.onclick = () => { act(); tick(); build(); };
        row.appendChild(b);
      }
      pane.appendChild(row);
    });
  }
  function swap(a, b) {
    const ids = draft.trackIds;
    const t = ids[a]; ids[a] = ids[b]; ids[b] = t;
  }

  // ---------- presets, format, and the circuits still on the shelf ----------
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
    chipRow(pane, "RACE DISTANCE", "ss-laps",
      SeasonCal.LAP_OPTS.map((n) => [n, n === 57 ? "57 (FULL)" : String(n)]),
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
        + SeasonCal.SPRINT_POINTS.join(" · ") + ". Both legs score."
      : "One race per round.";
    pane.appendChild(note);

    // The shelf. Every circuit NOT already on the calendar, classics included —
    // a retired circuit is perfectly racable, it is simply never a round of the
    // built-in championship (js/track/tracks.js).
    const used = new Set(draft.trackIds);
    const rest = Tracks.LIST.filter((t) => !used.has(t.id));
    pane.appendChild(head(rest.length ? "ADD A CIRCUIT" : "EVERY CIRCUIT IS ON THE CALENDAR"));
    for (const t of rest) {
      // .track-row, not .season-upcoming-row: this list is the same thing #select's
      // circuit picker is — a tappable row of name + meta — and that family is
      // already a complete <button> (the reset, the --tap floor, the hover and
      // press states). The calendar pane opposite is NOT tappable, which is why
      // it stays on .season-upcoming-row.
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
    // APPLY says what it will COST when a championship is already running, on the
    // button itself — a confirm dialog for this would be a second sheet over a
    // sheet, and the answer fits in the label.
    const live = SeasonCal.hasProgress(G.season);
    $("ss-apply").textContent = live ? "APPLY — RESTART SEASON" : "APPLY";
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
    Log.info("ui", "SeasonUI.apply");
    SeasonCal.setConfig(draft);
    // A NEW calendar is a NEW championship. Points scored over a schedule that
    // no longer exists cannot be carried into one that does — half of them may
    // have been won at circuits the season no longer visits — so the standings
    // reset with the calendar rather than being silently re-indexed.
    G.season = SeasonCal.restart();
    G.store.set("season", G.season);
    G.trackIdx = SeasonCal.trackIndex(0);
    close();
    G.buildSelect();
    G.refreshCareerButton();
    if (G.soundOn) GameAudio.uiSelect();
  };

  return { open, close, build, refreshTitle };
}

return { create };
})();
