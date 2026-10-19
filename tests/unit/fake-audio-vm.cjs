// Minimal recording AudioContext for the game VM (same shape as audio-tune.test.mjs boot()).
function param(v, record) {
  const p = { value: v };
  if (record) Object.assign(p, { calls: [], sets: 0, snaps: 0, lastMethod: null });
  function set(method, x, call) {
    p.value = x;
    if (record) {
      p.calls.push(call); p.sets++; p.lastMethod = method;
      if (method === "value") p.snaps++;
    }
  }
  Object.assign(p, {
    setTargetAtTime(x, t, tau) { set("target", x, ["target", x, t, tau]); },
    setValueAtTime(x) { set("value", x, ["value", x]); },
    linearRampToValueAtTime(x) { set("linear", x, ["linear", x]); },
    exponentialRampToValueAtTime(x) { set("exp", x, ["exp", x]); },
    cancelScheduledValues(t) { if (record) p.calls.push(["cancel", t]); },
    cancelAndHoldAtTime(t) { if (record) p.calls.push(["hold", t]); },
  });
  return p;
}
// Recording and successful sample decoding are opt-in. Existing game-VM
// consumers retain the rejected decode and inert parameter observation policy.
function install(sandbox, log, options = {}) {
  const audioParam = (v) => {
    const p = param(v, options.recordParameters);
    // Some fixtures deliberately exercise the older scheduling fallback.
    if (options.cancelAndHoldAtTime === false) delete p.cancelAndHoldAtTime;
    return p;
  };
  const made = [];
  const live = new Set();
  function node(kind) {
    const self = { kind, connect: (t) => t, disconnect() { live.delete(self); }, start(t) { self.started = true; self.startAt = t; }, stop(t) { self.stopAt = t; },
      type: "", loop: false, loopStart: 0, loopEnd: 0, buffer: null, onended: null, fftSize: 0, frequencyBinCount: 0,
      getFloatFrequencyData() {}, gain: audioParam(1), frequency: audioParam(440), detune: audioParam(0), Q: audioParam(1), playbackRate: audioParam(1), pan: audioParam(0),
      threshold: audioParam(-24), knee: audioParam(30), ratio: audioParam(12), attack: audioParam(0.003), release: audioParam(0.25), curve: null };
    live.add(self);
    if (options.onNode) options.onNode(self);
    return self;
  }
  function FakeAC() {
    const ctx = {
      currentTime: 0, state: "running", sampleRate: 44100, destination: node("dest"),
      createGain: () => node("gain"), createBiquadFilter: () => node("biquad"), createOscillator: () => node("osc"),
      createBufferSource: () => node("src"), createAnalyser: () => node("analyser"), createWaveShaper: () => node("shaper"),
      createConvolver: () => node("convolver"), createStereoPanner: () => node("panner"), createDynamicsCompressor: () => node("comp"),
      createMediaElementSource: () => node("media"),
      createBuffer: (ch, len, sr) => ({ sampleRate: sr, length: len, duration: len / sr, numberOfChannels: ch, getChannelData: () => new Float32Array(len), copyToChannel() {} }),
      decodeAudioData: options.decodeAudioData || ((ab, res, rej) => { const e = new Error("fake: no decode"); if (rej) rej(e); return Promise.reject(e); }),
      resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
    };
    made.push(ctx);
    if (log) log("new AudioContext #" + made.length);
    return ctx;
  }
  sandbox.AudioContext = FakeAC;
  return { made, live };
}
module.exports = { install };
