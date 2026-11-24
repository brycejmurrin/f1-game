(() => {
  'use strict';

  const laneOffset = {rubber:0, textured:18, puddle:36};
  const laneNames = {rubber:'Rubbered groove', textured:'Textured strip', puddle:'Outer depression'};
  const center = x => 123 - 28 * Math.sin((x - 70) / 107);
  function trace(offset) {
    const coords = [];
    for (let x = 0; x <= 400; x += 4) {
      const laneBlend = Math.sin(Math.PI * x / 400) ** 2;
      coords.push(x + ' ' + (center(x) + offset * laneBlend).toFixed(2));
    }
    return 'M' + coords.join(' L');
  }

  LearnSandbox.mount({
    title:'Wet lines and aquaplaning',
    intro:'Three lines cross the same bend. The usual groove is rubbered in, a strip beside it has exposed texture, and water collects along the outer edge.',
    controls:[
      {id:'line', label:'Line through the bend', options:Object.entries(laneNames), value:'rubber'},
      {id:'tyre', label:'Tyre', options:[['slick','Slick'],['inter','Intermediate'],['wet','Full wet']], value:'inter'},
      {id:'water', label:'Water in outer puddle', min:0, max:7, step:0.5, value:4, unit:'mm'},
      {id:'speed', label:'Corner speed', min:70, max:170, step:5, value:125, unit:'km/h'}
    ],
    challenge:'With at least 4 mm in the puddle, carry 125 km/h or more with at least 10% grip in reserve and low water-lift risk.',
    sources:[
      ['Pirelli · Intermediate and full wet tyres', 'https://www.pirelli.com/tires/en-us/motorsport/car/formula-1'],
      ['Formula 1 · Timo Glock on grip off the racing line', 'https://www.formula1.com/en/latest/article/f1-classic-onboard-glock-brazil-2008-final-lap.4LNMAO7WxtLnE38uvEURtg']
    ],
    evaluate({line, tyre, water, speed}) {
      // Relative water-lift index for this teaching scenario; coefficients are illustrative.
      const depth = water * {rubber:0.35, textured:0.22, puddle:1}[line];
      const liftIndex = (speed / 140) ** 2 * depth / {slick:0.7, inter:2.8, wet:5}[tyre];
      const wetness = 1 - Math.exp(-2.5 * depth);
      const drySurface = {rubber:1.52, textured:1.28, puddle:1.18}[line];
      const wetSurface = line === 'rubber' ? 0.80 : 1.20;
      const surfaceGrip = drySurface + (wetSurface - drySurface) * wetness;
      const dryTyre = {slick:1, inter:0.88, wet:0.73}[tyre];
      const dampTyre = {slick:0.75, inter:1, wet:0.93}[tyre];
      const tyreGrip = dryTyre + (dampTyre - dryTyre) * wetness;
      const available = surfaceGrip * tyreGrip * (1 - Math.min(0.82, liftIndex * 0.30));
      const demand = (speed / 3.6) ** 2 / (130 * 9.81);
      const reserve = 100 * (1 - demand / available);
      const risk = liftIndex >= 0.85 ? 'High' : liftIndex >= 0.40 ? 'Elevated' : 'Low';
      const success = water >= 4 && speed >= 125 && reserve >= 10 && risk === 'Low';
      const offset = laneOffset[line];
      const markerY = center(200) + offset;
      const puddleRadius = water === 0 ? 0 : 4 + water;
      const waterBand = depth === 0 ? 0 : 3 + 3 * depth;
      const svg = `<rect width="600" height="240" fill="#193331"/>
        <path d="${trace(0)}" stroke="#b9c6bf" stroke-width="105" fill="none"/>
        <path d="${trace(0)}" stroke="#42505a" stroke-width="101" fill="none"/>
        <path d="${trace(0)}" stroke="#242c34" stroke-width="12" fill="none"/>
        <ellipse cx="200" cy="${center(200)+36}" rx="40" ry="${puddleRadius}" fill="#519bb2" stroke="#a5d9e8"/>
        <path d="${trace(offset)}" fill="none" stroke="#ffcf68" stroke-width="3" stroke-dasharray="7 3"/>
        <g transform="translate(200 ${markerY}) rotate(-5)"><rect x="-11" y="-6" width="22" height="12" rx="3" fill="#ffd476" stroke="#242c34"/><rect x="-2" y="-4" width="6" height="8" rx="2" fill="#263842"/></g>
        <rect x="402" width="198" height="240" fill="#172832"/>
        <g font-family="system-ui" font-size="14" fill="#f1f7f6">
        <text x="16" y="25">${laneNames[line]} →</text><text x="16" y="217" fill="#c1ecfa">${water > 0 ? 'Blue pool · standing water' : 'Dry track · no standing water'}</text>
        <text x="419" y="39">Water at the tyre</text><text x="419" y="202">${depth.toFixed(1)} mm on this line</text></g>
        <rect x="417" y="154" width="166" height="12" fill="#81878a"/>
        <rect x="417" y="${154-waterBand}" width="166" height="${waterBand}" fill="#5ba7c1"/>
        <path d="M468 83 Q468 73 478 73 H522 Q532 73 532 83 V131 Q532 ${152-Math.min(12, liftIndex * 7)} 517 ${152-Math.min(12, liftIndex * 7)} H483 Q468 ${152-Math.min(12, liftIndex * 7)} 468 131 Z" fill="#293238" stroke="#aabcc4" stroke-width="2"/>
        <path d="M478 96 l10 8 m-10 6 10 8 m34 -22 -10 8 m10 6 -10 8" fill="none" stroke="${{wet:'#76b5ff', inter:'#78dba0', slick:'none'}[tyre]}" stroke-width="4"/>`;
      return {svg, metrics:[['Water on line', depth.toFixed(1) + ' mm'], ['Grip reserve', Math.round(reserve) + '%'], ['Water-lift risk', risk]],
        explanation: (water === 0 ? 'Dry rubber gives the usual groove an advantage. Slicks put the most rubber on the asphalt.' :
          'Water reduces grip on the rubbered groove. Exposed texture can help, but deeper water increases lift. Intermediates balance contact and drainage on damp asphalt. Full wets shed more standing water.') +
          ' This illustrative 130 m bend compares lateral demand to available grip. Negative reserve means demand exceeds grip.',
        success, feedback:success ? 'The textured strip gives enough grip at this speed while keeping water-lift risk low.' :
          water < 4 ? 'Raise the puddle depth to at least 4 mm.' : speed < 125 ? 'Bring speed to at least 125 km/h and compare the three lines.' :
          risk !== 'Low' ? 'Seek shallower water, change tyre, or trim speed.' : 'Compare the rubbered groove with the textured strip and watch the grip reserve.'};
    }
  });
})();
