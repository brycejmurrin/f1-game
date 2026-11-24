(() => {
  'use strict';

  // Distances are metres. The diagram projects the same points that set the speed limit.
  function trajectory(apex) {
    const angle = Math.PI * apex;
    const touch = [33 * Math.sin(angle), 33 * Math.cos(angle)];
    const cotangent = Math.cos(angle) / Math.sin(angle);
    const entry = [-48, 43], exit = [-48, -43];
    const inControl = [touch[0] + (touch[1] - 43) * cotangent, 43];
    const outControl = [touch[0] + (touch[1] + 43) * cotangent, -43];
    const points = [[-80, 43]];
    const quadratic = (a, b, c, t) => a.map((n, i) =>
      (1 - t) ** 2 * n + 2 * t * (1 - t) * b[i] + t ** 2 * c[i]);
    for (let i = 0; i <= 60; i++) points.push(quadratic(entry, inControl, touch, i / 60));
    for (let i = 1; i <= 60; i++) points.push(quadratic(touch, outControl, exit, i / 60));
    points.push([-80, -43]);
    return points;
  }

  function simulate(apex, straight) {
    const points = trajectory(apex);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const limits = points.map((b, i) => {
      if (!i || i === points.length - 1) return 80;
      const a = points[i - 1], c = points[i + 1];
      const cross = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
      const curvature = 2 * cross / (dist(a, b) * dist(b, c) * dist(a, c));
      return Math.min(80, Math.sqrt(16 / Math.max(curvature, 0.0001)));
    });
    // Limit entry speed by available braking distance, then propagate acceleration to exit.
    for (let i = points.length - 2; i >= 0; i--) {
      limits[i] = Math.min(limits[i], Math.sqrt(limits[i + 1] ** 2 + 2 * 12 * dist(points[i], points[i + 1])));
    }
    const clock = [0];
    let time = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const ds = dist(points[i - 1], points[i]);
      limits[i] = Math.min(limits[i], Math.sqrt(limits[i - 1] ** 2 + 2 * 5 * ds));
      time += 2 * ds / (limits[i - 1] + limits[i]);
      clock.push(time);
    }
    const exit = limits.at(-2);
    const accelerationTime = Math.min((80 - exit) / 5, (Math.sqrt(exit ** 2 + 10 * straight) - exit) / 5);
    const remaining = Math.max(0, straight - exit * accelerationTime - 2.5 * accelerationTime ** 2);
    return {points, limits, clock, exit, accelerationTime, straight, time: time + accelerationTime + remaining / 80};
  }

  const project = ([x, y]) => [348 + 2.1 * x, 120 + 2.1 * y];
  const path = points => 'M' + points.map(p => project(p).map(v => v.toFixed(1)).join(' ')).join(' L');
  const signed = n => (n > 0 ? '+' : '') + n.toFixed(2);

  function ghost(run, elapsed, reference) {
    const i = run.clock.findIndex(t => t > elapsed);
    let position, angle;
    if (i > 0) {
      const a = run.points[i - 1], b = run.points[i];
      const dt = elapsed - run.clock[i - 1];
      const duration = run.clock[i] - run.clock[i - 1];
      const speed = run.limits[i - 1] + (run.limits[i] - run.limits[i - 1]) * dt / duration;
      const ds = (speed + run.limits[i - 1]) * dt / 2;
      const fraction = ds / Math.hypot(b[0] - a[0], b[1] - a[1]);
      position = project(a.map((n, axis) => n + (b[axis] - n) * fraction));
      angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    } else {
      const dt = Math.max(0, Math.min(elapsed, run.time) - run.clock.at(-1));
      const acc = Math.min(dt, run.accelerationTime);
      const distance = run.exit * acc + 2.5 * acc ** 2 + 80 * (dt - acc);
      position = [reference ? 552 : 489, 178 - 110 * Math.min(1, distance / run.straight)];
      angle = -90;
    }
    const colour = reference ? '#f5f5f5' : '#70efc9';
    return `<g transform="translate(${position.map(n => n.toFixed(2)).join(' ')}) rotate(${angle}) scale(${reference ? 1.25 : 0.8})">
      <path d="M-8 -4 H-2 L2 -3 H5 L9 0 L5 3 H2 L-2 4 H-8 Z" fill="${colour}" stroke="#1c2c34" stroke-width="1.5"/>
      <path d="M0 -2 V2" stroke="#18382f" stroke-width="2"/></g>`;
  }

  LearnSandbox.mount({
    title: 'Racing lines and apex geometry',
    replay: {label: 'ghost race', input: () => 'elapsed'},
    intro: 'Move the clipping point around a hairpin. Compare the time from the approach to the end of the next straight against an early apex.',
    controls: [
      {id:'apex', label:'Apex position through the turn', min:30, max:70, step:1, value:30, unit:'%'},
      {id:'straight', label:'Following straight', min:50, max:500, step:25, value:200, unit:'m'},
      {id:'elapsed', label:'Replay clock', min:0, max:20, step:0.1, value:3, unit:'s'}
    ],
    challenge:'On a straight of at least 300 m, gain 0.70 s over the early-apex reference.',
    sources:[['Driver61 · The racing line', 'https://driver61.com/uni/racing-line/']],
    evaluate({apex, straight, elapsed = 3}) {
      const run = simulate(apex / 100, straight), reference = simulate(0.3, straight);
      const gain = reference.time - run.time;
      const [x,y] = project(run.points[61]);
      const success = straight >= 300 && gain >= 0.70;
      const svg = `<rect width="600" height="240" fill="#18382f"/>
        <path d="M0 200 H348 A80 80 0 0 0 348 40 H0" fill="none" stroke="#dad9cc" stroke-width="38"/>
        <path d="M0 200 H348 A80 80 0 0 0 348 40 H0" fill="none" stroke="#38424b" stroke-width="34"/>
        <path d="${path(reference.points.slice(0, -1))}" fill="none" stroke="#eee" stroke-width="2" stroke-dasharray="5 4"/>
        <path d="${path(run.points.slice(0, -1))}" fill="none" stroke="#70efc9" stroke-width="3"/>
        <circle cx="${x}" cy="${y}" r="5" fill="#ffcc76" stroke="#151e22"/>
        <rect x="449" width="151" height="240" fill="#142a26"/>
        <path d="M489 178 V68 M552 178 V68" stroke="#92a69d" stroke-width="2" stroke-dasharray="4 5"/>
        <path d="M472 68 H570" stroke="#d9e8df" stroke-width="3"/>
        ${ghost(reference, elapsed, true)}${ghost(run, elapsed, false)}
        <g fill="#edf5f4" font-family="system-ui" font-size="14">
        <text x="20" y="205">Entry →</text><text x="20" y="45">← Exit</text>
        <text x="30" y="102" fill="#70efc9">Solid · your line</text>
        <text x="30" y="125">Dashed · early reference</text>
        <text x="30" y="148" fill="#ffcc76">Dot · apex</text>
        <text x="524" y="25" text-anchor="middle">Exit straight</text>
        <text x="524" y="56" text-anchor="middle">Finish · ${straight} m</text>
        <text x="489" y="202" text-anchor="middle" fill="#70efc9">You</text>
        <text x="552" y="202" text-anchor="middle">Early</text></g>`;
      return {svg, metrics:[['Exit speed', Math.round(run.exit * 3.6) + ' km/h'], ['Sector time', run.time.toFixed(2) + ' s'], ['Time vs early apex', signed(-gain) + ' s']],
        explanation:'The model derives curvature from the drawn line. Tighter bends lower the speed limit. Scrub the clock to compare both cars at the same instant. Each car enters its own straight progress lane at corner exit and stops at the finish.',
        success, feedback:success ? 'You traded some entry speed for a faster sector.' : straight < 300 ? 'Lengthen the following straight to run the challenge.' : 'Move the apex and watch the sector delta. The largest exit speed may carry an entry-time cost.'};
    }
  });
})();
