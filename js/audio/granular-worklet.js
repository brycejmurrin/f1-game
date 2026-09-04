/* apex-granular — pitch-synchronous overlap-add (PSOLA) engine voice.
 *
 * WHY THIS EXISTS. The sample core pitches one looping recording with
 * playbackRate, from ~0.25x at idle to ~0.70x at redline. That is tape speed,
 * not engine speed: it moves the FIRING RATE (right) and the fixed physical
 * resonances of the exhaust, airbox and body (wrong — those do not change with
 * rpm). Measured on the shipped f1_engine.mp3, the spectral centroid collapses
 * 1526 -> 798 Hz across that range, a 48% darkening that no amount of opening
 * the lowpass afterwards can undo, because the energy is simply not there.
 *
 * PSOLA separates the two. Grains are cut at the SOURCE's own period and laid
 * down at the TARGET period: the spacing sets the pitch, while each grain keeps
 * the spectral envelope it was recorded with. Same measurement, same asset,
 * same range: centroid 1522 -> 1525 Hz. The engine gets quieter and lower
 * without getting muffled.
 *
 * THIS IS AN ES MODULE, deliberately, and the one exception to the no-modules
 * rule in AGENTS.md: audioWorklet.addModule() defines the loading context, not
 * us. It carries no <script> tag and is not in the roster; it is fetched at
 * runtime by js/audio/engine.js and precached by sw.js like any other asset.
 *
 * Everything here runs on the AUDIO thread, which is why the DSP lives in a
 * worklet rather than in scheduled BufferSourceNodes: the alternative is ~100
 * node creations a second on the main thread, in a file whose whole performance
 * history is about removing cross-thread scheduling from the hot path. Here the
 * per-frame cost to the game is ONE AudioParam write.
 *
 * Tested headlessly by tests/unit/granular-psola.test.mjs, which evaluates this
 * file against a fake AudioWorkletProcessor and asserts the centroid property
 * above — the same measurement that condemned the previous crossfade attempt.
 */

const HANN = new Map();                 // window cache, keyed by length
function hann(n) {
  let w = HANN.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    HANN.set(n, w);
  }
  return w;
}

class GrainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // The SAME number the playbackRate core used, so the pitch curve, the
      // gear ordering and GameAudio.rate() are all unchanged by this swap.
      { name: "ratio", defaultValue: 1, minValue: 0.05, maxValue: 4, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.pcm = null;
    this.p0 = 0;              // source period, samples
    this.loopStart = 0;
    this.loopEnd = 0;
    this.ring = null;
    this.mask = 0;
    this.readHead = 0;        // absolute output sample index
    this.nextAt = 0;          // absolute output index of the next grain, fractional
    this.mark = 0;            // which source period the next grain comes from
    this.port.onmessage = (e) => this.load(e.data);
  }

  load(d) {
    if (!d || !d.pcm || !(d.p0 > 1)) return;
    this.pcm = d.pcm;
    this.p0 = d.p0;
    this.loopStart = Math.max(0, Math.floor(d.loopStart || 0));
    this.loopEnd = Math.min(this.pcm.length, Math.floor(d.loopEnd || this.pcm.length));
    if (this.loopEnd - this.loopStart < this.p0 * 4) { this.loopStart = 0; this.loopEnd = this.pcm.length; }
    // Ring must hold the longest grain we can ask for plus a render quantum.
    // Grain length peaks at overlap_max * p0 / ratio_min.
    // Ring holds the widest grain SPACING we can be asked for (ratio 0.05)
    // plus a grain and a render quantum, so a grain laid far ahead of the read
    // head cannot wrap onto itself.
    const maxGrain = Math.ceil(this.p0 / 0.05) + 2 * this.p0 + 256;
    let size = 1;
    while (size < maxGrain) size <<= 1;
    this.ring = new Float32Array(size);
    this.mask = size - 1;
    this.readHead = 0;
    this.nextAt = 0;
    this.mark = 0;
  }

  process(inputs, outputs, params) {
    const out = outputs[0][0];
    if (!out) return true;
    if (!this.pcm) { out.fill(0); return true; }

    const n = out.length;
    const ratio = Math.max(0.05, params.ratio[0]);
    const period = this.p0 / ratio;                       // TARGET period -> the new pitch
    // EXACTLY two source periods. Not "enough to overlap at any ratio": a grain
    // stretched to cover the target period carries the SOURCE's periodicity
    // inside it, and the output then sings at the recording's pitch instead of
    // the one asked for (measured — the first cut of this file did that, and
    // read 480 samples of period where 1920 was wanted). Two source periods is
    // one excitation event plus its window, which is what carries the spectral
    // envelope and nothing else.
    //
    // Below ratio 0.5 that leaves gaps between grains, and those gaps are
    // CORRECT: an engine at low rpm really does have silence between firing
    // pulses. What must not happen is the resonances moving, and they do not.
    const L = (2 * this.p0) | 0;
    const win = hann(L);
    const marks = Math.max(1, Math.floor((this.loopEnd - this.loopStart - L) / this.p0));

    // Lay every grain whose onset falls inside the block we are about to emit.
    const blockEnd = this.readHead + n;
    while (this.nextAt < blockEnd) {
      const at = Math.round(this.nextAt);
      const from = this.loopStart + Math.round((this.mark % marks) * this.p0);
      for (let i = 0; i < L; i++) {
        const s = from + i;
        if (s >= this.loopEnd) break;
        this.ring[(at + i) & this.mask] += this.pcm[s] * win[i];
      }
      this.nextAt += period;
      this.mark++;
    }

    // Emit, and clear behind us so the ring can be summed into again. Hann at
    // 50% overlap (ratio 1) sums to 1.0. Pitching UP packs grains tighter and
    // would sum higher, so normalise that back; pitching down thins them out
    // and is left alone, because fewer firing pulses SHOULD carry less energy —
    // setEngine's own level curve is what shapes loudness against rev.
    const norm = 1 / Math.max(1, L / (2 * period));
    for (let i = 0; i < n; i++) {
      const k = (this.readHead + i) & this.mask;
      out[i] = this.ring[k] * norm;
      this.ring[k] = 0;
    }
    this.readHead += n;
    return true;
  }
}

registerProcessor("apex-granular", GrainProcessor);
