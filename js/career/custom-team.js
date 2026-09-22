/* Apex 26 — MY TEAM: load/sync, customize dialog, emblem upload.
 * CustomTeam.create(hooks) — game.js passes mesh-cache invalidation and the
 * garage/select rebuild hooks; putBoundedMesh stays in game.js. */
"use strict";

const CustomTeam = (function () {

  const CZ_LIV_FIELDS = [
    ["cz-stripe", "stripe"], ["cz-nosestripe", "noseStripe"], ["cz-detail", "accent"],
    ["cz-nose", "nose"], ["cz-pod", "pod"], ["cz-wing", "wing"],
    ["cz-fin", "fin"], ["cz-finart", "finArt"], ["cz-logo", "logo"],
    ["cz-logo2", "logo2"], ["cz-logo3", "logo3"],
    ["cz-halo", "halo"],
  ];

  const CUSTOM_LOGO_KEY = "customLogo";
  const CUSTOM_LOGO_MAX = 384;

  function create(hooks) {
    const {
      $, store, Teams, DEFAULT_CUSTOM, hexToRgb, rgbToHex, hexToArr, clamp,
      invalidateDecalTextures, invalidateCustomMeshCaches, spMeshBust,
      getLivDraftOverride, setLivDraftOverride, getSoundOn, GameAudio,
      getEls, getTeamIdx, setTeamIdx, getDriverIdx, setDriverIdx, buildSelect, buildSetup,
      isCarsetupVisible,
    } = hooks;

    let czFinish = "gloss";

    // A STORED CUSTOM TEAM IS PLAYER INPUT. It rides in a garage file, which
    // js/ui/settings-export.js reads off disk, and syncCustomTeam() pushes
    // whatever comes back straight into Teams.LIST — where SaveMigrate's
    // seasonRoster() does `team.drivers.forEach(...)` at boot. `{}` in that key
    // was a TypeError before the menu painted. A wrong `id` is the quieter
    // half: the splice that removes the previous custom entry matches on
    // "custom", so every sync would push ANOTHER team onto the grid.
    // Repair rather than discard — the player's name and colours are not the
    // corrupt field, and losing them to a bad `drivers` array is its own bug.
    function loadCustomTeam() {
      const t = store.get("customTeam", DEFAULT_CUSTOM);
      if (!t || typeof t !== "object" || Array.isArray(t)) return DEFAULT_CUSTOM;
      const ok = Array.isArray(t.drivers) && t.drivers.length > 0
        && t.drivers.every((d) => d && typeof d === "object");
      if (ok && t.id === "custom") return t;
      return Object.assign({}, DEFAULT_CUSTOM, t,
        { id: "custom", drivers: ok ? t.drivers : DEFAULT_CUSTOM.drivers });
    }
    function customTeamIndex() { return Teams.LIST.findIndex((t) => t.id === "custom"); }

    function syncCustomTeam() {
      const i = customTeamIndex();
      if (i >= 0) Teams.LIST.splice(i, 1);
      Teams.LIST.push(loadCustomTeam());
      invalidateDecalTextures("custom");
      invalidateCustomMeshCaches();
      syncLegendsTeam();      // …and LEGENDS stays the entry after it
    }

    function legendsTeamIndex() { return Teams.LIST.findIndex((t) => t.id === "legends"); }

    /* THE LEGENDS TEAM — its own entry beside the custom one, so MY TEAM stays
     * the player's. Rebuilt in place rather than appended once, because a team
     * record carries colours, stats, tier and livery and every one of those is
     * per-legend: Fangio is a tier-0 silver car, Graham Hill a tier-3 gold one.
     *
     * `drivers` is the whole roster either way, so the select screen's ordinary
     * DRIVER picker is the legend picker and there is no second screen to build.
     * The team still grids ONE car (js/game.js seatsFor).
     *
     * `seat` is a roster INDEX — what the picker moves — not an id. It clamps
     * rather than throwing, because a saved pick outlives a roster edit. */
    function syncLegendsTeam(seat) {
      if (typeof Legends === "undefined" || !Legends.LIST.length) return;
      const n = Legends.LIST.length;
      const want = Math.min(Math.max((seat != null ? seat : legendSeat()) | 0, 0), n - 1);
      const t = Legends.team(Legends.LIST[want].id);
      if (!t) return;
      const i = legendsTeamIndex();
      // WHICH legend the slot held a moment ago, read BEFORE the splice: it is
      // what tells a genuine switch (Fangio -> Senna) apart from a re-sync of
      // the same seat, and only a switch may touch the player's sheet.
      const prev = i >= 0 && Teams.LIST[i] ? Teams.LIST[i].legend : null;
      if (i >= 0) Teams.LIST.splice(i, 1);
      Teams.LIST.push(t);
      seedLegendParts(Legends.LIST[want].id, prev);
      invalidateDecalTextures("legends");
      invalidateCustomMeshCaches();
    }

    /* THE PERIOD CAR HAS TO REACH THE GARAGE SHEET, not just the team record.
     * A team's `factory` build is what an AI car is rendered from, so a legend
     * DUEL RIVAL already arrives in the right machine. The player's own seat
     * reads `parts.legends` instead, and an empty sheet resolves to Parts
     * DEFAULTS — stock engine, medium aero, standard suspension — so picking
     * Fangio in the garage handed you a 2026 chassis in Silver Arrow paint
     * while duelling him produced the 1954 car. Same legend, two machines,
     * depending on which side of the grid you stood on.
     *
     * WHEN IT WRITES, and the reason each case is separate. Twelve legends
     * share the one `legends` id, so there is one sheet between them:
     *   - sheet EMPTY: seed it. Nothing of the player's is at stake.
     *   - a real SWITCH (prev is a different legend): reseed. You asked for
     *     Senna, you get the MP4/4, not Fangio's build wearing Senna's paint.
     *   - anything else — boot, a re-sync, the same seat again — leave it, or
     *     every reload would wipe a build the player spent credits on.
     * The cost of the middle case is that tuning does not survive switching
     * legend, which is the honest trade for one shared slot: the alternative
     * is a sheet that silently belongs to whoever you picked first. */
    function seedLegendParts(id, prev) {
      if (!Legends.parts) return;
      const period = Legends.parts(id);
      if (!period) return;
      const cur = store.get("parts.legends", null);
      const empty = !cur || !Object.keys(cur).length;
      if (!empty && (prev == null || prev === id)) return;
      store.set("parts.legends", period);
    }

    // Which legend the team is fielding: driverIdx when Legends is the selected
    // team, otherwise whatever it was last built with — so browsing other teams
    // does not silently repaint the Legends car.
    function legendSeat() {
      const i = legendsTeamIndex();
      if (i >= 0 && getTeamIdx() === i) return getDriverIdx ? getDriverIdx() : 0;
      const cur = i >= 0 ? Teams.LIST[i] : null;
      const was = cur && typeof Legends !== "undefined" ? Legends.seatOf(cur.legend) : -1;
      return was >= 0 ? was : 0;
    }

    function loadCustomLogo() { try { return store.get(CUSTOM_LOGO_KEY, null); } catch (_) { return null; } }

    function applyCustomLogo(dataUrl) {
      if (typeof LiveryTex === "undefined" || !LiveryTex.setTeamLogo) return;
      LiveryTex.setTeamLogo("custom", dataUrl || null);
    }

    function readLogoFile(file, done) {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const sc = Math.min(1, CUSTOM_LOGO_MAX / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * sc));
          const h = Math.max(1, Math.round(img.height * sc));
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          try { done(c.toDataURL("image/png")); } catch (_) { done(null); }
        };
        img.onerror = () => done(null);
        img.src = fr.result;
      };
      fr.onerror = () => done(null);
      fr.readAsDataURL(file);
    }

    function czSyncMarkRows() {
      const slots = (typeof LiveryTex !== "undefined" && LiveryTex.markSlots)
        ? LiveryTex.markSlots("custom") : null;
      if (!slots) return;
      const shown = new Map(slots.map((s) => [s.key, s.label]));
      for (const [domId, key] of CZ_LIV_FIELDS) {
        if (key !== "logo" && key !== "logo2" && key !== "logo3") continue;
        const input = $(domId), row = input && input.closest(".cz-row");
        if (!row) continue;
        row.hidden = !shown.has(key);
        const label = row.querySelector("label");
        if (label && shown.has(key)) label.textContent = shown.get(key);
      }
      const box = $("cz-logo2"), out = $("cz-logo3"), none = $("cz-logo3-none");
      if (box && out && !shown.has("logo2") && !box.classList.contains("cz-off") &&
          out.classList.contains("cz-off")) {
        out.value = box.value;
        out.classList.remove("cz-off");
        if (none) none.classList.remove("active");
      }
    }

    function refreshCustomLogoUi(dataUrl) {
      const prev = $("cz-logo-prev");
      if (!prev) return;
      prev.hidden = !dataUrl;
      if (dataUrl) prev.src = dataUrl;
      czSyncMarkRows();
    }

    function czSetFinish(value) {
      czFinish = value || "gloss";
      for (const btn of document.querySelectorAll("#cz-finish [data-cz-finish]")) {
        btn.classList.toggle("active", btn.dataset.czFinish === czFinish);
      }
    }

    function czSetLivField(domId, arr) {
      const inp = $(domId), none = $(domId + "-none");
      if (arr) { inp.value = rgbToHex(arr); inp.classList.remove("cz-off"); none.classList.remove("active"); }
      else {
        inp.value = inp.value && /^#[0-9a-fA-F]{6}$/.test(inp.value) ? inp.value : "#ffffff";
        inp.classList.add("cz-off");
        none.classList.add("active");
      }
    }

    function czLivFromDialog() {
      const prev = loadCustomTeam();
      const liv = Object.assign({}, DEFAULT_CUSTOM.livery || {}, (prev && prev.livery) || {});
      for (const [, key] of CZ_LIV_FIELDS) delete liv[key];
      delete liv.finish;
      CZ_LIV_FIELDS.forEach(([domId, key]) => {
        if (!$(domId).classList.contains("cz-off")) liv[key] = hexToRgb($(domId).value);
      });
      if (czFinish && czFinish !== "gloss") liv.finish = czFinish;
      return liv;
    }

    function czPreview() {
      $("cz-swatch1").style.background = $("cz-color").value;
      $("cz-swatch2").style.background = $("cz-color2").value;
      const code = ($("cz-code").value || "YOU").toUpperCase();
      const short = ($("cz-short").value || "YOU").toUpperCase();
      $("cz-pvtext").textContent = `#${$("cz-num").value || "99"} ${code} · ${short}`;
      $("cz-pvtext").style.color = $("cz-color").value;
      const liv = Object.assign(
        { id: "default", c1: hexToArr($("cz-color").value), c2: hexToArr($("cz-color2").value) },
        czLivFromDialog());
      setLivDraftOverride({ teamId: "custom", liv });
      spMeshBust();
    }

    function czClearPreview() { setLivDraftOverride(null); spMeshBust(); }

    function openCustomize() {
      const ct = loadCustomTeam();
      $("cz-name").value = ct.name;
      $("cz-short").value = ct.short;
      $("cz-color").value = rgbToHex(ct.color);
      $("cz-color2").value = rgbToHex(ct.color2);
      $("cz-driver").value = ct.drivers[0].name;
      $("cz-code").value = ct.drivers[0].code;
      $("cz-num").value = ct.drivers[0].num;
      const liv = ct.livery || {};
      CZ_LIV_FIELDS.forEach(([domId, key]) => czSetLivField(domId, liv[key] || null));
      czSetFinish(liv.finish);
      refreshCustomLogoUi(loadCustomLogo());
      czPreview();
      getEls().customize.hidden = false;
    }

    function wireDialog() {
      ["cz-name", "cz-short", "cz-color", "cz-color2", "cz-code", "cz-num"].forEach((id) => {
        $(id).addEventListener("input", czPreview);
      });
      CZ_LIV_FIELDS.forEach(([domId]) => {
        $(domId).addEventListener("input", () => {
          $(domId).classList.remove("cz-off");
          $(domId + "-none").classList.remove("active");
          czPreview();
        });
        $(domId + "-none").onclick = () => {
          $(domId).classList.add("cz-off");
          $(domId + "-none").classList.add("active");
          czPreview();
          if (getSoundOn()) GameAudio.uiTick();
        };
      });
      for (const btn of document.querySelectorAll("#cz-finish [data-cz-finish]")) {
        btn.onclick = () => { czSetFinish(btn.dataset.czFinish); czPreview(); if (getSoundOn()) GameAudio.uiTick(); };
      }
      $("cz-cancel").onclick = () => { czClearPreview(); getEls().customize.hidden = true; };
      $("cz-save").onclick = () => {
        const clean = (v, fb, n) => { v = (v || "").trim(); return v ? v.slice(0, n) : fb; };
        const prev = loadCustomTeam();
        const ct = {
          id: "custom", engine: "Custom", tier: 2, custom: true,
          name: clean($("cz-name").value, "My Team", 22),
          short: clean($("cz-short").value, "YOU", 4).toUpperCase(),
          color: hexToRgb($("cz-color").value),
          color2: hexToRgb($("cz-color2").value),
          stats: prev.stats || DEFAULT_CUSTOM.stats,
          drivers: [{
            name: clean($("cz-driver").value, "Your Name", 22),
            code: clean($("cz-code").value, "YOU", 3).toUpperCase(),
            num: clamp(parseInt($("cz-num").value, 10) || 99, 0, 99),
          }],
        };
        ct.livery = czLivFromDialog();
        store.set("customTeam", ct);
        syncCustomTeam();
        setTeamIdx(customTeamIndex());
        setDriverIdx(0);
        store.set("team", getTeamIdx());
        store.set("driver", 0);
        getEls().customize.hidden = true;
        czClearPreview();
        buildSelect();
        if (isCarsetupVisible()) buildSetup();
        if (getSoundOn()) GameAudio.uiSelect();
      };
      $("cz-logofile").addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        readLogoFile(f, (dataUrl) => {
          if (!dataUrl) return;
          try { store.set(CUSTOM_LOGO_KEY, dataUrl); } catch (_) {}
          applyCustomLogo(dataUrl);
          refreshCustomLogoUi(dataUrl);
          invalidateDecalTextures("custom");
          spMeshBust();
          if (getSoundOn()) GameAudio.uiSelect();
        });
        e.target.value = "";
      });
      $("cz-logo-clear").onclick = () => {
        try { store.set(CUSTOM_LOGO_KEY, null); } catch (_) {}
        applyCustomLogo(null);
        refreshCustomLogoUi(null);
        invalidateDecalTextures("custom");
        spMeshBust();
        if (getSoundOn()) GameAudio.uiTick();
      };
    }

    function wireStoreSubscribe() {
      if (!store.subscribe) return;
      store.subscribe((change) => {
        if (!change || !change.foreign) return;
        if (change.clear || change.key === "customTeam") {
          syncCustomTeam();
          try { spMeshBust(); } catch (_) { /* garage scene may not be up yet */ }
        }
        if (change.clear || change.key === "customLogo") {
          const url = change.clear ? null : loadCustomLogo();
          applyCustomLogo(url);
          try { invalidateDecalTextures("custom"); } catch (_) { /* decal cache later */ }
          try { spMeshBust(); } catch (_) { /* garage scene may not be up yet */ }
          try { refreshCustomLogoUi(url); } catch (_) { /* customize DOM later */ }
        }
      });
    }

    function wireLiveryTexMarkChange() {
      if (typeof LiveryTex === "undefined" || !LiveryTex.onMarkChange) return;
      LiveryTex.onMarkChange(() => {
        invalidateDecalTextures("custom");
        spMeshBust();
        czSyncMarkRows();
      });
      applyCustomLogo(loadCustomLogo());
    }

    function init() {
      wireDialog();
      wireStoreSubscribe();
      wireLiveryTexMarkChange();
    }

    return {
      init,
      loadCustomTeam,
      syncCustomTeam,
      syncLegendsTeam,
      legendsTeamIndex,
      openCustomize,
      czLivFromDialog,
      refreshCustomLogoUi,
      loadCustomLogo,
      applyCustomLogo,
      CZ_LIV_FIELDS,
    };
  }

  return { create };
})();
Object.freeze(CustomTeam);
