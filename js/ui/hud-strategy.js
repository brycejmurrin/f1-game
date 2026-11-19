const HudStrategy = (function () {
  "use strict";

  const UNDERCUT_WEAR = 0.05;
  const THREAT_REACH = 3;
  const COVER_MIN_WEAR = 0.4;

  function fmtLaps(left, spent) {
    if (spent >= 1) return "GONE";
    if (left == null || !Number.isFinite(left)) return "--";
    return Math.max(0, Math.min(99, Math.round(left))) + " L";
  }
  function fmtLoss(s) {
    return s != null && Number.isFinite(s) && s > 0 ? Math.round(s) + " s" : "--";
  }
  function fmtNext(pl) {
    if (!pl) return "--";
    if (pl.next == null) return pl.stops ? "DONE" : "NO STOP";
    return "L" + pl.next + (pl.code ? " " + pl.code : "");
  }
  function fmtWindow(est) {
    if (!est || !Number.isFinite(est.lossS) || est.lossS <= 0) return "";
    if (est.gapS === undefined) return "";
    if (est.gapS === null) return "EST WINDOW --" + (est.caution ? " · CAUTION" : "");
    if (!Number.isFinite(est.gapS) || est.gapS < 0) return "";
    const margin = Math.round(est.gapS - est.lossS);
    return "EST WINDOW " + (margin >= 0 ? "+" : "") + margin + " s" + (est.caution ? " · CAUTION" : "");
  }
  function tyresShort(left, pl, wasShort) {
    if (!Number.isFinite(left) || left < 0 || !pl || !Number.isFinite(pl.next)
      || !Number.isFinite(pl.lapsToStop) || pl.lapsToStop <= 0) return false;
    return wasShort ? left < pl.lapsToStop : left < pl.lapsToStop - 0.5;
  }
  function undercut(o) {
    if (!o || !o.hasRival || o.rivalInPit || o.rivalLapped) return false;
    if (!o.stopLeft) return false;
    if (!(o.gapS > 0) || !(o.lossS > 0) || o.gapS > o.lossS) return false;
    return (o.rivalWear || 0) - (o.myWear || 0) >= UNDERCUT_WEAR;
  }
  function behindThreat(o) {
    if (!o || !o.hasBehind || !o.stopLeft) return false;
    if (!(o.lossS > 0) || !(o.gapS > 0) || o.gapS > o.lossS + 2) return false;
    if (o.behindInPit) return true;
    const lts = o.lapsToStop;
    if (lts == null || lts < 1 || lts > THREAT_REACH) return false;
    if ((o.myWear || 0) < COVER_MIN_WEAR) return false;
    const w = o.behindWindow;
    if (!w || w[0] !== "P") return false;
    const due = +w.slice(1) - (o.behindLap || 0);
    if (!(due >= 0) || due > 1) return false;
    return (o.myWear || 0) - (o.behindWear || 0) >= UNDERCUT_WEAR;
  }

  const doc = typeof document !== "undefined" ? document : null;
  let root = null, nodes = null;
  const last = { tyre: "", loss: "", next: "", uc: null, ucWho: null, cov: null, covWho: null };
  let short = false, shortPlayer = null, shortNext = null;
  const ctx = { hasRival: false, rivalInPit: false, rivalLapped: false, stopLeft: false, gapS: 0, lossS: 0, rivalWear: 0, myWear: 0 };
  const bctx = { hasBehind: false, behindInPit: false, stopLeft: false, gapS: 0, lossS: 0, behindWear: 0, myWear: 0, lapsToStop: null, behindWindow: "", behindLap: 0 };

  function build() {
    root = doc && doc.getElementById("hud-strat");
    if (!root) return false;
    nodes = {};
    const row = (k, head) => {
      const el = doc.createElement("div");
      el.setAttribute("data-k", k);
      const h = doc.createElement("span"); h.textContent = head; el.appendChild(h);
      const v = doc.createElement("b"); el.appendChild(v);
      if (k === "loss" || k === "next") { v.style.maxWidth = "24ch"; v.style.overflowWrap = "anywhere"; }
      root.appendChild(el);
      nodes[k] = v; nodes[k + "Row"] = el;
    };
    row("tyre", "TYRES"); row("loss", "PIT LOSS"); row("next", "NEXT");
    row("uc", "▲ UNDERCUT"); row("cov", "▼ COVER");
    nodes.ucRow.hidden = true;
    nodes.covRow.hidden = true;
    return true;
  }
  const isOn = () => typeof HudElements === "undefined" || HudElements.isOn("strat");
  function set(k, v) { if (last[k] !== v) { last[k] = v; nodes[k].textContent = v; return true; } return false; }

  function tick(G, player, readouts) {
    if (!doc || !player) return;
    if (!root && !build()) return;
    const tyres = G.tyres, pit = G.pits;
    const race = G.state === "race" && !G.timeTrial && !G.practice && G.session !== "quali";
    if (!isOn() || !race || !tyres || !tyres.on() || player.retired) { short = false; shortPlayer = null; if (!root.hidden) root.hidden = true; return; }
    const b = doc.body;
    if (b && (b.classList.contains("hud-prof-minimal") || b.classList.contains("hud-bcam") || b.classList.contains("bc-on"))) return;
    if (root.hidden) root.hidden = false;
    const shared = readouts && readouts.player === player ? readouts : { player };
    const spent = shared.spent !== undefined ? shared.spent : tyres.spent(player);
    const left = shared.left !== undefined ? shared.left : tyres.lapsLeft ? tyres.lapsLeft(player) : null;
    const code = (player.tyre && player.tyre.code) || "";
    let dirty = set("tyre", (code ? code + " " : "") + fmtLaps(left, spent));
    if (shared.estimate === undefined) shared.estimate = pit && pit.estimate ? pit.estimate(player) : null;
    const est = shared.estimate;
    const lossS = est && est.lossS > 0 ? est.lossS : pit && pit.lossS ? pit.lossS() : NaN;
    const window = fmtWindow(est);
    dirty = set("loss", fmtLoss(lossS) + (window ? " · " + window : "")) || dirty;
    const pl = shared.plan !== undefined ? shared.plan : pit && pit.planInfo ? pit.planInfo(player, shared) : null;
    if (player !== shortPlayer || (pl && pl.next) !== shortNext) short = false;
    shortPlayer = player; shortNext = pl && pl.next;
    short = tyresShort(left, pl, short);
    dirty = set("next", fmtNext(pl) + (short ? " · EST TYRES SHORT OF L" + pl.next : "")) || dirty;
    const ranked = G.ranked || [];
    let i = (player.rank || 0) - 1;
    if (ranked[i] !== player) i = ranked.indexOf(player);
    const a = i > 0 ? ranked[i - 1] : null;
    const behind = i >= 0 && i < ranked.length - 1 ? ranked[i + 1] : null;
    const vFloor = Math.max(player.speed || 0, (G.vTop ? G.vTop() : 80) * 0.26);
    const total = G.track ? G.track.total : 0;
    ctx.hasRival = !!a && !a.retired;
    if (ctx.hasRival) {
      const dist = (a.prog || 0) - (player.prog || 0);
      ctx.gapS = typeof HudReadouts !== "undefined" && HudReadouts.gaps ? HudReadouts.gaps.between(a, player, G.raceT || 0, dist / vFloor) : dist / vFloor;
      ctx.rivalLapped = total > 0 && dist >= total;
      ctx.rivalInPit = (typeof HudReadouts !== "undefined" ? HudReadouts.inPit : (c) => !!(c && c.pitState && c.pitState !== "none"))(a);
      ctx.rivalWear = tyres.spent(a);
    }
    ctx.myWear = spent;
    ctx.lossS = lossS;
    ctx.stopLeft = !pl || pl.next != null;
    const uc = undercut(ctx);
    if (uc !== last.uc || (uc && a !== last.ucWho)) {
      last.uc = uc; last.ucWho = uc ? a : null; dirty = true;
      nodes.ucRow.hidden = !uc;
      nodes.uc.textContent = uc ? (a.code || "") : "";
    }
    bctx.hasBehind = !!behind && !behind.retired;
    bctx.stopLeft = ctx.stopLeft;
    bctx.myWear = spent;
    bctx.lossS = lossS;
    bctx.lapsToStop = pl && Number.isFinite(pl.lapsToStop) ? pl.lapsToStop : null;
    if (bctx.hasBehind) {
      const backDist = (player.prog || 0) - (behind.prog || 0);
      bctx.gapS = backDist / vFloor;
      bctx.behindInPit = (typeof HudReadouts !== "undefined" ? HudReadouts.inPit : (c) => !!(c && c.pitState && c.pitState !== "none"))(behind);
      bctx.behindWear = tyres.spent(behind);
      bctx.behindLap = behind.lap || 0;
      bctx.behindWindow = pit && pit.windowOf ? pit.windowOf(behind) : "";
    }
    const cov = behindThreat(bctx);
    if (cov !== last.cov || (cov && behind !== last.covWho)) {
      last.cov = cov; last.covWho = cov ? behind : null; dirty = true;
      nodes.covRow.hidden = !cov;
      nodes.cov.textContent = cov ? (behind.code || "") : "";
    }
    if (dirty) {
      root.setAttribute("aria-label", I18n.t("hud.strategy.label", { tyre: last.tyre, loss: last.loss, next: last.next }, "Strategy: tyres {tyre}, pit loss {loss}, next stop {next}")
        + (uc ? ", " + I18n.t("hud.strategy.undercut", { who: a.code || I18n.t("hud.strategy.carAhead", null, "the car ahead") }, "undercut on {who}") : "")
        + (cov ? ", " + I18n.t("hud.strategy.cover", { who: behind.code || I18n.t("hud.strategy.carBehind", null, "the car behind") }, "cover from {who}") : ""));
    }
  }

  return Object.freeze({ UNDERCUT_WEAR, THREAT_REACH, COVER_MIN_WEAR, fmtLaps, fmtLoss, fmtNext, fmtWindow, tyresShort, undercut, behindThreat, tick });
})();
