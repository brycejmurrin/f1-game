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
    return points;
  }

  const lateralLimit = 16;
  const commonEntry = 42;

  function allowableSpeed(base, cap, ds, curvature, longitudinalLimit) {
    if (cap <= base) return cap;
    let lo = base, hi = cap;
    for (let i = 0; i < 26; i++) {
      const candidate = (lo + hi) / 2;
      const longitudinal = (candidate ** 2 - base ** 2) / (2 * ds);
      const lateral = curvature * candidate ** 2;
      if (Math.hypot(longitudinal / longitudinalLimit, lateral / lateralLimit) <= 1) lo = candidate;
      else hi = candidate;
    }
    return lo;
  }

  function simulate(apex, straight) {
    const points = trajectory(apex);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const curvature = points.map((b, i) => {
      if (!i || i === points.length - 1) return 0;
      const a = points[i - 1], c = points[i + 1];
      const cross = Math.abs((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
      return 2 * cross / (dist(a, b) * dist(b, c) * dist(a, c));
    });
    const segment = i => Math.max(curvature[i], curvature[i + 1]);
    const limits = curvature.map((_, i) => Math.min(80, Math.sqrt(lateralLimit /
      Math.max(.0001, segment(Math.max(0, i - 1)), i < points.length - 1 ? segment(i) : 0))));
    // Run backward for braking room and forward for acceleration room under one force budget.
    for (let i = points.length - 2; i >= 0; i--) {
      limits[i] = allowableSpeed(limits[i + 1], limits[i], dist(points[i], points[i + 1]), segment(i), 12);
    }
    limits[0] = Math.min(limits[0], commonEntry);
    const clock = [0];
    let time = 0;
    for (let i = 1; i < points.length; i++) {
      const ds = dist(points[i - 1], points[i]);
      limits[i] = allowableSpeed(limits[i - 1], limits[i], ds, segment(i - 1), 5);
      time += 2 * ds / (limits[i - 1] + limits[i]);
      clock.push(time);
    }
    const exit = limits.at(-1);
    const accelerationTime = Math.min((80 - exit) / 5, (Math.sqrt(exit ** 2 + 10 * straight) - exit) / 5);
    const remaining = Math.max(0, straight - exit * accelerationTime - 2.5 * accelerationTime ** 2);
    return {points, limits, clock, exit, accelerationTime, straight, time: time + accelerationTime + remaining / 80};
  }

  const project = ([x, y]) => [348 + 2.1 * x, 120 + 2.1 * y];
  const path = points => 'M' + points.map(p => project(p).map(v => v.toFixed(1)).join(' ')).join(' L');
  const signed = n => (n > 0 ? '+' : '') + n.toFixed(2);
  const straightFinish = 28;

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
      const [exitX, exitY] = project(run.points.at(-1));
      const progress = Math.min(1, distance / run.straight);
      position = [exitX + (straightFinish - exitX) * progress, exitY];
      angle = 180;
    }
    const colour = reference ? '#f5f5f5' : '#70efc9';
    return `<g transform="translate(${position.map(n => n.toFixed(2)).join(' ')}) rotate(${angle}) scale(${reference ? 1.25 : 0.8})">
      <path d="M-8 -4 H-2 L2 -3 H5 L9 0 L5 3 H2 L-2 4 H-8 Z" fill="${colour}" stroke="#1c2c34" stroke-width="1.5"/>
      <path d="M0 -2 V2" stroke="#18382f" stroke-width="2"/></g>`;
  }

  LearnSandbox.mount({
    title: 'Racing lines and apex geometry',
    replay: {label: 'ghost race', rewind: true, input: () => 'elapsed'},
    intro: 'Move the clipping point around a hairpin. Compare the time from the approach to the end of the next straight against an early apex.',
    controls: [
      {id:'apex', label:'Apex position through the turn', min:30, max:70, step:1, value:30, unit:'%'},
      {id:'straight', label:'Following straight', min:50, max:500, step:25, value:200, unit:'m'},
      {id:'elapsed', label:'Replay clock', min:0, max:24, step:0.1, value:0, unit:'s'}
    ],
    challenge:'On a straight of at least 300 m, gain 0.70 s over the early-apex reference.',
    sources:[['Driver61 · The racing line', 'https://driver61.com/uni/racing-line/'],
      ['SAE · Combined cornering and braking', 'https://doi.org/10.4271/2011-01-0094']],
    evaluate({apex, straight, elapsed = 3}) {
      const run = simulate(apex / 100, straight), reference = simulate(0.3, straight);
      const gain = reference.time - run.time;
      const [x,y] = project(run.points[61]);
      const success = straight >= 300 && gain >= 0.70;
      const svg = `<rect width="600" height="240" fill="#18382f"/>
        <path d="M0 200 H348 A80 80 0 0 0 348 40 H0" fill="none" stroke="#dad9cc" stroke-width="38"/>
        <path d="M0 200 H348 A80 80 0 0 0 348 40 H0" fill="none" stroke="#38424b" stroke-width="34"/>
        <path d="${path(run.points)}" fill="none" stroke="#70efc9" stroke-width="3"/>
        <path d="${path(reference.points)}" fill="none" stroke="#eee" stroke-width="2" stroke-dasharray="5 4"/>
        <circle cx="${x}" cy="${y}" r="5" fill="#ffcc76" stroke="#151e22"/>
        <path d="M${straightFinish} 19V40" stroke="#d9e8df" stroke-width="3"/>
        ${ghost(reference, elapsed, true)}${ghost(run, elapsed, false)}
        <g fill="#edf5f4" font-family="system-ui" font-size="14">
        <text x="20" y="205">Entry →</text><text x="35" y="51">← Exit straight · ${straight} m</text>
        <text x="30" y="102" fill="#70efc9">Solid · your line</text>
        <text x="30" y="125">Dashed · early reference</text>
        <text x="30" y="148" fill="#ffcc76">Dot · apex</text>
        </g>`;
      return {svg, replayEnd: Math.ceil(Math.max(run.time, reference.time) * 10) / 10,
        metrics:[['Common entry', Math.round(run.limits[0] * 3.6) + ' km/h'], ['Exit speed', Math.round(run.exit * 3.6) + ' km/h'],
          ['Approach to apex', run.clock[61].toFixed(2) + ' s'], ['Approach to turn exit', run.clock.at(-1).toFixed(2) + ' s'],
          ['Sector time', run.time.toFixed(2) + ' s'], ['Time vs early apex', signed(-gain) + ' s']],
        explanation:'Both ghosts start at a common speed. Curvature uses part of a simplified combined tyre-force budget and leaves a smaller share for accelerating or braking. The exit straight is compressed on screen. The replay ends at the slower car’s finish.',
        success, feedback:success ? 'You traded some entry speed for a faster sector.' : straight < 300 ? 'Lengthen the following straight to run the challenge.' : 'Move the apex and watch the sector delta. The largest exit speed may carry an entry-time cost.'};
    }
  });
})();
