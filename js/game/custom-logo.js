"use strict";
/* Apex 26 — MY TEAM custom emblem.
   CustomLogo.create(G). Extracted from game.js: data-URL store, downscale,
   customize-screen file/clear wiring. G already owned store / $ / soundOn /
   invalidateDecalTextures / _spMeshKey. Boot apply stays one call (boot()).

   Must load BEFORE js/game.js (see index.html / tools/manifest.cjs). */
const CustomLogo = (() => {
  function create(G) {
    Log.info("ui", "CustomLogo.create");
    const { $, store } = G;

    // MY TEAM's own emblem. Stored as a downscaled data URL under apex26.customLogo
    // so it survives a reload without touching the asset pipeline — LiveryTex takes
    // it through exactly the same slot as the shipped marks.
    const CUSTOM_LOGO_KEY = "customLogo";
    const CUSTOM_LOGO_MAX = 384;      // matches the shipped marks
    function load() {
      try { return store.get(CUSTOM_LOGO_KEY, null); } catch (_) { return null; }
    }
    function apply(dataUrl) {
      if (typeof LiveryTex === "undefined" || !LiveryTex.setTeamLogo) return;
      LiveryTex.setTeamLogo("custom", dataUrl || null);
    }
    // Downscale to at most CUSTOM_LOGO_MAX on the long edge before storing: a phone
    // photo is several MB and localStorage would simply throw.
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
    function refresh(dataUrl) {
      const prev = $("cz-logo-prev");
      if (!prev) return;
      prev.hidden = !dataUrl;
      if (dataUrl) prev.src = dataUrl;
    }
    function boot() { apply(load()); }

    $("cz-logofile").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      readLogoFile(f, (dataUrl) => {
        if (!dataUrl) return;
        // Private Browsing / quota-0: write throws; keep the in-session emblem.
        try { store.set(CUSTOM_LOGO_KEY, dataUrl); } catch (_) {}
        apply(dataUrl);
        refresh(dataUrl);
        G.invalidateDecalTextures("custom");
        G._spMeshKey = "";
        if (G.soundOn) GameAudio.uiSelect();
      });
      e.target.value = "";       // let the same file be re-picked after a CLEAR
    });
    $("cz-logo-clear").onclick = () => {
      // Same quota path as the write: CLEAR is best-effort persistence.
      try { store.set(CUSTOM_LOGO_KEY, null); } catch (_) {}
      apply(null);
      refresh(null);
      G.invalidateDecalTextures("custom");
      G._spMeshKey = "";
      if (G.soundOn) GameAudio.uiTick();
    };

    return { load, apply, refresh, boot };
  }
  return { create };
})();
