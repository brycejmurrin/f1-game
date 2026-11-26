(() => {
  'use strict';

  /* The game's own numbers, kept in step by tests/unit/learn-buttons.test.mjs:
     the pedal slide is js/input/pedal-travel.js level() (explicit SLIDE END path, SLIDE DEAD ZONE),
     the arrow ramp and lock are js/input/steer-tuning.js + js/input/input.js digitalRateIn. */
  const CURVES = {
    linear: t => t, fine: t => t * t, quick: t => t * (2 - t), smooth: t => t * t * (3 - 2 * t)
  };
  function level(p, advance) {
    const t = Math.max(0, advance - (p.deadPx || 0)) / p.travel;
    const f = Math.min(1, t >= 1 ? t : CURVES[p.curve || 'linear'](t));
    return (p.start / 100) * (1 - f) + (p.end / 100) * f;
  }
  const lockRad = n => 0.18 + (0.435 - 0.18) * (n - 1) / 9;
  const speedRef = n => 15 + 60 * (n - 1) / 9;
  const rampRate = n => n <= 5 ? 2.5 + 1.5 * (n - 1) / 4 : 4 + 3 * (n - 5) / 5;
  function fullLockDeg(dial, s) {
    const vs = dial / 3.6, raw = 1 / (1 + vs / speedRef(s.speedSteer));
    const taper = vs <= 15 ? 1.06 : vs >= 30 ? raw : 1.06 + (raw - 1.06) * (vs - 15) / 15;
    return lockRad(s.lock) * taper * 180 / Math.PI;
  }
  function msToLock(dial, s) {
    const R = rampRate(s.rate), mix = (s.adaptive - 1) / 9, vs = dial / 3.6;
    return 1000 / (R + (R / (1 + vs / speedRef(s.speedSteer)) - R) * mix);
  }

  // The reference iPhone 15 landscape layout: BRAKE above GAS, 122 px tall, a 7 px gap.
  const BTN_H = 122, GAP = 7;
  const fmt = v => Math.round(v * 100) + ' %';
  const pedalOf = s => ({start: s.start, end: s.end, travel: s.travel, curve: s.curve, deadPx: Number(s.deadPx)});

  function pedals(s) {
    const p = pedalOf(s);
    const wobbled = Math.min(level(p, s.wobble), level(p, 0));
    const reach = (p.deadPx || 0) + p.travel;            // thumb travel to the slide end
    const bottom = s.land + reach;                        // where a full slide ends, from BRAKE's top
    const ontoGas = bottom > BTN_H + GAP;
    const maxLand = BTN_H + GAP - reach;
    // Left: the BRAKE/GAS column. Right: brake input against slide distance.
    const col = 40, top = 22, k = 1.4 / 2;               // 0.7 px per screen px
    const y = px => top + px * k;
    const thumbY = y(s.land);
    const L = 250, R = 580, T = 30, B = 200, span = Math.max(reach + 20, 60);
    const px = a => L + (R - L) * a / span, py = v => B - (B - T) * v;
    let curve = '';
    for (let a = 0; a <= span; a += 1) curve += (a ? 'L' : 'M') + px(a).toFixed(1) + ',' + py(level(p, a)).toFixed(1);
    const dz = p.deadPx ? `<rect x="${px(0)}" y="${T}" width="${(px(p.deadPx) - px(0)).toFixed(1)}" height="${B - T}" fill="currentColor" opacity=".12"/>
      <text x="${px(p.deadPx / 2)}" y="${T - 6}" text-anchor="middle" font-size="12">dead zone</text>` : '';
    const wb = `<rect x="${px(0)}" y="${T}" width="${(px(s.wobble) - px(0)).toFixed(1)}" height="${B - T}" fill="#e64b43" opacity=".18"/>`;
    const svg = `<g fill="currentColor" font-family="system-ui,sans-serif" font-size="13">
      <rect x="${col}" y="${y(0)}" width="80" height="${BTN_H * k}" rx="6" fill="#d1263a" opacity=".7"/>
      <text x="${col + 40}" y="${y(BTN_H / 2) + 4}" text-anchor="middle" fill="#fff" font-weight="700">BRAKE</text>
      <rect x="${col}" y="${y(BTN_H + GAP)}" width="80" height="${(B + 30 - y(BTN_H + GAP))}" rx="6" fill="#11804a" opacity=".7"/>
      <text x="${col + 40}" y="${y(BTN_H + GAP) + 26}" text-anchor="middle" fill="#fff" font-weight="700">GAS</text>
      <path d="M${col + 100} ${thumbY}V${y(bottom)}" stroke="${ontoGas ? '#e64b43' : 'currentColor'}" stroke-width="3" fill="none"/>
      <circle cx="${col + 40}" cy="${thumbY}" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/>
      <text x="${col + 108}" y="${y(bottom) + 4}">${ontoGas ? 'on GAS' : 'slide end'}</text>
      ${dz}${wb}
      <path d="M${L} ${T}V${B}H${R}" stroke="currentColor" opacity=".45" fill="none"/>
      <path d="${curve}" stroke="#d1263a" stroke-width="3.5" fill="none"/>
      <text x="${L - 6}" y="${py(1) + 4}" text-anchor="end">100</text><text x="${L - 6}" y="${py(0) + 4}" text-anchor="end">0</text>
      <text x="${L}" y="${B + 18}">0 px</text><text x="${R}" y="${B + 18}" text-anchor="end">${span} px slid down</text>
      <text x="${(L + R) / 2}" y="${B + 36}" text-anchor="middle">Brake input · red band = ${s.wobble} px thumb wobble</text></g>`;
    const solid = wobbled >= 0.95, stays = !ontoGas, light = p.end <= 30;
    return {
      svg,
      replay(progress) {
        const a = progress * reach;
        return {svg: LearnSandbox.cursor(px(a), py(level(p, a)), T, B) +
          `<circle cx="${col + 40}" cy="${y(s.land + a)}" r="7" fill="#e64b43"/>`,
        readout: Math.round(a) + ' px · brake ' + fmt(level(p, a)) + (s.land + a > BTN_H + GAP ? ' · thumb on GAS' : '')};
      },
      metrics: [['Brake through the wobble', fmt(wobbled)], ['Slide to reach the end', reach + ' px'],
        ['Full slide ends', ontoGas ? 'on GAS at 100 %' : (BTN_H + GAP - bottom) + ' px above GAS'],
        ['Land no lower than', maxLand > 0 ? maxLand + ' px into BRAKE' : 'shorten the slide']],
      explanation: 'A pedal with a SLIDE END INPUT starts counting from your first pixel of movement, and QUICK START makes those first pixels count the most. A SLIDE DEAD ZONE ignores a small thumb roll first. Where you land matters too: BRAKE and GAS share one column, so a long slide from a low landing ends on GAS.',
      success: solid && stays && light,
      feedback: !light ? 'Set the slide end to 30 % or less so you can still trail-brake lightly into the apex.'
        : !solid ? 'A ' + s.wobble + ' px wobble drops the brake to ' + fmt(wobbled) + '. Add a SLIDE DEAD ZONE at least as big as the wobble, or pick FINE START.'
          : !stays ? 'A full slide from this landing ends on GAS. Land higher, shorten SLIDE DISTANCE, or use a smaller dead zone.'
            : 'Full brake survives the wobble, and a full slide still ends on BRAKE.'
    };
  }

  function arrows(s) {
    const L = 60, R = 580, T = 24, B = 196, maxV = 320;
    const x = v => L + (R - L) * v / maxV;
    const yA = d => B - (B - T) * d / 25, yT = ms => B - (B - T) * ms / 600;
    let lock = '', ramp = '';
    for (let v = 0; v <= maxV; v += 4) {
      lock += (v ? 'L' : 'M') + x(v).toFixed(1) + ',' + yA(fullLockDeg(v, s)).toFixed(1);
      ramp += (v ? 'L' : 'M') + x(v).toFixed(1) + ',' + yT(Math.min(600, msToLock(v, s))).toFixed(1);
    }
    const deg = fullLockDeg(s.dial, s), ms = msToLock(s.dial, s);
    const svg = `<g fill="currentColor" font-family="system-ui,sans-serif" font-size="13">
      <path d="M${L} ${T}V${B}H${R}" stroke="currentColor" opacity=".45" fill="none"/>
      <path d="${lock}" stroke="#0b62e0" stroke-width="3.5" fill="none"/>
      <path d="${ramp}" stroke="#c27400" stroke-width="3" stroke-dasharray="7 5" fill="none"/>
      <path d="M${x(s.dial)} ${T}V${B}" stroke="currentColor" stroke-dasharray="3 4" opacity=".6"/>
      <text x="${L - 6}" y="${yA(25) + 4}" text-anchor="end">25°</text><text x="${L - 6}" y="${B + 4}" text-anchor="end">0</text>
      <text x="${R}" y="${yA(25) + 4}" text-anchor="end">600 ms</text>
      <text x="${L}" y="${B + 18}">0</text><text x="${R}" y="${B + 18}" text-anchor="end">${maxV} km/h on the dial</text>
      <text x="${(L + R) / 2}" y="${B + 36}" text-anchor="middle">Blue · full-press angle   Amber dashed · time to reach it</text></g>`;
    const quick = msToLock(200, s) <= 260, calm = fullLockDeg(200, s) <= 7;
    return {
      svg,
      metrics: [['Full press at ' + s.dial + ' km/h', deg.toFixed(1) + '°'], ['Time to full lock', Math.round(ms) + ' ms'],
        ['Full press at 90 km/h', fullLockDeg(90, s).toFixed(1) + '°']],
      explanation: 'A steer arrow does not snap to full lock. It builds toward it at STEER RATE, ADAPTIVE BUTTONS slows that build as speed rises, and SPEED STEER shrinks the full-press angle at speed. Less angle at speed makes a held press safe on fast corners; a quick build keeps the car responsive.',
      success: quick && calm,
      feedback: quick && calm ? 'At 200 km/h a press reaches a calm ' + fullLockDeg(200, s).toFixed(1) + '° in ' + Math.round(msToLock(200, s)) + ' ms.'
        : !calm ? 'A full press still asks for ' + fullLockDeg(200, s).toFixed(1) + '° at 200 km/h. Lower SPEED STEER.'
          : 'A press takes ' + Math.round(msToLock(200, s)) + ' ms to reach full lock at 200 km/h. Lower ADAPTIVE BUTTONS or raise STEER RATE.'
    };
  }

  // The player's saved BRAKE, when this page shares the game's storage (same origin).
  const presets = [
    ['Like the default slide (no slide end)', {scenario: 'pedals', start: 100, end: 12, travel: 90, curve: 'linear', deadPx: '12'}],
    ['Quick start, no dead zone', {scenario: 'pedals', start: 100, end: 20, travel: 74, curve: 'quick', deadPx: '0'}],
    ['Quick start, 6 px dead zone', {scenario: 'pedals', start: 100, end: 20, travel: 74, curve: 'quick', deadPx: '6'}],
    ['Arrows · shipped STANDARD', {scenario: 'arrows', speedSteer: 7, adaptive: 6, rate: 5, lock: 7}],
  ];
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem('apex26.touchButtonProfiles');
    const brake = raw && JSON.parse(raw)?.buttons?.brake;
    if (brake && brake.end != null) {
      const clamp = (v, lo, hi, d) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d;
      presets.unshift(['Your saved BRAKE', {scenario: 'pedals', start: clamp(brake.start, 0, 100, 100),
        end: clamp(brake.end, 0, 100, 20), travel: clamp(brake.travel, 40, 160, 90),
        curve: CURVES[brake.slideCurve] ? brake.slideCurve : 'linear', deadPx: String([6, 12, 20].includes(brake.deadPx) ? brake.deadPx : 0)}]);
    }
  } catch (_) { /* storage blocked: the shipped examples remain */ }

  const pedal = s => s.scenario === 'pedals', arrow = s => s.scenario === 'arrows';
  const lesson = {
    title: 'Button Trainer',
    key: 'Pedals: the column is BRAKE above GAS on an iPhone 15 in landscape. Arrows: dial km/h is the speedo.',
    replay: {label: 'thumb slide', initial: 0},
    intro: 'Tune your on-screen pedals and steer arrows away from the track. See what a thumb wobble does to the brake, where a long slide ends, and how fast an arrow reaches full lock.',
    inGame: 'These are the same numbers the race uses. Pedal shapes live in SETTINGS › CONTROLS › TOUCH BUTTON RESPONSE (STARTING INPUT, SLIDE END INPUT, SLIDE DISTANCE, SLIDE RESPONSE, SLIDE DEAD ZONE). Arrow feel is SPEED STEER, ADAPTIVE BUTTONS, STEER RATE and STEER LOCK in the steering settings. Full brake leaves only about half of the tyres’ turning grip, so ease the brake off as you turn in.',
    controls: [
      {id: 'scenario', primary: true, label: 'Practise', value: 'pedals', options: [['pedals', 'Brake slide'], ['arrows', 'Steer arrows']]},
      {id: 'deadPx', when: pedal, primary: true, label: 'Slide dead zone', value: '0', options: [['0', 'Off'], ['6', '6 px'], ['12', '12 px'], ['20', '20 px']]},
      {id: 'land', when: pedal, primary: true, label: 'Thumb lands, below the top of BRAKE', min: 10, max: 110, step: 5, value: 40, unit: 'px'},
      {id: 'wobble', when: pedal, label: 'Thumb wobble', min: 0, max: 15, step: 1, value: 6, unit: 'px'},
      {id: 'start', when: pedal, label: 'Starting input', min: 50, max: 100, step: 5, value: 100, unit: '%'},
      {id: 'end', when: pedal, label: 'Slide end input', min: 0, max: 60, step: 5, value: 20, unit: '%'},
      {id: 'travel', when: pedal, label: 'Slide distance', min: 40, max: 160, step: 1, value: 74, unit: 'px'},
      {id: 'curve', when: pedal, label: 'Slide response', value: 'quick', options: [['linear', 'Linear'], ['fine', 'Fine start'], ['quick', 'Quick start'], ['smooth', 'S-curve']]},
      {id: 'dial', when: arrow, primary: true, label: 'Corner speed', min: 60, max: 300, step: 10, value: 200, unit: 'km/h'},
      {id: 'speedSteer', when: arrow, primary: true, label: 'SPEED STEER', min: 1, max: 10, step: 1, value: 7},
      {id: 'adaptive', when: arrow, label: 'ADAPTIVE BUTTONS', min: 1, max: 10, step: 1, value: 6},
      {id: 'rate', when: arrow, label: 'STEER RATE', min: 1, max: 10, step: 1, value: 5},
      {id: 'lock', when: arrow, label: 'STEER LOCK', min: 1, max: 10, step: 1, value: 7},
    ],
    presets,
    challenge: 'Brake slide: keep full brake through a 6 px wobble, end the slide at 30 % or less, and keep a full slide on BRAKE. Steer arrows: at 200 km/h, reach full lock within 260 ms with no more than 7° of angle. Check each separately.',
    sources: [
      ['Apple · Human Interface Guidelines: gestures', 'https://developer.apple.com/design/human-interface-guidelines/gestures'],
      ['MDN · Pointer events', 'https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events'],
      ['Wikipedia · Trail braking', 'https://en.wikipedia.org/wiki/Trail_braking']
    ],
    evaluate: s => (s.scenario === 'arrows' ? arrows(s) : pedals(s)),
    model: {level, fullLockDeg, msToLock}
  };
  LearnSandbox.mount(lesson);
})();
