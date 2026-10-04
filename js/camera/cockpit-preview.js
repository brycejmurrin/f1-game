/* Apex 26 — isolated cockpit option preview. A dedicated GLX context draws
   the shipped meshes on demand; opening it never touches the race or camera.
   iframe lifecycle: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe */
const CockpitPreview = (function () {
  "use strict";
  const ANGLES = ["front", "side", "rear", "wheel", "above"];
  let readCar = null;
  function bind(read) { readCar = read; }
  function snapshot(angle) {
    const team = Teams.LIST[GameStore.store.get("team", 2)] || Teams.LIST[2];
    const car = readCar ? readCar() : { teamId: team.id, livery: Liveries.forTeam(team)[0],
      units: typeof AppearanceOpts !== "undefined" ? AppearanceOpts.units() : "kmh" };
    return Object.assign({}, car, { angle, body: CockpitOpts.body(), interior: CockpitOpts.interior(),
      wheel: CockpitOpts.wheel(), seat: CockpitOpts.seat(), halo: CockpitOpts.haloSize(),
      layout: CockpitOpts.layout() });
  }
  function mount(host) {
    if (host.querySelector("#ckpreview")) return null;
    const doc = host.ownerDocument;
    const section = doc.createElement("section");
    section.id = "ckpreview";
    const toggle = doc.createElement("button");
    toggle.type = "button"; toggle.id = "pm-ckpreview"; toggle.textContent = "PREVIEW COCKPIT";
    toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", "ckpreview-view");
    const view = doc.createElement("div"); view.id = "ckpreview-view"; view.hidden = true;
    const toolbar = doc.createElement("div"); toolbar.id = "ckpreview-angles";
    toolbar.setAttribute("role", "group"); toolbar.setAttribute("aria-label", "Cockpit preview angle");
    const status = doc.createElement("p"); status.className = "adv-help"; status.setAttribute("aria-live", "polite");
    let iframe = null, angle = "front", generation = 0;
    const buttons = [];
    function update() {
      if (!iframe) return;
      const state = snapshot(angle);
      status.textContent = "Stationary preview · " + CockpitOpts.CHOICES.body.labels[state.body] + " · " +
        CockpitOpts.CHOICES.interior.labels[state.interior] + " · " + CockpitOpts.CHOICES.wheel.labels[state.wheel];
      for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.angle === angle));
      try { if (iframe.contentWindow.CockpitPreviewFrame) iframe.contentWindow.CockpitPreviewFrame.set(state); }
      catch (e) { status.textContent = "Preview unavailable. Your cockpit choices are saved."; Log.warn("game", "cockpit preview", e); }
    }
    function close(focus = false) {
      generation++;
      if (iframe) {
        try { if (iframe.contentWindow.CockpitPreviewFrame) iframe.contentWindow.CockpitPreviewFrame.dispose(); }
        catch (_) { /* an interrupted frame load has no context to release */ }
        iframe.remove();
      }
      iframe = null; view.hidden = true;
      toggle.setAttribute("aria-expanded", "false"); toggle.textContent = "PREVIEW COCKPIT";
      if (focus) toggle.focus();
    }
    function open() {
      if (iframe) return;
      const own = ++generation;
      iframe = doc.createElement("iframe"); iframe.title = "3D cockpit preview";
      iframe.id = "ckpreview-frame";
      iframe.src = "cockpit-view.html?cockpitpreview=1";
      iframe.onload = () => {
        if (own !== generation) return;
        if (iframe.contentWindow.CockpitPreviewFrame) iframe.contentWindow.CockpitPreviewFrame.onClose = () => close(true);
        update();
        if (!iframe.contentWindow.CockpitPreviewFrame) status.textContent = "Preview unavailable. Your cockpit choices are saved.";
      };
      view.insertBefore(iframe, toolbar); view.hidden = false;
      toggle.setAttribute("aria-expanded", "true"); toggle.textContent = "CLOSE PREVIEW";
      update();
    }
    for (const id of ANGLES) {
      const b = doc.createElement("button"); b.type = "button"; b.dataset.angle = id;
      b.textContent = id === "above" ? "ABOVE" : id.toUpperCase();
      b.onclick = () => { angle = id; update(); }; buttons.push(b); toolbar.appendChild(b);
    }
    toggle.onclick = () => iframe ? close(true) : open();
    doc.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !iframe) return;
      close(true); e.preventDefault(); e.stopImmediatePropagation();
    }, true);
    // Leaving SETTINGS or collapsing COCKPIT discards the entire graphics context.
    const observer = new MutationObserver(() => {
      for (let el = section.parentElement; el; el = el.parentElement) {
        if (el.hidden || (el.tagName === "DETAILS" && !el.open)) { close(); break; }
      }
    });
    for (let el = host; el; el = el.parentElement) observer.observe(el, { attributes: true, attributeFilter: ["hidden", "open"] });
    CockpitOpts.onWheel(update);
    section.appendChild(toggle); view.appendChild(toolbar); view.appendChild(status); section.appendChild(view); host.appendChild(section);
    return { open, close, update };
  }

  function initFrame() {
    const canvas = document.getElementById("view");
    document.getElementById("hud").hidden = true; document.getElementById("tip").hidden = true;
    if (!GLX.init(canvas)) { document.getElementById("err").style.display = "grid"; document.getElementById("err").textContent = "3D preview requires WebGL2"; return; }
    CarMesh.init(GLX);
    const base = new Float32Array([-1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
    const view = new Float32Array(16), proj = new Float32Array(16), vp = new Float32Array(16);
    const rig = M4.ident(), worldRig = new Float32Array(16), digit = M4.ident(), worldDigit = new Float32Array(16);
    const wheel = M4.ident(), worldWheel = new Float32Array(16);
    const paint = { doubleSided: true, roughness: .55, specular: .3 }, fx = { doubleSided: true, emissive: 1, specular: 0 };
    let state = null, body = null, tyres = [], bodyKey = null, disposed = false;
    window.AppearanceOpts = { units: () => state && state.units || "kmh", speed: (v) => Math.round(state && state.units === "mph" ? v * .621371 : v) };
    function draw() {
      if (!state || disposed) return;
      GLX.resize(); const s = state, lay = s.layout;
      const key = JSON.stringify([s.body,s.halo,s.teamId,s.livery,s.parts]);
      if (key !== bodyKey) {
        if (body) GLX.freeMesh(body);
        for (const mesh of tyres) GLX.freeMesh(mesh);
        body = GLX.createMesh(Car3D.build(s.livery.c1,s.livery.c2,{ cockpit:true,noDriver:true,noWheels:true,
          cockpitBody:s.body,halo:s.halo,teamId:s.teamId,livery:s.livery,parts:s.parts })); bodyKey = key;
        const p=s.parts || {}, visual=p._visual || {}, tyre=visual.tyres, brake=visual.brakes;
        const layers=Car3D.buildWheelLayers(.32,tyre && tyre.band || Car3D.TYRE_BAND[p.tyres || 1],
          brake ? brake.cal : Car3D.BRAKE_CALIPER[p.brakes || 1],brake && brake.rim,false,tyre,brake,visual.wheels);
        tyres=[GLX.createMesh(layers.rotating),GLX.createMesh(layers.fixed)];
      }
      const eye = [0,lay.eyeU,lay.eyeF], target = [0,lay.eyeU-.055,lay.eyeF+1];
      if (s.angle === "side") { target[0] = 1; target[2] = lay.eyeF+.12; target[1] = lay.eyeU-.16; }
      if (s.angle === "rear") { target[2] = lay.eyeF-1; target[1] = lay.eyeU-.12; }
      if (s.angle === "wheel") { target[1] = lay.wheelY; target[2] = lay.wheelZ; }
      if (s.angle === "above") { eye[0] = 1.15; eye[1] = 1.75; eye[2] = -1.6; target[1] = .5; target[2] = -.15; }
      M4.lookAtTo(view,eye,target,[0,1,0]); M4.perspectiveTo(proj,(s.angle === "wheel" ? 48 : 72)*Math.PI/180,GLX.aspect,.04,40); M4.mulTo(vp,proj,view);
      GLX.begin({viewProj:vp,view,proj,eye,sunDir:[.3,.88,.47],sunColor:[1.05,1.02,.96],
        ambientSky:[.3,.33,.38],ambientGround:[.20,.19,.18],fogColor:[.09,.10,.12],fogDensity:0,noEnv:true});
      GLX.draw(body,base,paint); GLX.draw(CarMesh.getCockpitCabin(s.interior,s.livery),base,paint);
      // Same cosmetic front-wheel offset/width as CarDraw.drawCockpitRig.
      wheel[0]=1.4;wheel[13]=.34;wheel[14]=2;
      for (const side of [-1,1]) {
        wheel[12]=side*(.79+.4*.16);M4.mulTo(worldWheel,base,wheel);
        for (const mesh of tyres) GLX.draw(mesh,worldWheel,paint);
      }
      if (s.interior === "classic") GLX.draw(CarMesh.getCockpitGlass(s.interior),base,{doubleSided:true,alpha:.25});
      rig[0]=rig[5]=rig[10]=lay.wheelS; rig[13]=lay.wheelY; rig[14]=lay.wheelZ; M4.mulTo(worldRig,base,rig);
      GLX.draw(s.wheel === "none" ? CarMesh.getCockpitDash() : CarMesh.getCockpitWheel(s.livery,s.wheel),worldRig,paint);
      if (s.wheel !== "none") CarMesh.drawForearms(worldRig,base,lay,s.livery,paint);
      const c = {gear:1,speed:0,energy:1,rpm:PhysicsConsts.IDLE_RPM};
      if (s.wheel === "retro") CarMesh.drawRetroTelemetry(worldRig,c,0,0);
      else if (s.wheel !== "round" && s.wheel !== "none") {
        GLX.draw(CarMesh.getGearDigit(1),worldRig,fx); GLX.draw(CarMesh.getLedStrip(0,s.wheel),worldRig,fx); CarMesh.drawWheelExtras(worldRig,c,0);
        digit[12]=-.034;digit[13]=.022;digit[14]=-.0335;M4.mulTo(worldDigit,worldRig,digit); GLX.draw(CarMesh.getSpeedDigit(0),worldDigit,fx);
        digit[12]=.048;digit[13]=.001;digit[14]=-.0315;M4.mulTo(worldDigit,worldRig,digit); GLX.draw(CarMesh.getErsBar(),worldDigit,fx);
      }
      if (typeof CarMesh.drawClassicTelemetry === "function" && s.interior === "classic") CarMesh.drawClassicTelemetry(base,c,0,paint);
      // The inspection host is on demand, so arm the software blit this frame.
      if (GLX.invalidateSoftPresent) GLX.invalidateSoftPresent();
      GLX.present({exposure:1});
    }
    window.CockpitPreviewFrame = {
      set(s) { state=s; draw(); }, info() { return state; },
      dispose() {
        disposed = true; window.removeEventListener("resize",draw);
        window.CockpitPreviewFrame.onClose = null;
        if (body) GLX.freeMesh(body); body = null;
        for (const mesh of tyres) GLX.freeMesh(mesh); tyres=[];
        const context = canvas.getContext("webgl2");
        const release = context && context.getExtension("WEBGL_lose_context");
        if (release) release.loseContext();
      },
    };
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && window.CockpitPreviewFrame.onClose) {
        event.preventDefault(); window.CockpitPreviewFrame.onClose();
      }
    });
    canvas.addEventListener("webglcontextlost", () => {
      if (disposed) return;
      disposed = true; const error = document.getElementById("err");
      error.style.display = "grid"; error.textContent = "Preview interrupted. Close and reopen to reload. Your choices are saved.";
    });
    window.addEventListener("resize",draw);
  }
  if (typeof document !== "undefined" && /[?&]cockpitpreview=1(?:&|$)/.test(location.search)) {
    document.addEventListener("DOMContentLoaded",initFrame,{once:true});
  }
  return { bind, mount, snapshot, ANGLES };
})();
Object.freeze(CockpitPreview);
