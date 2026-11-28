(() => {
  'use strict';

  const laneOffset = {rubber:0, textured:18, puddle:36};
  const laneNames = {rubber:'Rubbered groove', textured:'Textured strip', puddle:'Outer depression'};
  const filmFactor = {rubber:1.1, textured:.6, puddle:.75};
  const poolFactor = {rubber:.13, textured:.10, puddle:1};
  const drainage = {slick:.7, inter:2.8, wet:5};
  const center = x => 123 - 28 * Math.sin((x - 70) / 107);
  const lineY = (x, offset) => center(x) + offset * Math.sin(Math.PI * x / 400) ** 2;
  function trace(offset) {
    const coords = [];
    for (let x = 0; x <= 400; x += 4) {
      coords.push(x + ' ' + lineY(x, offset).toFixed(2));
    }
    return 'M' + coords.join(' L');
  }

  LearnSandbox.mount({
    title:'Wet lines and aquaplaning',
    replay: {label: 'wet corner', initial: .5},
    intro:'Three lines cross the same bend. The usual groove is rubbered in, a strip beside it has exposed texture, and water collects along the outer edge.',
    inGame: "With mixed weather, Apex can wet one part of the circuit before another. Local wetness, tread and speed determine how much grip you lose, with slicks aquaplaning earlier than wets. The lab isolates thin film and pooled water to show how those conditions affect a real tyre.",
    key:'Yellow dashes show the intended line and white dashes mark paint. Blue shows standing water. The cutaway follows the car and reports film and pool depth separately.',
    presets:[
      ['Las Vegas · Wet (illustrative)', {line:'textured', tyre:'wet', water:5.5, film:1.2, speed:125}],
      ['Las Vegas · Drying (illustrative)', {line:'rubber', tyre:'inter', water:3, film:.2, speed:125}],
    ],
    controls:[
      {id:'line', primary: true, label:'Line through the bend', options:Object.entries(laneNames), value:'rubber'},
      {id:'tyre', primary: true, label:'Tyre', options:[['slick','Slick'],['inter','Intermediate'],['wet','Full wet']], value:'inter'},
      {id:'water', label:'Water in outer puddle', min:0, max:7, step:0.5, value:4, unit:'mm'},
      {id:'film', label:'Surface water film', min:0, max:2, step:0.1, value:.8, unit:'mm'},
      {id:'speed', label:'Corner speed', min:70, max:170, step:5, value:125, unit:'km/h'}
    ],
    challenge:'With at least 4 mm in the puddle, carry 125 km/h or more with at least 10% grip in reserve and low water-lift risk throughout the bend.',
    sources:[
      ['Pirelli · Intermediate and full wet tyres', 'https://www.pirelli.com/tires/en-us/motorsport/car/formula-1'],
      ['Pirelli · Wet-to-damp crossover in Las Vegas', 'https://press.pirelli.com/wet-las-vegas-russell-leads-the-way-on-intermediates/'],
      ['NASA · Thin-film and standing-water hydroplaning', 'https://ntrs.nasa.gov/api/citations/19640000612/downloads/19640000612.pdf'],
      ['Formula 1 · Timo Glock on grip off the racing line', 'https://www.formula1.com/en/latest/article/f1-classic-onboard-glock-brazil-2008-final-lap.4LNMAO7WxtLnE38uvEURtg']
    ],
    evaluate({line, tyre, water, film, speed}) {
      // Relative water-lift index for this teaching scenario; coefficients are illustrative.
      const surfaceFilm = film * filmFactor[line];
      const bulkAt = phase => water * poolFactor[line] * Math.sin(Math.PI * phase) ** 4;
      const drySurface = {rubber:1.52, textured:1.28, puddle:1.18}[line];
      const wetSurface = line === 'rubber' ? 0.80 : 1.20;
      const dryTyre = {slick:1, inter:0.88, wet:0.73}[tyre];
      const dampTyre = {slick:0.75, inter:1, wet:0.93}[tyre];
      const demand = (speed / 3.6) ** 2 / (130 * 9.81);
      function measure(bulk) {
        const liftIndex = (speed / 140) ** 2 * (bulk + .15 * surfaceFilm) / drainage[tyre];
        const wetness = 1 - Math.exp(-2.5 * (surfaceFilm + bulk));
        const surfaceGrip = drySurface + (wetSurface - drySurface) * wetness;
        const tyreGrip = dryTyre + (dampTyre - dryTyre) * wetness;
        const available = surfaceGrip * tyreGrip * (1 - Math.min(.82, liftIndex * .30));
        return {liftIndex, reserve: 100 * (1 - demand / available),
          risk: liftIndex >= .85 ? 'High' : liftIndex >= .40 ? 'Elevated' : 'Low'};
      }
      // Contact grip and lift can change in opposite directions on the textured strip.
      const samples = Array.from({length: 101}, (_, i) => measure(bulkAt(i / 100)));
      const minimum = Math.min(...samples.map(point => point.reserve));
      const risk = measure(bulkAt(.5)).risk;
      const success = water >= 4 && speed >= 125 && minimum >= 10 && risk === 'Low';
      const offset = laneOffset[line];
      const puddleRadius = water === 0 ? 0 : 4 + water;
      const svg = `<rect width="600" height="240" fill="#193331"/>
        <path d="${trace(0)}" stroke="#b9c6bf" stroke-width="105" fill="none"/>
        <path d="${trace(0)}" stroke="#42505a" stroke-width="101" fill="none"/>
        <path d="${trace(0)}" stroke="${film <= .2 ? '#242c34' : '#344957'}" stroke-width="12" fill="none"/>
        <path d="M70 ${center(70)-43}l9 15 M90 ${center(90)-43}l9 15 M110 ${center(110)-43}l9 15" fill="none" stroke="#dce8e4" stroke-width="3"/>
        <ellipse cx="200" cy="${center(200)+36}" rx="40" ry="${puddleRadius}" fill="#519bb2" stroke="#a5d9e8"/>
        <path d="${trace(offset)}" fill="none" stroke="#ffcf68" stroke-width="3" stroke-dasharray="7 3"/>
        <rect x="402" width="198" height="240" fill="#172832"/>
        <g font-family="system-ui" font-size="14" fill="#f1f7f6">
        <text x="16" y="25">${laneNames[line]} →</text><text x="16" y="217" fill="#c1ecfa">${water > 0 ? 'Blue pool · standing water' : film > 0 ? 'Thin film across the track' : 'Dry track'}</text>
        <text x="419" y="39">Water at the tyre</text></g>`;
      function cutaway(bulk, liftIndex) {
        const waterBand = Math.max(surfaceFilm > 0 ? 2 : 0, 3 * (surfaceFilm + bulk));
        const tyreBottom = 153 - Math.min(16, liftIndex * 9);
        return `<rect x="417" y="154" width="166" height="12" fill="#81878a"/>
        <rect x="417" y="${154-waterBand}" width="166" height="${waterBand}" fill="#5ba7c1"/>
        <path d="M468 83 Q468 73 478 73 H522 Q532 73 532 83 V131 Q532 ${tyreBottom} 517 ${tyreBottom} H483 Q468 ${tyreBottom} 468 131 Z" fill="#293238" stroke="#aabcc4" stroke-width="2"/>
        <path d="M478 96 l10 8 m-10 6 10 8 m34 -22 -10 8 m10 6 -10 8" fill="none" stroke="${{wet:'#76b5ff', inter:'#78dba0', slick:'none'}[tyre]}" stroke-width="4"/>
        <g fill="#f1f7f6" font-size="14"><text x="419" y="192">${surfaceFilm.toFixed(2)} mm film</text>
        <text x="419" y="215">${bulk.toFixed(2)} mm pooled here</text></g>`;
      }
      return {svg,
        replay(progress) {
          const x = 18 + progress * 364;
          const y = lineY(x, offset);
          const heading = Math.atan2(lineY(x + 1, offset) - lineY(x - 1, offset), 2) * 180 / Math.PI;
          const bulk = bulkAt(progress);
          const localDepth = surfaceFilm + bulk;
          const local = measure(bulk);
          const spray = Math.min(23, localDepth * speed / 35);
          const limited = local.reserve < 0;
          const liftWarning = local.risk === 'High';
          return {svg: `${cutaway(bulk, local.liftIndex)}<g transform="translate(${x} ${y}) rotate(${heading})">
            <path d="M-8 -4 q-${spray / 2} -2 -${spray} -${spray / 2} M-8 4 q-${spray / 2} 2 -${spray} ${spray / 2}"
              fill="none" stroke="#a5d9e8" stroke-width="2" stroke-opacity="${Math.min(.9, localDepth)}"/>
            <rect x="-11" y="-6" width="22" height="12" rx="3" fill="#ffd476" stroke="#242c34"/>
            <rect x="-2" y="-4" width="6" height="8" rx="2" fill="#263842"/>
            ${limited ? `<circle cx="0" cy="0" r="${local.risk === 'High' ? 21 : 17}" fill="none" stroke="#ff8f7a" stroke-width="3" stroke-dasharray="3 3"/>` : ''}
          </g>${limited ? '<text x="20" y="48" fill="#ffb8a8" font-size="13">Over grip limit · intended path shown</text>' : ''}
          ${liftWarning ? '<text x="20" y="66" fill="#ffe694" font-size="13">High water-lift risk</text>' : ''}`,
          readout: surfaceFilm.toFixed(2) + ' mm film · ' + bulk.toFixed(2) + ' mm pooled · ' +
            Math.round(local.reserve) + '% grip reserve · ' + local.risk.toLowerCase() + ' water-lift risk'};
        },
        metrics:[['Water on line at apex', (surfaceFilm + bulkAt(.5)).toFixed(1) + ' mm'],
          ['Minimum grip reserve', Math.floor(minimum) + '%'], ['Peak water-lift risk', risk]],
        explanation: (water === 0 && film === 0 ? 'Dry rubber gives the usual groove an advantage. Slicks put the most rubber on the asphalt.' :
          'Water reduces grip on the rubbered groove. Exposed texture can help, but deeper water increases lift. Intermediates balance contact and drainage on damp asphalt. Full wets shed more standing water.') +
          ' Thin film lowers contact grip, especially on polished rubber. Standing water adds lift as speed rises, and tread helps drain it. Las Vegas presets illustrate the shift toward a drying line with pools still present. Painted markings are a visual reference. Negative reserve means the car cannot hold the intended path at this speed.',
        success, feedback:success ? 'This setup keeps at least 10% grip in reserve and low water-lift risk throughout the bend.' :
          water < 4 ? 'Raise the puddle depth to at least 4 mm.' : speed < 125 ? 'Bring speed to at least 125 km/h and compare the three lines.' :
          risk !== 'Low' ? 'Seek shallower water, change tyre, or trim speed.' : 'Scrub the replay to find the weakest part of the bend, then compare the lines and tyres.'};
    }
  });
})();
// TRY IT IN THE CAR: Wet Weather Lines (js/learn-drills/rain-groove.js); BACK TO LESSON posts its last run beside the button.
if (typeof LearnAppearance !== "undefined") LearnAppearance.drill?.("rain", "Wet Weather Lines");
