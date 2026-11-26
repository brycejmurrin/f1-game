// audio-create-watch.cjs — records every create() of the five stub-then-recreate
// audio modules in a game VM (#6952). Installed from createGame's onSandbox, before
// any script runs: each module global becomes an accessor, and every value the
// stub or the real bundle assigns gets a create() wrapper. Generation 0 is the
// stub (js/audio/stub.js evaluates first); later generations are the real module.
const MODULES = ["RadioVoice", "Announcer", "RivalAudio", "CarSfx", "AudioPanel"];

function watchAudioCreates(sb, opts = {}) {
  const log = {};
  let threw = false;
  for (const name of MODULES) {
    let cur, gen = -1;
    log[name] = [];
    Object.defineProperty(sb, name, { configurable: true, get: () => cur, set: (v) => {
      gen++;
      if (v && typeof v.create === "function") {
        const orig = v.create, g = gen;
        v = Object.assign({}, v, { create() {
          if (g > 0 && opts.throwOnce === name && !threw) { threw = true; throw new Error("test: " + name + ".create threw once"); }
          const r = orig.apply(this, arguments);
          log[name].push({ gen: g, inst: r });
          return r;
        } });
      }
      cur = v;
    } });
  }
  return {
    log,
    thrown: () => threw,
    held: () => Object.fromEntries(MODULES.map((m) => [m, (log[m].find((e) => e.gen === 0) || {}).inst])),
    real: () => Object.fromEntries(MODULES.map((m) => [m, log[m].filter((e) => e.gen > 0).map((e) => e.inst)])),
  };
}
module.exports = { watchAudioCreates, MODULES };
