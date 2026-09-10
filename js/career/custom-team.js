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
      getEls, getTeamIdx, setTeamIdx, setDriverIdx, buildSelect, buildSetup,
      isCarsetupVisible,
    } = hooks;

    let czFinish = "gloss";

    function loadCustomTeam() { return store.get("customTeam", DEFAULT_CUSTOM); }

    function syncCustomTeam() {
      const i = Teams.LIST.findIndex((t) => t.id === "custom");
      if (i >= 0) Teams.LIST.splice(i, 1);
      Teams.LIST.push(loadCustomTeam());
      invalidateDecalTextures("custom");
      invalidateCustomMeshCaches();
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
          c.width = w; c.height = h;
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
      $("cz-pvtext").textContent = "#" + ($("cz-num").value || "99") + " " + code + " · " + ($("cz-short").value || "YOU").toUpperCase();
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
        setTeamIdx(Teams.LIST.findIndex((t) => t.id === "custom"));
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
