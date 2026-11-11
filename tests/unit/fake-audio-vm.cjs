// Minimal recording AudioContext for the game VM (same shape as audio-tune.test.mjs boot()).
// Born "suspended" like a context on a real phone (iOS Safari, Chrome autoplay
// policy): only resume() makes it "running", so a test reading
// debug().contextState === "running" proves the engine resumed it. State moves
// one microtask after the call and fires onstatechange, as a browser does.
// "running" alone is reachable later too (music start, setEnabled), so
// `resumedAtBirth` records a resume() in the SAME synchronous turn as the
// constructor: the call that lands inside the creating gesture on iOS.
function param(v) {
  const p = { value: v, setTargetAtTime(x) { p.value = x; }, setValueAtTime(x) { p.value = x; },
    linearRampToValueAtTime(x) { p.value = x; }, exponentialRampToValueAtTime(x) { p.value = x; },
    cancelScheduledValues() {}, cancelAndHoldAtTime() {} };
  return p;
}
function install(sandbox, log) {
  const made = [];
  const live = new Set();
  function node(kind) {
    const self = { kind, connect: (t) => t, disconnect() { live.delete(self); }, start(t) { self.started = true; self.startAt = t; }, stop(t) { self.stopAt = t; },
      type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0,
      getFloatFrequencyData() {}, gain: param(1), frequency: param(440), detune: param(0), Q: param(1), playbackRate: param(1), pan: param(0),
      threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25), curve: null };
    live.add(self); return self;
  }
  function FakeAC() {
    const ctx = {
      currentTime: 0, state: "suspended", onstatechange: null, sampleRate: 44100, destination: node("dest"),
      createGain: () => node("gain"), createBiquadFilter: () => node("biquad"), createOscillator: () => node("osc"),
      createBufferSource: () => node("src"), createAnalyser: () => node("analyser"), createWaveShaper: () => node("shaper"),
      createConvolver: () => node("convolver"), createStereoPanner: () => node("panner"), createDynamicsCompressor: () => node("comp"),
      createMediaElementSource: () => node("media"),
      createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len), copyToChannel() {} }),
      decodeAudioData: (ab, res, rej) => { const e = new Error("fake: no decode"); if (rej) rej(e); return Promise.reject(e); },
      resume: () => to("running"), suspend: () => to("suspended"), close: () => to("closed"),
    };
    ctx.resumeCalls = 0;
    ctx.resumedAtBirth = false;
    let born = true;
    queueMicrotask(() => { born = false; });
    function to(state) {
      if (state === "running") { ctx.resumeCalls++; if (born) ctx.resumedAtBirth = true; }
      return Promise.resolve().then(() => {
        if (ctx.state === "closed" || ctx.state === state) return;
        ctx.state = state;
        if (typeof ctx.onstatechange === "function") ctx.onstatechange({ type: "statechange", target: ctx });
      });
    }
    made.push(ctx);
    if (log) log("new AudioContext #" + made.length);
    return ctx;
  }
  sandbox.AudioContext = FakeAC;
  return { made, live };
}
module.exports = { install };
