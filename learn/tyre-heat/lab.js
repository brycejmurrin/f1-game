(() => {
  'use strict';

  const lower = 90;
  const upper = 105;
  const surfaceColour = '#e58342';
  const coreColour = '#368ec7';
  const y = temperature => 189 - (temperature - 40) * 1.55;
  const x = seconds => 58 + seconds * (325 / 90);

  // Temperatures advance together from the previous second's two readings.
  function runStint(sliding, load, elapsed, trackTemp) {
    let surface = 70;
    let core = 70;
    let grain = 0;
    let blister = 0;
    const surfacePoints = [];
    const corePoints = [];
    for (let second = 0; second <= elapsed; second++) {
      surfacePoints.push(`${x(second).toFixed(1)},${y(surface).toFixed(1)}`);
      corePoints.push(`${x(second).toFixed(1)},${y(core).toFixed(1)}`);
      if (second === elapsed) break;
      const transfer = 0.035 * (surface - core);
      const surfaceChange = 0.55 + 0.015 * sliding + 0.003 * load - transfer
        - 0.014 * (surface - trackTemp) - 0.004 * (surface - 24);
      const coreChange = 0.005 * load + 0.18 * transfer - 0.003 * (core - 24);
      // Cool sliding can roughen the tread. Sustained internal overheating causes lasting damage.
      const coldSliding = Math.max(0, 85 - surface) * Math.max(0, sliding - 40) / 7500;
      grain = Math.min(1, Math.max(0, grain + coldSliding - (surface > lower ? 0.012 : 0)));
      blister = Math.min(1, blister + Math.max(0, core - upper) * 0.018);
      surface += surfaceChange;
      core += coreChange;
    }
    return { surface, core, grain, blister, surfacePoints, corePoints };
  }

  LearnSandbox.mount({
    title: 'Tyre thermal science',
    replay: {label: 'compressed thermal run', rewind: true, input: () => 'elapsed'},
    key: 'Time is in seconds and temperature is in °C. The shaded target is illustrative. Thin comparison traces share the selected workload on the other asphalt.',
    intro: 'A tyre can feel hot at the tread while the rubber beneath it is still cool. Compare how sliding and repeated loading heat the surface and core over a 90-second run.',
    controls: [
      { id: 'track', primary: true, label: 'Track surface', value: 'cold', options: [['cold', 'Cold night · 15 °C'], ['hot', 'Hot track · 50 °C']] },
      { id: 'sliding', label: 'Sliding intensity', min: 0, max: 100, step: 5, value: 80, unit: '%' },
      { id: 'load', label: 'Cornering workload', min: 0, max: 100, step: 5, value: 35, unit: '%' },
      { id: 'elapsed', primary: true, label: 'Time into run', min: 0, max: 90, step: 1, value: 0, unit: 's' }
    ],
    challenge: 'At the end of the run, put both temperatures inside the illustrative 90–105 °C target band. Change one heat source at a time.',
    sources: [
      ['Pirelli · Understanding the tyre working window', 'https://www.pirelli.com/global/en-ww/race/racingspot/seeing-through-the-window-50931/'],
      ['Pirelli · Cold sliding and graining', 'https://press.pirelli.com/review---2013-official-formula-one-test-in-barcelona/'],
      ['Pirelli · Heat and blister formation', 'https://press.pirelli.com/a-hot-summer-of-formula-1-gets-underway-in-austria/'],
      ['Pirelli · How sliding heats the tread', 'https://press.pirelli.com/in-bahrain-with-prior-knowledge/'],
      ['Pirelli · Cool asphalt and graining in Las Vegas', 'https://press.pirelli.com/the-night-time-challenge-of-las-vegas']
    ],
    evaluate({ track, sliding, load, elapsed }) {
      const coldTrack = track === 'cold';
      const trackTemp = coldTrack ? 15 : 50;
      const otherTemp = coldTrack ? 50 : 15;
      const other = runStint(sliding, load, elapsed, otherTemp);
      const { surface, core, grain, blister, surfacePoints, corePoints } = runStint(sliding, load, elapsed, trackTemp);
      const inBand = t => t >= lower && t <= upper;
      const success = elapsed === 90 && inBand(surface) && inBand(core);
      const labels = [40, 65, 90, 105, 130].map(t => `<text x="50" y="${y(t) + 5}" text-anchor="end">${t}</text>`).join('');
      const grains = Math.ceil(grain * 9);
      const blisters = Math.ceil(blister * 6);
      const grainMarks = Array.from({ length: grains }, (_, i) =>
        `<path d="M${428 + i * 15} 103q5 -9 10 0" fill="${surfaceColour}"/>`).join('');
      const blisterMarks = Array.from({ length: blisters }, (_, i) =>
        `<ellipse cx="${437 + i * 23}" cy="114" rx="8" ry="4" fill="none" stroke="${coreColour}" stroke-width="2"/>`).join('');
      const svg = `<g font-family="system-ui, sans-serif" font-size="14" fill="currentColor">
        <text x="21" y="26">°C</text>
        <text x="85" y="26" fill="${surfaceColour}">━ Tread surface</text>
        <text x="262" y="26" fill="${coreColour}">┄ Tyre core</text>
        <rect x="58" y="${y(upper)}" width="325" height="${y(lower) - y(upper)}" fill="#699969" opacity=".27"/>
        ${labels}
        <path d="M58 43v146h325" stroke="currentColor" fill="none" opacity=".4"/>
        <polyline points="${other.surfacePoints.join(' ')}" stroke="${surfaceColour}" stroke-width="2" stroke-dasharray="2 4" opacity=".75" fill="none"/>
        <polyline points="${other.corePoints.join(' ')}" stroke="${coreColour}" stroke-width="2" stroke-dasharray="9 4 2 4" opacity=".75" fill="none"/>
        <polyline points="${surfacePoints.join(' ')}" stroke="${surfaceColour}" stroke-width="4" fill="none"/>
        <polyline points="${corePoints.join(' ')}" stroke="${coreColour}" stroke-width="4" stroke-dasharray="8 4" fill="none"/>
        <circle cx="${x(elapsed)}" cy="${y(surface)}" r="5" fill="${surfaceColour}"/>
        <circle cx="${x(elapsed)}" cy="${y(core)}" r="4" fill="${coreColour}"/>
        <text x="58" y="216">0 s</text><text x="${x(45)}" y="216" text-anchor="middle">45 s</text>
        <text x="383" y="216" text-anchor="end">90 s</text>
        <text x="424" y="72">Tread section</text>
        <text x="420" y="207" font-size="12">Thin · ${otherTemp} °C asphalt</text>
        <text x="420" y="224" font-size="11">Dots · tread / Dash-dot · core</text>
        <text x="62" y="${y(upper) - 6}" font-size="11">Illustrative target</text>
        <rect x="423" y="103" width="151" height="31" fill="currentColor" opacity=".16"/>
        <path d="M423 103h151" stroke="currentColor" stroke-width="2"/>
        ${grainMarks}${blisterMarks}
        <text x="424" y="161">Graining · ${grains ? 'present' : 'clear'}</text>
        <text x="424" y="183">Blisters · ${blisters ? 'present' : 'clear'}</text></g>`;
      let feedback = 'Both layers are in range. Move time to the end to check whether they stay there.';
      if (success) feedback = 'The tread and core both finish inside the illustrative working band.';
      else if (surface > upper) feedback = 'The tread is too hot. Reduce sliding and compare the surface trace.';
      else if (core > upper) feedback = 'The core is too hot. Reduce the sustained cornering workload.';
      else if (core < lower || surface < lower) feedback = 'Advance time or raise the sustained workload. Watch how slowly the core responds.';
      return {
        svg,
        metrics: [['Tread surface', `${surface.toFixed(1)} °C`], ['Tyre core', `${core.toFixed(1)} °C`], [`${otherTemp} °C track · tread`, `${other.surface.toFixed(1)} °C`], [`${otherTemp} °C track · core`, `${other.core.toFixed(1)} °C`]],
        explanation: `Cold sliding tears rubber into grains on the tread. Those ridges can wear away once warm. Excess heat beneath the tread can separate rubber into blisters and leave lasting pits. The cutaway shows ${grains ? 'raised grains' : 'a smooth surface'} and ${blisters ? 'subsurface blisters' : 'intact inner layers'}. At ${elapsed} s the comparison uses the same inputs on ${otherTemp} °C asphalt. Cooler asphalt draws heat out of the tread faster. Both runs start at 70 °C with air held at 24 °C. Its working band, heating rates and damage thresholds are illustrative.`,
        success,
        feedback
      };
    }
  });
})();
