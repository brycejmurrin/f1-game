const LiveRegion = (function () {
  "use strict";

  const PRIO = Object.freeze({ flag: 5, penalty: 4, save: 3, radio: 2, hud: 1 });
  const BEAT_MS = 60;
  const HOLD_MS = 1200;
  const MAX_Q = 4;
  const STALE_MS = { hud: 4000, radio: 10000 };

  let el = null, phase = "idle", current = null, timer = 0, seq = 0;
  const queue = [];
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

  function modalRegion() {
    let top = null;
    try { const open = document.querySelectorAll(":modal"); top = open.length ? open[open.length - 1] : null; } catch (_) { return null; }
    if (!top) return null;
    let r = top.querySelector(":scope > [data-announce-modal]");
    if (!r) {
      r = document.createElement("div");
      r.setAttribute("data-announce-modal", "");
      r.setAttribute("role", "status"); r.setAttribute("aria-live", "polite"); r.setAttribute("aria-atomic", "true");
      top.appendChild(r);
    }
    return r;
  }
  function region() {
    if (typeof document === "undefined") return null;
    const inModal = document.querySelectorAll && modalRegion();
    if (inModal) return inModal;
    if (!el && document.getElementById) el = document.getElementById("announce-live");
    return el;
  }
  function kindOf(k) { return PRIO[k] ? k : /^penalty/.test(String(k || "")) ? "penalty" : "radio"; }

  function enqueue(item) {
    const superseding = item.kind === "flag" || item.kind === "hud";
    if (superseding && queue.some((q) => q.kind === item.kind && q.seq > item.seq)) return;
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i];
      if (q.text === item.text || ((item.kind === "flag" || item.kind === "hud") && q.kind === item.kind)) queue.splice(i, 1);
    }
    queue.push(item);
    queue.sort((a, b) => b.p - a.p || a.seq - b.seq);
    while (queue.length > MAX_Q) queue.splice(queue.findIndex((q) => q.p === queue[queue.length - 1].p), 1);
  }
  function write(item) {
    const r = region();
    current = item;
    if (!r) { phase = "idle"; current = null; return; }
    r.textContent = "";
    phase = "beat";
    timer = setTimeout(() => {
      const live = region();
      if (live !== r) { r.textContent = ""; write(item); return; }
      r.textContent = item.text;
      item.at = now();
      phase = "hold";
      timer = setTimeout(pump, HOLD_MS);
    }, BEAT_MS);
  }
  function pump() {
    timer = 0; phase = "idle"; current = null;
    const t = now();
    while (queue.length) {
      const next = queue.shift();
      const stale = STALE_MS[next.kind];
      if (stale && t - next.queuedAt > stale) continue;
      write(next);
      return;
    }
  }

  function say(text, kind) {
    if (text == null || text === "") return false;
    const k = kindOf(kind);
    const item = { text: String(text), kind: k, p: PRIO[k], seq: seq++, queuedAt: now(), at: 0 };
    if (phase === "idle") { write(item); return true; }
    if (current && item.p > current.p) {
      clearTimeout(timer);
      if (phase === "beat") enqueue(current);
      write(item);
      return true;
    }
    enqueue(item);
    return false;
  }

  function reset() {
    clearTimeout(timer);
    timer = 0; phase = "idle"; current = null; queue.length = 0;
    if (typeof document === "undefined") return;
    const live = document.getElementById && document.getElementById("announce-live");
    if (live) { live.textContent = ""; el = live; }
    if (!document.querySelectorAll) return;
    const blank = (n) => { if (n) n.textContent = ""; };
    let twins = [];
    try { twins = document.querySelectorAll("[data-announce-modal]"); } catch (_) { twins = []; }
    for (const n of twins) blank(n);
    let modals = [];
    try { modals = document.querySelectorAll(":modal"); } catch (_) { modals = []; }
    for (const top of modals) blank(top && top.querySelector && top.querySelector(":scope > [data-announce-modal]"));
  }

  function state() {
    return { phase, current: current ? current.text : null, queued: queue.map((q) => q.kind + ":" + q.text) };
  }

  return { say, reset, state, PRIO, BEAT_MS, HOLD_MS };
})();
Object.freeze(LiveRegion);
