(() => {
  'use strict';

  const motorColour = '#319bcc';
  const discColour = '#eb9453';
  const scale = 500 / 2400;
  function torqueBar(y, label, motor, disc, demand) {
    const targetX = 48 + demand * scale;
    return `<text x="48" y="${y - 8}" fill="currentColor" font-size="16">${label}</text>
      <rect x="48" y="${y}" width="500" height="25" fill="currentColor" opacity=".1"/>
      <rect x="48" y="${y}" width="${motor * scale}" height="25" fill="${motorColour}"/>
      <rect x="${48 + motor * scale}" y="${y}" width="${disc * scale}" height="25" fill="${discColour}"/>
      <path d="M${targetX} ${y - 4}v33" stroke="currentColor" stroke-width="3"/> `;
  }

  function cornerExit({ demand, retained, response }) {
    // A step in pedal demand, a first-order boost response, and a finite motor reserve.
    const capacity = 0.65 * demand * retained / 100;
    const engine = t => demand * (1 - 0.65 * Math.exp(-t / 0.55));
    const assisted = t => engine(t) + Math.min(capacity, demand - engine(t));
    const enabled = response === 'fill';
    const delivered = enabled ? assisted : engine;
    const pickupEngine = Math.round(engine(0));
    const pickupMotor = Math.round(delivered(0)) - pickupEngine;
    const missing = demand - pickupEngine - pickupMotor;
    function plot(left, label, torque) {
      const samples = [];
      for (let i = 0; i <= 50; i++) {
        const x = left + i * 4.7;
        const y = 184 - (torque(i / 25) / 2400) * 125;
        samples.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      const targetY = 184 - demand / 2400 * 125;
      return `<text x="${left}" y="31">${label}</text>
        <path d="M${left} 45v139h235" stroke="currentColor" opacity=".45" fill="none"/>
        <path d="M${left} ${targetY}h235" stroke="currentColor" stroke-dasharray="4 4" opacity=".55"/>
        <polyline points="${samples.join(' ')}" stroke="${torque === engine ? discColour : motorColour}" stroke-width="4" fill="none"/>
        <text x="${left}" y="207">0 s</text><text x="${left + 235}" y="207" text-anchor="end">2 s</text>`;
    }
    return {
      svg: `<g fill="currentColor" font-family="system-ui,sans-serif" font-size="15">
        ${plot(35, 'Engine alone', engine)}
        ${plot(325, enabled ? 'Engine + MGU-K' : 'Selected · assist off', delivered)}
        <text x="300" y="231" text-anchor="middle">Dashed line = requested axle torque · full scale 2,400 N·m</text></g>`,
      metrics: [['Engine at throttle pickup', pickupEngine + ' N·m'], ['Motor at pickup', pickupMotor + ' N·m'], ['Initial shortfall', missing + ' N·m']],
      explanation: 'The 2026 power unit has no MGU-H to spin the turbo. After the throttle opens, exhaust flow rebuilds boost. The MGU-K can add drive torque while boost rises. These traces assume a fixed gear, good traction and a replenished battery. The motor tapers as the engine catches up. Available energy, deployment limits and tyre grip constrain usable torque on track.',
      success: enabled && missing === 0,
      feedback: missing === 0 ? 'Electrical torque covers the initial shortfall and tapers as boost builds.' : 'Enable torque compensation and raise the available motor share until the selected trace reaches the request at throttle pickup.'
    };
  }

  LearnSandbox.mount({
    title: 'Rear brake blending and torque fill',
    intro: 'Compare two moments at one corner. On entry, the rear discs replace fading electrical braking. At the exit, the electric motor fills a gap in engine torque as the turbo spools.',
    controls: [
      { id: 'scenario', label: 'Corner phase', value: 'entry', options: [['entry', 'Entry · brake blending'], ['exit', 'Exit · torque fill']] },
      { id: 'demand', label: 'Requested axle torque', min: 800, max: 2400, step: 100, value: 1800, unit: 'N·m' },
      { id: 'retained', label: 'Available motor share', min: 0, max: 100, step: 5, value: 50, unit: '%' },
      { id: 'response', label: 'Torque compensation', value: 'hold', options: [['hold', 'Off · uncompensated'], ['fill', 'On · fill shortfall']] }
    ],
    challenge: 'On entry, keep the requested torque with 25% or less of the original motor braking available. On exit, meet the request from throttle pickup. Check each phase separately.',
    sources: [
      ['Mercedes-AMG F1 · How the rear brakes blend torque', 'https://www.mercedesamgf1.com/news/formula-one-brake-systems-explained'],
      ['Formula 1 · Turbo response after removal of the MGU-H', 'https://www.formula1.com/en/latest/article/explained-why-race-starts-will-be-different-in-2026.7ADR4zkfl299T7i3ZYVTYK'],
      ['FIA · Electrical deployment in acceleration zones', 'https://www.fia.com/news/refinements-2026-fia-formula-1-regulations-agreed-all-stakeholders'],
      ['Mercedes-AMG F1 · 2026 W17 technical specifications', 'https://www.mercedesamgf1.com/f1-w17-2026-technical-specifications']
    ],
    evaluate(state) {
      if (state.scenario === 'exit') return cornerExit(state);
      const { demand, retained, response } = state;
      const initialMotor = Math.round(demand * 0.6);
      const initialDisc = demand - initialMotor;
      const motor = Math.round(initialMotor * retained / 100);
      const disc = response === 'fill' ? demand - motor : initialDisc;
      const missing = demand - motor - disc;
      const success = retained <= 25 && missing === 0;
      const svg = `<g font-family="system-ui, sans-serif">
        <text x="48" y="30" fill="${motorColour}" font-size="15">■ Motor braking</text>
        <text x="220" y="30" fill="${discColour}" font-size="15">■ Disc braking</text>
        <text x="393" y="30" fill="currentColor" font-size="15">┃ Pedal request</text>
        ${torqueBar(76, 'Before harvest fades', initialMotor, initialDisc, demand)}
        ${torqueBar(148, 'After harvest fades', motor, disc, demand)}
        <path d="M48 191h500" stroke="currentColor" opacity=".4"/>
        <g fill="currentColor" font-size="14"><text x="48" y="215">0</text>
        <text x="548" y="215" text-anchor="end">2,400 N·m rear-axle torque</text></g>
      </g>`;
      return {
        svg,
        metrics: [['Motor after fade', `${motor} N·m`], ['Discs after fade', `${disc} N·m`], ['Torque shortfall', `${missing} N·m`]],
        explanation: `The motor initially supplies 60% of this illustrative rear-axle request. After harvesting changes, the rear discs ${response === 'fill' ? 'add ' + (disc - initialDisc) + ' N·m to cover the lost motor torque' : 'stay at their initial torque of ' + initialDisc + ' N·m'}. This snapshot assumes adequate disc capacity and omits engine braking and control delays.`,
        success,
        feedback: success ? 'The disc torque rose by exactly the amount the motor lost.' : missing > 0 ? 'The blank space before the pedal marker is missing brake torque. Try brake-by-wire fill.' : 'Reduce the retained motor braking to 25% or less and watch the disc contribution.'
      };
    }
  });
})();
