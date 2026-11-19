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
      isCarsetupVisible, announce,
    } = hooks;

    let logoGeneration = 0;
    let czFinish = "gloss";
    let czPreviewKey = "";

    function identityGet(key, fallback) { return typeof Career !== "undefined" && Career.identityValue ? Career.identityValue(key, fallback) : fallback; }
    function identitySet(key, value) {
      if (typeof Career !== "undefined" && Career.inCareer() && Career.data().flavour === "myteam" && Career.setIdentityValue) return Career.setIdentityValue(key, value);
      store.set(key, value);
      return true;
    }
    function keptIdentity(key, value) {
      let kept = false;
      try { kept = identitySet(key, value) !== false; } catch (_) {}
      if (!kept && announce) announce("TEAM NOT SAVED", 3, "info");
      return kept;
    }
    function loadCustomTeam() {
      return Teams.sanitizeCustom(identityGet("customTeam", store.get("customTeam", DEFAULT_CUSTOM)));
    }
    function customTeamIndex() { return Teams.LIST.findIndex((t) => t.id === "custom"); }

    function syncCustomTeam() {
      const keep = legendsTeamIndex() >= 0 ? legendSeat() : undefined;
      const i = customTeamIndex();
      if (i >= 0) Teams.LIST.splice(i, 1);
      Teams.LIST.push(loadCustomTeam());
      invalidateDecalTextures("custom");
      invalidateCustomMeshCaches();
      syncLegendsTeam(keep);
    }

    function legendsTeamIndex() { return Teams.LIST.findIndex((t) => t.id === "legends"); }

    function syncLegendsTeam(seat) {
      if (typeof Legends === "undefined" || !Legends.LIST.length) return;
      const n = Legends.LIST.length;
      const want = Math.min(Math.max((seat != null ? seat : legendSeat()) | 0, 0), n - 1);
      const t = Legends.team(Legends.LIST[want].id);
      if (!t) return;
      const i = legendsTeamIndex();
      const prev = i >= 0 && Teams.LIST[i] ? Teams.LIST[i].legend : null;
      if (i >= 0) Teams.LIST.splice(i, 1);
      Teams.LIST.push(t);
      seedLegendParts(Legends.LIST[want].id, prev);
      invalidateDecalTextures("legends");
      invalidateCustomMeshCaches();
    }

    function seedLegendParts(id, prev) {
      if (!Legends.parts) return;
      const period = Legends.parts(id);
      if (!period) return;
      const cur = store.getStored("parts.legends");
      const empty = !cur || !Object.keys(cur).length;
      if (!empty && (prev == null || prev === id)) return;
      store.set("parts.legends", period);
    }

    function legendSeat() {
      const i = legendsTeamIndex();
      if (getTeamIdx() === (i >= 0 ? i : Teams.LIST.length)) return getDriverIdx ? getDriverIdx() : 0;
      const cur = i >= 0 ? Teams.LIST[i] : null;
      const was = cur && typeof Legends !== "undefined" ? Legends.seatOf(cur.legend) : -1;
      return was >= 0 ? was : 0;
    }

    function loadCustomLogo() { try { return identityGet(CUSTOM_LOGO_KEY, store.get(CUSTOM_LOGO_KEY, null)); } catch (_) { return null; } }

    function applyCustomLogo(dataUrl) {
      if (typeof LiveryTex === "undefined" || !LiveryTex.setTeamLogo) return;
      LiveryTex.setTeamLogo("custom", dataUrl || null);
    }

    function readLogoFile(file, done, current) {
      const fr = new FileReader();
      fr.onload = () => {
        if (!current()) return;
        const img = new Image();
        img.onload = () => {
          if (!current()) return;
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

    let czPreviewTimer = null;
    function czPreview3d() {
      czPreviewTimer = null;
      const liv = Object.assign(
        { id: "default", c1: hexToArr($("cz-color").value), c2: hexToArr($("cz-color2").value) },
        czLivFromDialog());
      setLivDraftOverride({ teamId: "custom", liv });
      const key = JSON.stringify(liv);
      if (key !== czPreviewKey) { czPreviewKey = key; invalidateDecalTextures("custom"); spMeshBust(); }
    }
    function czPreview(flush) {
      $("cz-swatch1").style.background = $("cz-color").value;
      $("cz-swatch2").style.background = $("cz-color2").value;
      const code = ($("cz-code").value || "YOU").toUpperCase();
      const short = ($("cz-short").value || "YOU").toUpperCase();
      $("cz-pvtext").textContent = `#${$("cz-num").value || "99"} ${code} · ${short}`;
      $("cz-pvtext").style.color = $("cz-color").value;
      if (czPreviewTimer != null) { clearTimeout(czPreviewTimer); czPreviewTimer = null; }
      if (flush === true) czPreview3d();
      else czPreviewTimer = setTimeout(czPreview3d, 75);
    }

    function czClearPreview() {
      if (czPreviewTimer != null) { clearTimeout(czPreviewTimer); czPreviewTimer = null; }
      setLivDraftOverride(null);
      czPreviewKey = "";
      invalidateDecalTextures("custom");
      spMeshBust();
    }

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
      czPreview(true);
      getEls().customize.hidden = false;
    }

    function wireDialog() {
      ["cz-name", "cz-short", "cz-color", "cz-color2", "cz-code", "cz-num"].forEach((id) => {
        const el = $(id);
        el.addEventListener("input", () => czPreview());
        el.addEventListener("change", () => czPreview(true));
      });
      CZ_LIV_FIELDS.forEach(([domId]) => {
        const el = $(domId);
        el.addEventListener("change", () => czPreview(true));
        el.addEventListener("input", () => {
          el.classList.remove("cz-off");
          $(domId + "-none").classList.remove("active");
          czPreview();
        });
        $(domId + "-none").onclick = () => {
          $(domId).classList.add("cz-off");
          $(domId + "-none").classList.add("active");
          czPreview(true);
          if (getSoundOn()) GameAudio.uiTick();
        };
      });
      for (const btn of document.querySelectorAll("#cz-finish [data-cz-finish]")) {
        btn.onclick = () => { czSetFinish(btn.dataset.czFinish); czPreview(true); if (getSoundOn()) GameAudio.uiTick(); };
      }
      $("cz-cancel").onclick = () => { czClearPreview(); getEls().customize.hidden = true; };
      $("cz-save").onclick = () => {
        const clean = (v, fb, n, upper) => {
          v = (v || "").trim(); if (upper) v = v.toUpperCase();
          return Array.from(v).slice(0, n).join("").trim() || fb;
        };
        const prev = loadCustomTeam();
        const ct = {
          ...prev, id: "custom", custom: true,
          name: clean($("cz-name").value, "My Team", 22),
          short: clean($("cz-short").value, "YOU", 4, true),
          color: hexToRgb($("cz-color").value),
          color2: hexToRgb($("cz-color2").value),
          stats: prev.stats || DEFAULT_CUSTOM.stats,
          drivers: [{
            name: clean($("cz-driver").value, "Your Name", 22),
            code: clean($("cz-code").value, "YOU", 3, true),
            num: clamp(Number.isFinite(parseInt($("cz-num").value, 10)) ? parseInt($("cz-num").value, 10) : 99, 0, 99),
          }, ...(Array.isArray(prev.drivers) ? prev.drivers.slice(1) : [])],
        };
        ct.livery = czLivFromDialog();
        if (!keptIdentity("customTeam", ct)) return;
        syncCustomTeam();
        if (!(typeof Career !== "undefined" && Career.inCareer && Career.inCareer())) {
          setTeamIdx(customTeamIndex());
          setDriverIdx(0);
          store.set("team", getTeamIdx());
          store.set("driver", 0);
        }
        getEls().customize.hidden = true;
        czClearPreview();
        buildSelect();
        if (isCarsetupVisible()) buildSetup();
        if (getSoundOn()) GameAudio.uiSelect();
      };
      $("cz-logo-up").onclick = () => $("cz-logofile").click();
      $("cz-logofile").addEventListener("change", (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        const generation = ++logoGeneration;
        const current = () => generation === logoGeneration;
        readLogoFile(f, (dataUrl) => {
          if (!current() || !dataUrl) return;
          if (!keptIdentity(CUSTOM_LOGO_KEY, dataUrl)) return;
          applyCustomLogo(dataUrl);
          refreshCustomLogoUi(dataUrl);
          invalidateDecalTextures("custom");
          spMeshBust();
          if (getSoundOn()) GameAudio.uiSelect();
        }, current);
        e.target.value = "";
      });
      $("cz-logo-clear").onclick = () => {
        ++logoGeneration;
        if (!keptIdentity(CUSTOM_LOGO_KEY, null)) return;
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
          try { spMeshBust(); } catch (_) {  }
        }
        if (change.clear || change.key === "customLogo") {
          ++logoGeneration;
          const url = change.clear ? null : loadCustomLogo();
          applyCustomLogo(url);
          try { invalidateDecalTextures("custom"); } catch (_) {  }
          try { spMeshBust(); } catch (_) {  }
          try { refreshCustomLogoUi(url); } catch (_) {  }
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
      if (typeof Career !== "undefined" && Career.onIdentityChange) Career.onIdentityChange(() => {
        ++logoGeneration; syncCustomTeam(); applyCustomLogo(loadCustomLogo()); refreshCustomLogoUi(loadCustomLogo()); spMeshBust();
      });
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
