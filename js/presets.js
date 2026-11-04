/*
 * Field presets and tactical traps. Positions are for the batter on strike
 * (batter-relative frame), so every preset mirrors automatically for a
 * left-hander. Each entry lists the 9 outfielders; the keeper's stance comes
 * from `keeper` and the bowler is always at the bowler's end.
 *
 * kind:  'pace' | 'spin' | 'any'
 * pace:  'fast' | 'medium' (optional filter for pace presets)
 * turn:  'in' | 'away' (optional filter for spin presets, relative to batter)
 * phases: phase keys this preset is designed for
 * plan:  bowling plan that goes with the field (see conditions.js PLANS)
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;

  const P = (o) => Object.assign({ keeper: 'back', plan: 'auto', trap: false, kind: 'any' }, o);

  const PRESETS = [
    // ===================== PACE =====================
    P({ id: 'pace_test_umbrella', name: 'Test new ball — 4 slips & gully', kind: 'pace', formats: ['Test'], phases: ['newball'], style: 'attack', plan: 'channel',
      positions: ['slip1', 'slip2', 'slip3', 'slip4', 'gully', 'cover', 'midoff', 'midon', 'fineleg'],
      description: 'Maximum catching cordon for a new ball that is seaming or swinging. Only cover, mid-off and mid-on save runs in front.' }),
    P({ id: 'pace_test_standard', name: 'Test — 3 slips, gully, point, cover', kind: 'pace', formats: ['Test'], phases: ['newball', 'oldball'], style: 'attack', plan: 'channel',
      positions: ['slip1', 'slip2', 'slip3', 'gully', 'point', 'cover', 'midoff', 'midon', 'fineleg'],
      description: 'The classic attacking Test field for the 4th-stump channel.' }),
    P({ id: 'pace_test_oldball', name: 'Test old ball — 2 slips, square leg', kind: 'pace', formats: ['Test'], phases: ['oldball'], style: 'balanced',
      positions: ['slip1', 'slip2', 'gully', 'point', 'cover', 'midoff', 'midon', 'squareleg', 'fineleg'],
      description: 'Balanced field once the shine has gone: two slips, gully and a full ring.' }),
    P({ id: 'pace_test_contain', name: 'Test — containing (1 slip, deep point)', kind: 'pace', formats: ['Test'], phases: ['oldball', 'declare'], style: 'defend',
      positions: ['slip1', 'point', 'deeppoint', 'cover', 'midoff', 'midon', 'midwicket', 'squareleg', 'fineleg'],
      description: 'Dry up runs on a flat deck; deep point stops the square-of-the-wicket boundary.' }),
    P({ id: 'pace_declare', name: 'Test — declaration push (5 out)', kind: 'pace', formats: ['Test'], phases: ['declare'], style: 'defend',
      positions: ['point', 'cover', 'midoff', 'midwicket', 'deepcoverpoint', 'longoff', 'longon', 'deepsquare', 'fineleg'],
      description: 'Batters are slogging for a declaration: spread the field and make them hit into the deep.' }),

    P({ id: 'pace_pp_standard', name: 'Powerplay — slip, 2 out (third man & fine leg)', kind: 'pace', formats: ['T20', 'ODI'], phases: ['powerplay'], style: 'balanced',
      positions: ['slip1', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'squareleg', 'thirdman', 'fineleg'],
      description: 'Standard new-ball limited-overs field: one slip, the ring, and the two boundary riders behind square.' }),
    P({ id: 'pace_pp_attack', name: 'Powerplay attack — 2 slips', kind: 'pace', formats: ['T20', 'ODI'], phases: ['powerplay'], style: 'attack', plan: 'channel',
      positions: ['slip1', 'slip2', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'thirdman', 'fineleg'],
      description: 'Swinging new ball: two slips, gaps at square leg are the price for wickets.' }),
    P({ id: 'pace_pp_defend', name: 'Powerplay — no slip, deep cover', kind: 'pace', formats: ['T20', 'ODI'], phases: ['powerplay'], style: 'defend',
      positions: ['point', 'cover', 'midoff', 'midon', 'midwicket', 'squareleg', 'shortthird', 'deepcover', 'fineleg'],
      description: 'Flat deck, ball not moving: protect the cover boundary against lofted drives.' }),

    P({ id: 'pace_odi_middle', name: 'ODI middle — sweeper & 4 out', kind: 'pace', formats: ['ODI'], phases: ['middle'], style: 'balanced',
      positions: ['point', 'cover', 'midoff', 'midon', 'midwicket', 'deepcoverpoint', 'thirdman', 'deepsquare', 'fineleg'],
      description: 'Standard ODI middle-overs field with four men out: sweeper cover, third man, deep square, fine leg.' }),
    P({ id: 'pace_t20_middle', name: 'T20 middle — 5 out (long-off/long-on)', kind: 'pace', formats: ['T20'], phases: ['middle'], style: 'balanced',
      positions: ['point', 'cover', 'midoff', 'midwicket', 'deepcoverpoint', 'longoff', 'longon', 'deepsquare', 'fineleg'],
      description: 'Five boundary riders, the ring cuts off singles in front of square.' }),
    P({ id: 'pace_death', name: 'Death overs — yorker field', kind: 'pace', formats: ['T20', 'ODI'], phases: ['death'], style: 'defend', plan: 'yorkers',
      positions: ['shortfine', 'point', 'extracover', 'midwicket', 'deepcoverpoint', 'longoff', 'longon', 'deepmidwicket', 'deepsquare'],
      description: 'Bowl yorkers: straight boundaries guarded, fine leg up to stop the dig-out single and scoop.' }),

    P({ id: 'med_keeper_up', name: 'Medium pace — keeper up, ring field', kind: 'pace', pace: 'medium', formats: ['T20', 'ODI'], phases: ['powerplay', 'middle'], style: 'balanced', keeper: 'up', plan: 'stumps',
      positions: ['slip1', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'squareleg', 'deepcoverpoint', 'fineleg'],
      description: 'Keeper standing up pins the batter in the crease; stump-to-stump line to a ring.' }),
    P({ id: 'med_swing', name: 'Swing — 3 slips, gully, short extra', kind: 'pace', pace: 'medium', formats: ['Test', 'ODI'], phases: ['newball', 'powerplay'], style: 'attack', plan: 'drive',
      positions: ['slip1', 'slip2', 'slip3', 'gully', 'point', 'shortextra', 'midoff', 'midon', 'fineleg'],
      description: 'Pitch it up and swing it: catchers behind for the edge and in front for the uppish drive.' }),
    P({ id: 'med_cutters', name: 'Cutters & slower balls — long-on/long-off', kind: 'pace', pace: 'medium', formats: ['T20', 'ODI'], phases: ['middle'], style: 'balanced',
      positions: ['point', 'cover', 'midoff', 'midon', 'midwicket', 'longoff', 'longon', 'deepsquare', 'thirdman'],
      description: 'On slow or two-paced decks: the mistimed lofted hit goes to long-on/long-off.' }),

    // ===================== SPIN — turning away from the bat =====================
    P({ id: 'spin_away_test_attack', name: 'Spin (away) — slip, silly point, short leg', kind: 'spin', turn: 'away', formats: ['Test'], phases: ['newball', 'oldball'], style: 'attack', keeper: 'up', plan: 'flight',
      positions: ['slip1', 'sillypoint', 'shortleg', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'deepsquare'],
      description: 'Ball turning away (leg-spin / left-arm orthodox to RH): slip for the edge, bat-pad both sides, sweeper for the sweep.' }),
    P({ id: 'spin_away_contain', name: 'Spin (away) — off-side ring + sweeper', kind: 'spin', turn: 'away', formats: ['Test', 'ODI'], phases: ['oldball', 'middle'], style: 'defend', keeper: 'up',
      positions: ['slip1', 'point', 'cover', 'extracover', 'midoff', 'midon', 'midwicket', 'deepcoverpoint', 'deepsquare'],
      description: 'Containing field for a spinner turning away: heavy off-side ring, sweeper on each side.' }),
    P({ id: 'spin_away_pp', name: 'Powerplay spin (away) — 2 out', kind: 'spin', turn: 'away', formats: ['T20', 'ODI'], phases: ['powerplay'], style: 'balanced', keeper: 'up',
      positions: ['slip1', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'shortfine', 'deepcoverpoint', 'longon'],
      description: 'Only two out: sweeper cover and long-on, slip retained for the edge.' }),
    P({ id: 'spin_away_odi_middle', name: 'ODI spin (away) — 4 out', kind: 'spin', turn: 'away', formats: ['ODI'], phases: ['middle'], style: 'balanced', keeper: 'up',
      positions: ['point', 'cover', 'extracover', 'midoff', 'midwicket', 'deepcoverpoint', 'longoff', 'longon', 'deepsquare'],
      description: 'ODI middle overs: off-side ring with long-off, long-on, sweeper and deep square.' }),
    P({ id: 'spin_away_t20', name: 'T20 spin (away) — 5 out', kind: 'spin', turn: 'away', formats: ['T20'], phases: ['middle', 'death'], style: 'defend', keeper: 'up',
      positions: ['point', 'cover', 'midoff', 'midwicket', 'deepcoverpoint', 'longoff', 'longon', 'deepmidwicket', 'deepsquare'],
      description: 'Five on the rope; batters must hit with the turn into long-off or against it to deep mid-wicket.' }),

    // ===================== SPIN — turning into the bat =====================
    P({ id: 'spin_in_test_attack', name: 'Spin (into bat) — slip, bat-pad both sides', kind: 'spin', turn: 'in', formats: ['Test'], phases: ['newball', 'oldball'], style: 'attack', keeper: 'up', plan: 'stumps',
      positions: ['slip1', 'sillypoint', 'shortleg', 'point', 'midoff', 'midon', 'midwicket', 'squareleg', 'deepmidwicket'],
      description: 'Off-spin to RH / wrist spin to LH: short leg and silly point for the bat-pad, leg side protected.' }),
    P({ id: 'spin_in_contain', name: 'Spin (into bat) — leg-side ring, long-on', kind: 'spin', turn: 'in', formats: ['Test', 'ODI'], phases: ['oldball', 'middle'], style: 'defend', keeper: 'up',
      positions: ['point', 'cover', 'midoff', 'midon', 'midwicket', 'squareleg', 'shortfine', 'longon', 'deepmidwicket'],
      description: 'Make them hit against the spin: leg-side ring with long-on and deep mid-wicket.' }),
    P({ id: 'spin_in_pp', name: 'Powerplay spin (into bat) — 2 out', kind: 'spin', turn: 'in', formats: ['T20', 'ODI'], phases: ['powerplay'], style: 'balanced', keeper: 'up',
      positions: ['slip1', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'shortfine', 'deepmidwicket', 'longon'],
      description: 'Powerplay off-spin: slip, ring, and the two out on the leg side for the slog.' }),
    P({ id: 'spin_in_t20', name: 'T20 spin (into bat) — 5 out leg-side', kind: 'spin', turn: 'in', formats: ['T20', 'ODI'], phases: ['middle', 'death'], style: 'defend', keeper: 'up',
      positions: ['point', 'cover', 'midoff', 'shortfine', 'deepcover', 'longon', 'cowcorner', 'deepmidwicket', 'deepsquare'],
      description: 'Four on the leg-side rope for the slog with the spin, deep cover for the inside-out.' }),
    P({ id: 'spin_death', name: 'Spin at the death — boundary heavy', kind: 'spin', formats: ['T20', 'ODI'], phases: ['death'], style: 'defend', keeper: 'up', plan: 'darts',
      positions: ['point', 'extracover', 'midwicket', 'shortfine', 'deepcoverpoint', 'longoff', 'longon', 'cowcorner', 'deepmidwicket'],
      description: 'Fire it in flat; every straight hit and slog has a man on the rope.' }),

    P({ id: 'pace_t10_pp', name: 'T10 powerplay — 2 slips, third man & deep square', kind: 'pace', formats: ['T10'], phases: ['powerplay'], style: 'attack', plan: 'channel',
      positions: ['slip1', 'slip2', 'point', 'cover', 'midoff', 'midon', 'midwicket', 'thirdman', 'deepsquare'],
      description: 'Only two overs of powerplay: attack with two slips, but cover the two big T10 scoring areas behind point and square on the leg side.' }),
    P({ id: 'pace_pp_short', name: 'Powerplay short-ball plan — deep square & fine leg', kind: 'pace', formats: ['T20', 'ODI', 'T10'], phases: ['powerplay'], style: 'balanced', plan: 'short',
      positions: ['slip1', 'gully', 'shortleg', 'point', 'cover', 'midoff', 'midon', 'deepsquare', 'fineleg'],
      description: 'Use your two outfielders for the pull and hook; gully and short leg take the fend.' }),
    P({ id: 'spin_ring_attack', name: 'Spin — slip, short cover & short mid-wicket', kind: 'spin', formats: ['T20', 'ODI'], phases: ['middle'], style: 'attack', keeper: 'up', plan: 'flight',
      positions: ['slip1', 'shortcover', 'shortmidwicket', 'point', 'midoff', 'midon', 'deepcoverpoint', 'longon', 'deepsquare'],
      description: 'Attacking spin in white-ball cricket: catchers for the chip and the leading edge while three men guard the rope.' }),

    // ===================== TRAPS =====================
    P({ id: 'trap_bouncer', trap: true, name: 'Trap: bouncer / hook trap', kind: 'pace', formats: ['T20', 'ODI', 'Test'], phases: ['middle', 'death', 'oldball', 'declare'], style: 'attack', plan: 'short',
      positions: ['slip1', 'gully', 'shortleg', 'point', 'midoff', 'deepsquare', 'deepbacksquare', 'fineleg', 'deepmidwicket'],
      description: 'Bang it in: deep square, deep backward square and fine leg wait for the top-edged hook; short leg takes the fend.' }),
    P({ id: 'trap_legside', trap: true, name: 'Trap: leg-side (short leg & leg gully)', kind: 'pace', formats: ['Test', 'ODI'], phases: ['newball', 'oldball', 'middle'], style: 'attack', plan: 'body',
      positions: ['slip1', 'shortleg', 'leggully', 'squareleg', 'midwicket', 'midon', 'midoff', 'cover', 'fineleg'],
      description: 'Target the body: catchers for the glove/fend at short leg and leg gully (2 behind square — on the legal limit).' }),
    P({ id: 'trap_drive', trap: true, name: 'Trap: drive bait — short extra & fly slip', kind: 'pace', formats: ['Test', 'ODI', 'T20'], phases: ['newball', 'powerplay', 'oldball'], style: 'attack', plan: 'drive',
      positions: ['slip1', 'slip2', 'gully', 'shortextra', 'cover', 'midoff', 'midon', 'flyslip', 'fineleg'],
      description: 'Full and wide with an inviting gap through cover: short extra cover takes the uppish drive, fly slip the slashed edge.' }),
    P({ id: 'trap_offstack', trap: true, name: 'Trap: off-side stack (7–2) outside off', kind: 'pace', formats: ['Test', 'ODI'], phases: ['newball', 'oldball', 'middle'], style: 'attack', plan: 'channel',
      positions: ['slip1', 'slip2', 'gully', 'point', 'cover', 'extracover', 'midoff', 'midon', 'fineleg'],
      description: 'Bowl relentlessly outside off: seven on the off side starves the batter of runs until he chases one.' }),
    P({ id: 'trap_wideyorker', trap: true, name: 'Trap: wide-yorker (off-side boundary)', kind: 'pace', formats: ['T20', 'ODI'], phases: ['death', 'middle'], style: 'defend', plan: 'wide',
      positions: ['point', 'cover', 'shortfine', 'midon', 'thirdman', 'deeppoint', 'deepcover', 'longoff', 'longon'],
      description: 'Bowl wide of off stump: four of the five boundary riders on the off side.' }),
    P({ id: 'trap_legyorker', trap: true, name: 'Trap: leg-stump yorker (leg-side boundary)', kind: 'pace', formats: ['T20', 'ODI'], phases: ['death'], style: 'defend', plan: 'yorkers',
      positions: ['point', 'extracover', 'midoff', 'midwicket', 'longon', 'cowcorner', 'deepmidwicket', 'deepsquare', 'fineleg'],
      description: 'Full at the toes / leg stump: leg-side boundary sealed, off side left for the tough shot.' }),
    P({ id: 'trap_slower', trap: true, name: 'Trap: slower-ball (mistimed loft)', kind: 'pace', formats: ['T20', 'ODI'], phases: ['middle', 'death'], style: 'balanced',
      positions: ['point', 'shortextra', 'shortmidwicket', 'midoff', 'longoff', 'longon', 'deepmidwicket', 'deepcoverpoint', 'fineleg'],
      description: 'Take pace off: short extra cover and short mid-wicket for the early-hit chip, long-on/long-off for the miscued loft.' }),
    P({ id: 'trap_uppercut', trap: true, name: 'Trap: upper-cut (fly slip & deep backward point)', kind: 'pace', formats: ['T20', 'ODI', 'Test'], phases: ['middle', 'death', 'oldball'], style: 'attack', plan: 'short',
      positions: ['slip1', 'gully', 'flyslip', 'deepbackpoint', 'cover', 'midoff', 'midon', 'squareleg', 'fineleg'],
      description: 'Short and wide on a bouncy deck: the upper cut and slash fly to fly slip / deep backward point.' }),
    P({ id: 'trap_umbrella', trap: true, name: 'Trap: umbrella — 4 slips, 2 gullies, short leg', kind: 'pace', pace: 'fast', formats: ['Test'], phases: ['newball'], style: 'attack', plan: 'channel',
      positions: ['slip1', 'slip2', 'slip3', 'slip4', 'gully', 'backpoint', 'shortleg', 'midoff', 'fineleg'],
      description: 'All-out attack with a hooping new ball: almost every edge is covered, run-scoring is not.' }),

    P({ id: 'trap_sweep', trap: true, name: 'Trap: sweep (deep backward square, short fine)', kind: 'spin', formats: ['T20', 'ODI', 'Test'], phases: ['middle', 'oldball', 'death', 'powerplay'], style: 'balanced', keeper: 'up', plan: 'stumps',
      positions: ['slip1', 'point', 'cover', 'midoff', 'midon', 'shortfine', 'deepbacksquare', 'deepsquare', 'deepmidwicket'],
      description: 'For habitual sweepers: top-edged sweeps go to short fine / deep backward square, the slog sweep to deep mid-wicket.' }),
    P({ id: 'trap_reverse', trap: true, name: 'Trap: reverse-sweep (short third & deep backward point)', kind: 'spin', formats: ['T20', 'ODI', 'Test'], phases: ['middle', 'oldball', 'death'], style: 'balanced', keeper: 'up', plan: 'stumps',
      positions: ['backpoint', 'deepbackpoint', 'shortthird', 'cover', 'midoff', 'midon', 'midwicket', 'squareleg', 'deepmidwicket'],
      description: 'Cover the reverse sweep: backward point, short third and deep backward point.' }),
    P({ id: 'trap_googly', trap: true, name: "Trap: googly / wrong'un (slip, short leg, leg slip)", kind: 'spin', turn: 'away', formats: ['Test', 'ODI', 'T20'], phases: ['newball', 'oldball', 'middle'], style: 'attack', keeper: 'up', plan: 'stumps',
      positions: ['slip1', 'sillypoint', 'shortleg', 'legslip', 'cover', 'midoff', 'midon', 'midwicket', 'deepsquare'],
      description: "Set up for the leg-break, beat them with the wrong'un: short leg and leg slip for the bat-pad, slip for the edge." }),
    P({ id: 'trap_flight', trap: true, name: 'Trap: flight & dip — long-off, long-on, short cover', kind: 'spin', formats: ['T20', 'ODI', 'Test'], phases: ['middle', 'oldball', 'death'], style: 'balanced', keeper: 'up', plan: 'flight',
      positions: ['slip1', 'shortcover', 'point', 'midwicket', 'longoff', 'longon', 'deepcoverpoint', 'deepmidwicket', 'shortfine'],
      description: 'Toss it up to tempt the charge: the stumping, the chip to short cover, or the miscued loft to long-off/long-on.' }),

    P({ id: 'trap_whip', trap: true, name: 'Trap: leg-stump whip (short mid-wicket & deep forward square)', kind: 'pace', formats: ['T20', 'ODI', 'T10'], phases: ['middle', 'death'], style: 'attack', plan: 'body',
      positions: ['point', 'cover', 'midoff', 'midon', 'shortmidwicket', 'deepforwardsquare', 'deepmidwicket', 'fineleg', 'thirdman'],
      description: 'Bowl at the pads to the leg-side whipper: short mid-wicket for the early flick, deep forward square and deep mid-wicket for the loft.' }),
    P({ id: 'trap_ring', trap: true, name: 'Ring field — save the single', kind: 'any', formats: ['T20', 'ODI', 'Test'], phases: ['powerplay', 'middle', 'death', 'newball', 'oldball', 'declare'], style: 'defend', plan: 'stumps',
      positions: ['point', 'coverpoint', 'cover', 'extracover', 'midoff', 'midon', 'midwicket', 'squareleg', 'shortfine'],
      description: 'Everyone saving one (e.g. last ball, one to win). Every lofted hit clears the infield, so use sparingly.' }),
  ];

  const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

  /** Does a preset suit the given context? Returns a 0..3 score (0 = not applicable). */
  function presetFit(p, ctx) {
    const b = CFS.BOWLERS[ctx.bowlerType];
    if (p.kind !== 'any' && p.kind !== b.kind) return 0;
    if (p.pace && b.kind === 'pace' && p.pace !== b.pace) return 0.5;
    if (p.turn && b.kind === 'spin' && p.turn !== CFS.turnFor(ctx.bowlerType, ctx.hand)) return 0;
    let s = 1;
    // T10 uses the same tactical fields as T20 (same restrictions after the powerplay)
    if (p.formats.includes(ctx.format) || (ctx.format === 'T10' && p.formats.includes('T20'))) s += 1;
    if (p.phases.includes(ctx.phase)) s += 1;
    return s;
  }

  function presetsFor(ctx, { includeTraps = true, minFit = 2 } = {}) {
    return PRESETS.filter((p) => (includeTraps || !p.trap) && presetFit(p, ctx) >= minFit);
  }

  Object.assign(CFS, { PRESETS, PRESET_BY_ID, presetFit, presetsFor });
})(typeof window !== 'undefined' ? window : globalThis);
