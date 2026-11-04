/*
 * Match conditions: formats & phases (with fielding restrictions), pitch
 * types, environment, bowler types, batter profiles, bowling plans, shots.
 * All shot angles are in the batter-relative frame (see core.js).
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;

  // ---------------- formats & phases ----------------
  // maxOut = max fielders outside the 30-yard circle (null = no limit).
  // aggression: 0 (survive) .. 1 (all-out attack). wicketValue: runs a wicket is "worth".
  const FORMATS = {
    T10: {
      name: 'T10',
      phases: {
        powerplay: { name: 'Powerplay (overs 1–2)', short: 'Powerplay', maxOut: 2, aggression: 0.85, wicketValue: 6, powerplay: true },
        middle: { name: 'Middle overs (3–7)', short: 'Middle', maxOut: 5, aggression: 0.82, wicketValue: 5, powerplay: false },
        death: { name: 'Death overs (8–10)', short: 'Death', maxOut: 5, aggression: 1.0, wicketValue: 4, powerplay: false },
      },
    },
    T20: {
      name: 'T20',
      phases: {
        powerplay: { name: 'Powerplay (overs 1–6)', short: 'Powerplay', maxOut: 2, aggression: 0.68, wicketValue: 10, powerplay: true },
        middle: { name: 'Middle overs (7–15)', short: 'Middle', maxOut: 5, aggression: 0.6, wicketValue: 9, powerplay: false },
        death: { name: 'Death overs (16–20)', short: 'Death', maxOut: 5, aggression: 0.97, wicketValue: 6, powerplay: false },
      },
    },
    ODI: {
      name: 'ODI',
      phases: {
        powerplay: { name: 'Powerplay 1 (overs 1–10)', short: 'PP1', maxOut: 2, aggression: 0.45, wicketValue: 20, powerplay: true },
        middle: { name: 'Middle overs (11–40)', short: 'Middle', maxOut: 4, aggression: 0.32, wicketValue: 18, powerplay: false },
        death: { name: 'Death overs (41–50)', short: 'Death', maxOut: 5, aggression: 0.8, wicketValue: 10, powerplay: false },
      },
    },
    Test: {
      name: 'Test',
      phases: {
        newball: { name: 'New ball (0–20 overs)', short: 'New ball', maxOut: null, aggression: 0.08, wicketValue: 32, powerplay: false },
        oldball: { name: 'Old ball (20–80 overs)', short: 'Old ball', maxOut: null, aggression: 0.14, wicketValue: 30, powerplay: false },
        declare: { name: 'Batting for a declaration', short: 'Declaration push', maxOut: null, aggression: 0.6, wicketValue: 14, powerplay: false },
      },
    },
  };

  // ---------------- pitches ----------------
  // pace: speed off the surface; bounce; seam: edge-making for quicks; spin: turn;
  // variable: uneven bounce; slow: two-paced/grip (mistimes); ease: batting ease.
  const PITCHES = {
    balanced: { name: 'Balanced / good cricket wicket', short: 'Balanced', pace: 1, bounce: 1, seam: 1, spin: 1, variable: 1, slow: 1, ease: 1, tip: 'Even contest — standard fields work.' },
    green: { name: 'Green seamer (grass, moisture)', short: 'Green', pace: 1.05, bounce: 1.1, seam: 1.65, spin: 0.7, variable: 1.1, slow: 1, ease: 0.82, tip: 'Edges carry: invest in slips & gully, bowl the 4th-stump channel.' },
    flat: { name: 'Flat road (batting paradise)', short: 'Flat', pace: 1.0, bounce: 1.0, seam: 0.55, spin: 0.6, variable: 0.7, slow: 0.95, ease: 1.3, tip: 'Few edges: protect the boundary, save singles, defensive plans.' },
    dry: { name: 'Dry turner', short: 'Dry', pace: 0.92, bounce: 0.95, seam: 0.8, spin: 1.45, variable: 1.15, slow: 1.12, ease: 0.9, tip: 'Spin grips: bat-pad catchers and a slip earn their place.' },
    dusty: { name: 'Dusty / crumbling (day 4–5)', short: 'Dusty', pace: 0.85, bounce: 0.9, seam: 0.9, spin: 1.55, variable: 1.35, slow: 1.15, ease: 0.82, tip: 'Variable bounce: stumps-to-stumps, close catchers, LBW/bowled threat.' },
    bouncy: { name: 'Hard & bouncy (pace and carry)', short: 'Bouncy', pace: 1.22, bounce: 1.45, seam: 1.2, spin: 0.95, variable: 1.0, slow: 0.9, ease: 0.95, tip: 'Edges fly — deeper slips, gully, and short-ball traps.' },
    slow: { name: 'Slow & low (sluggish)', short: 'Slow', pace: 0.8, bounce: 0.78, seam: 0.8, spin: 1.2, variable: 1.3, slow: 1.45, ease: 0.86, tip: 'Mistimed lofts: long-on/long-off & straight catchers, cutters work.' },
    abrasive: { name: 'Abrasive / dry square (reverse swing)', short: 'Abrasive', pace: 0.93, bounce: 0.92, seam: 0.95, spin: 1.2, variable: 1.15, slow: 1.1, ease: 0.92, reverse: 1.55, tip: 'Old ball reverses: pace bowlers attack the stumps late on; straight catchers and bowled/LBW.' },
    cracked: { name: 'Cracked (uneven, late in a match)', short: 'Cracked', pace: 1.0, bounce: 1.05, seam: 1.3, spin: 1.3, variable: 1.6, slow: 1.05, ease: 0.78, tip: 'Cracks make bounce unpredictable: bowl stump-to-stump; bowled, LBW and gloved catches.' },
    damp: { name: 'Damp / sticky', short: 'Damp', pace: 0.9, bounce: 1.05, seam: 1.5, spin: 1.25, variable: 1.3, slow: 1.25, ease: 0.78, tip: 'Ball stops & seams: catchers in front and behind.' },
  };

  const OUTFIELDS = {
    slow: { name: 'Slow (heavy/long grass)', decel: 4.2 },
    average: { name: 'Average', decel: 3.1 },
    fast: { name: 'Fast', decel: 2.4 },
    lightning: { name: 'Lightning quick', decel: 1.8 },
  };
  const OVERHEAD = {
    sunny: { name: 'Sunny / clear', swing: 1 },
    overcast: { name: 'Overcast (swing)', swing: 1.45 },
    humid: { name: 'Humid', swing: 1.25 },
  };

  // ---------------- bowlers ----------------
  // turnToRH: which way stock ball turns relative to a RIGHT-handed batter.
  const BOWLERS = {
    rxf: { name: 'Right-arm express (150 km/h+)', short: 'RXF', arm: 'R', kind: 'pace', pace: 'fast', speed: 1.12, kph: 150, keeper: 'back' },
    lxf: { name: 'Left-arm express (145 km/h+)', short: 'LXF', arm: 'L', kind: 'pace', pace: 'fast', speed: 1.1, kph: 146, keeper: 'back' },
    rf: { name: 'Right-arm fast', short: 'RF', arm: 'R', kind: 'pace', pace: 'fast', speed: 1.0, kph: 140, keeper: 'back' },
    lf: { name: 'Left-arm fast', short: 'LF', arm: 'L', kind: 'pace', pace: 'fast', speed: 1.0, kph: 138, keeper: 'back' },
    rmf: { name: 'Right-arm medium-fast', short: 'RMF', arm: 'R', kind: 'pace', pace: 'medium', speed: 0.82, kph: 127, keeper: 'back' },
    lmf: { name: 'Left-arm medium-fast', short: 'LMF', arm: 'L', kind: 'pace', pace: 'medium', speed: 0.82, kph: 126, keeper: 'back' },
    rob: { name: 'Right-arm off-spin', short: 'OB', arm: 'R', kind: 'spin', spinType: 'finger', turnToRH: 'in', speed: 0.5, kph: 88, keeper: 'up' },
    lob: { name: 'Left-arm orthodox (left-arm finger/off spin)', short: 'SLA', arm: 'L', kind: 'spin', spinType: 'finger', turnToRH: 'away', speed: 0.5, kph: 87, keeper: 'up' },
    rls: { name: 'Right-arm leg-spin', short: 'LB', arm: 'R', kind: 'spin', spinType: 'wrist', turnToRH: 'away', speed: 0.47, kph: 82, keeper: 'up' },
    lls: { name: 'Left-arm wrist spin (left-arm leg spin)', short: 'LAWS', arm: 'L', kind: 'spin', spinType: 'wrist', turnToRH: 'in', speed: 0.47, kph: 80, keeper: 'up' },
  };

  /** Turn of the stock ball relative to the batter on strike: 'in' | 'away' | null (pace). */
  function turnFor(bowlerId, hand) {
    const b = BOWLERS[bowlerId];
    if (!b || b.kind !== 'spin') return null;
    if (hand === 'R') return b.turnToRH;
    return b.turnToRH === 'in' ? 'away' : 'in';
  }
  /** Pace angle: 'across' (ball angled away from the batter) | 'into'. */
  function angleFor(bowlerId, hand, overWicket) {
    const b = BOWLERS[bowlerId];
    const sameSide = b.arm === hand; // RA to RH
    let across = !sameSide; // LA over to RH angles across
    if (!overWicket) across = !across;
    return across ? 'across' : 'into';
  }

  // ---------------- batters ----------------
  // mods: multipliers on shot weights by tag; control: execution skill; power.
  const BATTERS = {
    balanced: { name: 'Balanced top-order', aggression: 1, control: 1, power: 1, placement: 2, mods: {} },
    aggressive: { name: 'Power hitter', aggression: 1.25, control: 0.92, power: 1.12, mods: { lofted: 1.5, defend: 0.7 } },
    anchor: { name: 'Anchor / accumulator', aggression: 0.75, control: 1.12, power: 0.95, placement: 3, mods: { lofted: 0.55, rotate: 1.4 } },
    offside: { name: 'Off-side player (drives & cuts)', aggression: 1, control: 1, power: 1, mods: { offside: 1.6, legside: 0.7 } },
    legside: { name: 'Leg-side player (flicks & pulls)', aggression: 1, control: 1, power: 1, mods: { legside: 1.6, offside: 0.7 } },
    shortweak: { name: 'Vulnerable to the short ball', aggression: 1, control: 1, power: 1, mods: {}, weak: { short: 2.0 } },
    sweeper: { name: 'Sweeps & reverse-sweeps spin', aggression: 1.05, control: 1.02, power: 1, mods: { sweep: 2.4 } },
    finisher: { name: 'Finisher (death-overs specialist)', aggression: 1.3, control: 1.0, power: 1.12, placement: 2, mods: { lofted: 1.4, sweep: 1.3 }, weak: { yorker: 0.75 } },
    weakspin: { name: 'Struggles against spin', aggression: 1, control: 1, power: 1, mods: { sweep: 0.6 }, vsSpin: 1.5 },
    weakpace: { name: 'Struggles against genuine pace', aggression: 1, control: 1, power: 1, mods: {}, vsPace: 1.45 },
    tail: { name: 'Lower order / tail-ender', aggression: 1.1, control: 0.7, power: 0.9, placement: 1, mods: { lofted: 1.2, defend: 1.1 } },
  };

  // ---------------- bowling plans ----------------
  // lengths: yorker, full, good, back (back of length), short (bouncer/long hop)
  // lines: wide (wide outside off), off (4th–5th stump), stumps, pads (leg/body)
  const PLANS = {
    auto: { name: 'Auto (by phase & bowler)' },
    channel: { name: '4th-stump channel', L: { yorker: 2, full: 22, good: 52, back: 18, short: 6 }, Ln: { wide: 12, off: 63, stumps: 20, pads: 5 } },
    drive: { name: 'Full & wide — invite the drive', L: { yorker: 5, full: 55, good: 30, back: 8, short: 2 }, Ln: { wide: 35, off: 50, stumps: 12, pads: 3 } },
    short: { name: 'Short-ball / bouncer barrage', L: { yorker: 2, full: 8, good: 15, back: 30, short: 45 }, Ln: { wide: 15, off: 25, stumps: 35, pads: 25 } },
    yorkers: { name: 'Yorkers & full, straight', L: { yorker: 50, full: 25, good: 10, back: 8, short: 7 }, Ln: { wide: 10, off: 20, stumps: 55, pads: 15 } },
    wide: { name: 'Wide yorker / wide line', L: { yorker: 35, full: 25, good: 15, back: 15, short: 10 }, Ln: { wide: 55, off: 30, stumps: 12, pads: 3 } },
    stumps: { name: 'Stump-to-stump (bowled/LBW)', L: { yorker: 8, full: 32, good: 45, back: 12, short: 3 }, Ln: { wide: 3, off: 22, stumps: 65, pads: 10 } },
    body: { name: 'Into the body / leg stump', L: { yorker: 5, full: 15, good: 30, back: 30, short: 20 }, Ln: { wide: 3, off: 12, stumps: 40, pads: 45 } },
    flight: { name: 'Spin: flighted outside off', L: { yorker: 2, full: 50, good: 40, back: 6, short: 2 }, Ln: { wide: 20, off: 55, stumps: 20, pads: 5 } },
    darts: { name: 'Spin: flat & quick at the stumps', L: { yorker: 10, full: 25, good: 50, back: 12, short: 3 }, Ln: { wide: 5, off: 25, stumps: 60, pads: 10 } },
  };

  function autoPlan(bowler, phaseKey) {
    if (bowler.kind === 'spin') {
      if (phaseKey === 'death') return { L: { yorker: 6, full: 32, good: 45, back: 12, short: 5 }, Ln: { wide: 15, off: 35, stumps: 42, pads: 8 } };
      return { L: { yorker: 2, full: 32, good: 50, back: 11, short: 5 }, Ln: { wide: 10, off: 42, stumps: 40, pads: 8 } };
    }
    switch (phaseKey) {
      case 'newball': return { L: { yorker: 2, full: 25, good: 46, back: 19, short: 8 }, Ln: { wide: 12, off: 55, stumps: 25, pads: 8 } };
      case 'oldball': return { L: { yorker: 3, full: 20, good: 40, back: 25, short: 12 }, Ln: { wide: 10, off: 45, stumps: 33, pads: 12 } };
      case 'powerplay': return { L: { yorker: 5, full: 26, good: 36, back: 23, short: 10 }, Ln: { wide: 12, off: 45, stumps: 30, pads: 13 } };
      case 'death': return { L: { yorker: 34, full: 15, good: 10, back: 21, short: 20 }, Ln: { wide: 25, off: 25, stumps: 40, pads: 10 } };
      default: return { L: { yorker: 6, full: 20, good: 32, back: 28, short: 14 }, Ln: { wide: 12, off: 40, stumps: 35, pads: 13 } };
    }
  }

  // ---------------- shots ----------------
  // g: aggression grade 0 defend, 1 rotate, 2 attacking ground, 3 lofted.
  // type: ground | aerial | mixed (loft = prob. of going aerial). risk: base mis-execution.
  // fam: failure family — 'off' (edge), 'leg' (leading/inside edge, lbw), 'cross' (top edge), 'loft' (mistime).
  // L/Ln: affinity to delivery length/line; vs: affinity by bowler kind.
  const SHOTS = {
    leave: { name: 'Leave', g: 0, type: 'none', risk: 0.02, fam: 'leave', L: { yorker: 0, full: 0.2, good: 1, back: 1.1, short: 0.9 }, Ln: { wide: 2.2, off: 0.9, stumps: 0.02, pads: 0.05 }, vs: { pace: 1, spin: 0.25 }, tags: ['defend'] },
    defend: { name: 'Forward/back defence', g: 0, theta: 0, sd: 45, type: 'ground', power: 5, risk: 0.032, fam: 'off', L: { yorker: 1.8, full: 0.6, good: 1.5, back: 1.2, short: 0.4 }, Ln: { wide: 0.2, off: 1, stumps: 1.4, pads: 0.6 }, vs: { pace: 1, spin: 1 }, tags: ['defend'] },
    push: { name: 'Push / nudge for a single', g: 1, theta: -5, sd: 55, type: 'ground', power: 12, risk: 0.05, fam: 'leg', L: { yorker: 0.6, full: 0.7, good: 1.1, back: 0.9, short: 0.3 }, Ln: { wide: 0.4, off: 1, stumps: 1.1, pads: 1 }, vs: { pace: 1, spin: 1.2 }, tags: ['rotate'] },
    straightdrive: { name: 'Straight drive', g: 2, theta: 0, sd: 9, type: 'ground', power: 27, risk: 0.09, fam: 'off', L: { yorker: 0.3, full: 1.5, good: 0.35, back: 0.05, short: 0 }, Ln: { wide: 0.1, off: 0.5, stumps: 1.1, pads: 0.3 }, vs: { pace: 1, spin: 1 }, tags: ['straight'] },
    offdrive: { name: 'Off drive', g: 2, theta: 18, sd: 8, type: 'ground', power: 26, risk: 0.1, fam: 'off', L: { yorker: 0.2, full: 1.3, good: 0.35, back: 0.05, short: 0 }, Ln: { wide: 0.3, off: 1.1, stumps: 0.6, pads: 0.1 }, vs: { pace: 1, spin: 1 }, tags: ['offside'] },
    coverdrive: { name: 'Cover drive', g: 2, theta: 45, sd: 12, type: 'ground', power: 27, risk: 0.12, fam: 'off', L: { yorker: 0.1, full: 1.4, good: 0.45, back: 0.05, short: 0 }, Ln: { wide: 0.9, off: 1.3, stumps: 0.2, pads: 0 }, vs: { pace: 1, spin: 1 }, tags: ['offside'] },
    ondrive: { name: 'On drive', g: 2, theta: -16, sd: 9, type: 'ground', power: 25, risk: 0.1, fam: 'leg', L: { yorker: 0.2, full: 1.1, good: 0.3, back: 0.05, short: 0 }, Ln: { wide: 0, off: 0.2, stumps: 0.9, pads: 0.9 }, vs: { pace: 1, spin: 1 }, tags: ['legside'] },
    squaredrive: { name: 'Square drive', g: 2, theta: 82, sd: 12, type: 'ground', power: 26, risk: 0.12, fam: 'off', L: { yorker: 0, full: 0.6, good: 0.6, back: 0.5, short: 0.1 }, Ln: { wide: 1.2, off: 0.6, stumps: 0.05, pads: 0 }, vs: { pace: 1, spin: 0.8 }, tags: ['offside'] },
    cut: { name: 'Square cut', g: 2, theta: 100, sd: 14, type: 'mixed', loft: 0.12, power: 28, carry: 45, risk: 0.12, fam: 'off', L: { yorker: 0, full: 0.05, good: 0.35, back: 1.2, short: 1.1 }, Ln: { wide: 1.7, off: 0.6, stumps: 0.05, pads: 0 }, vs: { pace: 1, spin: 0.9 }, tags: ['offside'] },
    latecut: { name: 'Late cut', g: 1, theta: 132, sd: 11, type: 'ground', power: 20, risk: 0.11, fam: 'off', L: { yorker: 0, full: 0.05, good: 0.35, back: 0.8, short: 0.5 }, Ln: { wide: 0.9, off: 0.6, stumps: 0, pads: 0 }, vs: { pace: 0.8, spin: 1.3 }, tags: ['offside'] },
    dab: { name: 'Dab / steer to third man', g: 1, theta: 142, sd: 11, type: 'ground', power: 14, risk: 0.1, fam: 'off', L: { yorker: 0.1, full: 0.2, good: 1, back: 1, short: 0.3 }, Ln: { wide: 0.7, off: 1.1, stumps: 0.1, pads: 0 }, vs: { pace: 1, spin: 0.6 }, tags: ['offside', 'rotate'] },
    punch: { name: 'Back-foot punch', g: 2, theta: 30, sd: 18, type: 'ground', power: 22, risk: 0.08, fam: 'off', L: { yorker: 0, full: 0.05, good: 0.6, back: 1.2, short: 0.3 }, Ln: { wide: 0.4, off: 1, stumps: 0.7, pads: 0.1 }, vs: { pace: 1, spin: 0.8 }, tags: ['offside'] },
    flick: { name: 'Flick / clip off the pads', g: 2, theta: -62, sd: 14, type: 'ground', power: 24, risk: 0.075, fam: 'leg', L: { yorker: 0.6, full: 1, good: 0.9, back: 0.5, short: 0.1 }, Ln: { wide: 0, off: 0.05, stumps: 0.7, pads: 1.9 }, vs: { pace: 1, spin: 1 }, tags: ['legside'] },
    glance: { name: 'Leg glance', g: 1, theta: -150, sd: 12, type: 'ground', power: 18, risk: 0.07, fam: 'leg', L: { yorker: 0.2, full: 0.5, good: 0.8, back: 0.7, short: 0.3 }, Ln: { wide: 0, off: 0, stumps: 0.2, pads: 1.6 }, vs: { pace: 1, spin: 0.5 }, tags: ['legside', 'rotate'] },
    pull: { name: 'Pull', g: 2, theta: -84, sd: 18, type: 'mixed', loft: 0.42, power: 28, carry: 62, risk: 0.14, fam: 'cross', L: { yorker: 0, full: 0, good: 0.15, back: 1.2, short: 1.6 }, Ln: { wide: 0.3, off: 0.7, stumps: 1, pads: 1.1 }, vs: { pace: 1, spin: 0.6 }, tags: ['legside', 'short'] },
    hook: { name: 'Hook', g: 3, theta: -118, sd: 18, type: 'mixed', loft: 0.75, power: 27, carry: 64, risk: 0.2, fam: 'cross', L: { yorker: 0, full: 0, good: 0, back: 0.2, short: 1.6 }, Ln: { wide: 0, off: 0.3, stumps: 1, pads: 1.3 }, vs: { pace: 1, spin: 0.02 }, tags: ['legside', 'short', 'lofted'] },
    uppercut: { name: 'Upper cut', g: 3, theta: 150, sd: 12, type: 'aerial', power: 25, carry: 58, risk: 0.2, fam: 'off', L: { yorker: 0, full: 0, good: 0, back: 0.3, short: 1.3 }, Ln: { wide: 1.4, off: 0.8, stumps: 0.1, pads: 0 }, vs: { pace: 1, spin: 0 }, tags: ['offside', 'short', 'lofted'] },
    sweep: { name: 'Sweep', g: 2, theta: -98, sd: 18, type: 'ground', power: 22, risk: 0.12, fam: 'cross', L: { yorker: 0.1, full: 1, good: 1, back: 0.2, short: 0 }, Ln: { wide: 0.3, off: 0.7, stumps: 1, pads: 1.1 }, vs: { pace: 0.02, spin: 1 }, tags: ['legside', 'sweep'] },
    slogsweep: { name: 'Slog sweep', g: 3, theta: -58, sd: 15, type: 'aerial', power: 28, carry: 72, risk: 0.19, fam: 'cross', L: { yorker: 0.1, full: 1, good: 0.9, back: 0.4, short: 0.2 }, Ln: { wide: 0.2, off: 0.6, stumps: 1, pads: 1.1 }, vs: { pace: 0.03, spin: 1 }, tags: ['legside', 'sweep', 'lofted'] },
    reversesweep: { name: 'Reverse sweep', g: 2, theta: 108, sd: 18, type: 'mixed', loft: 0.25, power: 20, carry: 48, risk: 0.18, fam: 'cross', L: { yorker: 0.1, full: 1, good: 0.9, back: 0.2, short: 0 }, Ln: { wide: 1, off: 1, stumps: 0.6, pads: 0.2 }, vs: { pace: 0.05, spin: 1 }, tags: ['offside', 'sweep'] },
    scoop: { name: 'Paddle / scoop fine', g: 2, theta: -166, sd: 10, type: 'mixed', loft: 0.5, power: 18, carry: 42, risk: 0.18, fam: 'cross', L: { yorker: 0.2, full: 0.3, good: 0.22, back: 0.1, short: 0.03 }, Ln: { wide: 0, off: 0.2, stumps: 1, pads: 1 }, vs: { pace: 0.6, spin: 0.8 }, tags: ['legside', 'sweep'] },
    ramp: { name: 'Ramp over the keeper', g: 3, theta: 176, sd: 9, type: 'aerial', power: 22, carry: 60, risk: 0.24, fam: 'cross', L: { yorker: 0.05, full: 0.12, good: 0.2, back: 0.18, short: 0.1 }, Ln: { wide: 0.1, off: 0.6, stumps: 1, pads: 0.3 }, vs: { pace: 1, spin: 0.02 }, tags: ['lofted'] },
    loftedstraight: { name: 'Lofted straight / down the ground', g: 3, theta: 0, sd: 13, type: 'aerial', power: 30, carry: 74, risk: 0.18, fam: 'loft', L: { yorker: 0.15, full: 1.3, good: 0.6, back: 0.2, short: 0 }, Ln: { wide: 0.1, off: 0.7, stumps: 1.1, pads: 0.5 }, vs: { pace: 1, spin: 1.35 }, tags: ['straight', 'lofted'] },
    loftedoff: { name: 'Inside-out over cover', g: 3, theta: 40, sd: 14, type: 'aerial', power: 29, carry: 68, risk: 0.2, fam: 'loft', L: { yorker: 0.1, full: 1.1, good: 0.6, back: 0.2, short: 0 }, Ln: { wide: 0.8, off: 1, stumps: 0.6, pads: 0.2 }, vs: { pace: 1, spin: 1.1 }, tags: ['offside', 'lofted'] },
    slog: { name: 'Slog over cow corner', g: 3, theta: -40, sd: 14, type: 'aerial', power: 30, carry: 75, risk: 0.22, fam: 'loft', L: { yorker: 0.15, full: 1, good: 1, back: 0.6, short: 0.3 }, Ln: { wide: 0.2, off: 0.6, stumps: 1, pads: 1.1 }, vs: { pace: 1, spin: 1.1 }, tags: ['legside', 'lofted'] },
    loftedon: { name: 'Lofted on-drive', freq: 0.55, g: 3, theta: -14, sd: 10, type: 'aerial', power: 30, carry: 72, risk: 0.19, fam: 'loft', L: { yorker: 0.1, full: 1.1, good: 0.4, back: 0.1, short: 0 }, Ln: { wide: 0, off: 0.2, stumps: 1, pads: 1 }, vs: { pace: 1, spin: 1.2 }, tags: ['legside', 'lofted', 'straight'] },
    whip: { name: 'Whip / flick over mid-wicket', freq: 0.55, g: 3, theta: -55, sd: 14, type: 'aerial', power: 29, carry: 70, risk: 0.2, fam: 'loft', L: { yorker: 0.5, full: 0.9, good: 0.6, back: 0.3, short: 0.1 }, Ln: { wide: 0, off: 0.05, stumps: 0.6, pads: 1.4 }, vs: { pace: 1, spin: 0.7 }, tags: ['legside', 'lofted'] },
    switchhit: { name: 'Switch hit', freq: 0.5, g: 3, theta: 70, sd: 16, type: 'aerial', power: 26, carry: 62, risk: 0.27, fam: 'cross', L: { yorker: 0.05, full: 0.25, good: 0.25, back: 0.1, short: 0 }, Ln: { wide: 0.1, off: 0.3, stumps: 0.3, pads: 0.15 }, vs: { pace: 0.3, spin: 1 }, tags: ['offside', 'lofted', 'sweep'] },
    chip: { name: 'Chip over the infield', freq: 0.45, g: 2, theta: 25, sd: 30, type: 'aerial', power: 20, carry: 42, risk: 0.14, fam: 'loft', L: { yorker: 0, full: 0.8, good: 0.6, back: 0.2, short: 0 }, Ln: { wide: 0.4, off: 0.8, stumps: 0.7, pads: 0.4 }, vs: { pace: 1, spin: 1 }, tags: ['lofted'] },
  };

  // ---------- fine delivery model (7 lines × 7 lengths) ----------
  // Each fine bucket blends the coarse affinities used by the shot table.
  const LINES = {
    wide: { name: 'Wide outside off', short: 'Wide', mix: { wide: 1 } },
    fifth: { name: '5th stump', short: '5th', mix: { wide: 0.4, off: 0.6 } },
    fourth: { name: '4th stump', short: '4th', mix: { off: 1 } },
    offstump: { name: 'Off stump', short: 'Off', mix: { off: 0.45, stumps: 0.55 } },
    middle: { name: 'Middle stump', short: 'Mid', mix: { stumps: 1 } },
    legstump: { name: 'Leg stump', short: 'Leg', mix: { stumps: 0.55, pads: 0.45 } },
    downleg: { name: 'Down leg / at the body', short: 'D.leg', mix: { pads: 1 } },
  };
  const LENGTHS = {
    yorker: { name: 'Yorker', short: 'Yorker', mix: { yorker: 1 } },
    fulltoss: { name: 'Full toss', short: 'F.toss', mix: { full: 1 } },
    full: { name: 'Full', short: 'Full', mix: { full: 1 } },
    good: { name: 'Good length', short: 'Good', mix: { good: 1 } },
    back: { name: 'Back of a length', short: 'Back', mix: { back: 1 } },
    short: { name: 'Short', short: 'Short', mix: { short: 1 } },
    bouncer: { name: 'Bouncer', short: 'Bouncer', mix: { short: 1 } },
  };
  // How a coarse plan bucket splits into fine buckets.
  const LINE_SPLIT = { wide: { wide: 1 }, off: { fifth: 0.35, fourth: 0.65 }, stumps: { offstump: 0.4, middle: 0.35, legstump: 0.25 }, pads: { downleg: 1 } };
  const LENGTH_SPLIT = { yorker: { yorker: 0.92, fulltoss: 0.08 }, full: { full: 0.96, fulltoss: 0.04 }, good: { good: 1 }, back: { back: 1 }, short: { short: 0.55, bouncer: 0.45 } };

  for (const [k, v] of Object.entries(SHOTS)) v.id = k;
  const SHOT_IDS = Object.keys(SHOTS);

  /** Aggression multiplier for a shot grade. */
  function gradeFactor(g, agg) {
    switch (g) {
      case 0: return 1.6 * (1 - agg) + 0.15;
      case 1: return 1.2 - 0.45 * agg;
      case 2: return 0.55 + agg;
      default: return 0.012 + 1.4 * agg * agg;
    }
  }

  Object.assign(CFS, {
    FORMATS, PITCHES, OUTFIELDS, OVERHEAD, BOWLERS, BATTERS, PLANS, SHOTS, SHOT_IDS, LINES, LENGTHS, LINE_SPLIT, LENGTH_SPLIT,
    turnFor, angleFor, autoPlan, gradeFactor,
  });
})(typeof window !== 'undefined' ? window : globalThis);
