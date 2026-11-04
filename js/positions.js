/*
 * Fielding-position catalogue, voice aliases, and position classification.
 * theta/d are batter-relative (see core.js). d === 'B' means "on the boundary"
 * (rope distance minus a few metres, so it adapts to the ground size).
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;
  const { boundaryDist, angDiff, similarity } = CFS;

  const BOUNDARY_INSET = 4; // metres inside the rope for "deep" fielders

  // zone: 'close' | 'ring' | 'deep' ; side: 'off' | 'leg' | 'straight' | 'behind'
  const POSITIONS = [
    // ---- behind the wicket / catching ----
    { id: 'wk', name: 'Wicket-keeper', short: 'WK', theta: 180, d: 17, zone: 'close', aliases: ['keeper', 'wicketkeeper', 'wicket keeper', 'wk', 'kipper', 'keep'] },
    { id: 'slip1', name: 'First slip', short: '1s', theta: 168, d: 18.5, zone: 'close', aliases: ['first slip', 'slip', '1st slip', 'one slip', 'slip one', 'first slips'] },
    { id: 'slip2', name: 'Second slip', short: '2s', theta: 160, d: 19, zone: 'close', aliases: ['second slip', '2nd slip', 'slip two', 'two slip'] },
    { id: 'slip3', name: 'Third slip', short: '3s', theta: 152, d: 19.5, zone: 'close', aliases: ['third slip', '3rd slip', 'slip three'] },
    { id: 'slip4', name: 'Fourth slip', short: '4s', theta: 145, d: 20, zone: 'close', aliases: ['fourth slip', '4th slip', 'slip four'] },
    { id: 'gully', name: 'Gully', short: 'Gu', theta: 128, d: 18, zone: 'close', aliases: ['gully', 'gulley', 'gali', 'galley', 'golly', 'gullie'] },
    { id: 'flyslip', name: 'Fly slip', short: 'Fs', theta: 157, d: 40, zone: 'ring', aliases: ['fly slip', 'flyslip', 'fly slips'] },
    { id: 'legslip', name: 'Leg slip', short: 'LS', theta: -165, d: 16, zone: 'close', aliases: ['leg slip', 'legslip', 'legs lip'] },
    { id: 'leggully', name: 'Leg gully', short: 'LG', theta: -132, d: 15, zone: 'close', aliases: ['leg gully', 'leg gulley', 'leg galley'] },
    { id: 'shortleg', name: 'Short leg', short: 'SL', theta: -78, d: 5.5, zone: 'close', aliases: ['short leg', 'forward short leg', 'bat pad', 'short lake', 'shortleg'] },
    { id: 'backshortleg', name: 'Backward short leg', short: 'BSL', theta: -122, d: 5.5, zone: 'close', aliases: ['backward short leg', 'back short leg', 'leg bat pad'] },
    { id: 'sillypoint', name: 'Silly point', short: 'SP', theta: 86, d: 5, zone: 'close', aliases: ['silly point', 'silly pointe'] },
    { id: 'sillymidoff', name: 'Silly mid-off', short: 'SMO', theta: 28, d: 7, zone: 'close', aliases: ['silly mid off', 'silly midoff'] },
    { id: 'sillymidon', name: 'Silly mid-on', short: 'SMN', theta: -28, d: 7, zone: 'close', aliases: ['silly mid on', 'silly midon'] },
    { id: 'shortcover', name: 'Short cover', short: 'SC', theta: 50, d: 14, zone: 'ring', aliases: ['short cover', 'short covers'] },
    { id: 'shortextra', name: 'Short extra cover', short: 'SEC', theta: 34, d: 15, zone: 'ring', aliases: ['short extra cover', 'short extra'] },
    { id: 'shortmidoff', name: 'Short mid-off', short: 'SMO', theta: 15, d: 16, zone: 'ring', aliases: ['short mid off', 'short midoff', 'mid off up', 'short of mid off'] },
    { id: 'shortmidon', name: 'Short mid-on', short: 'SMN', theta: -15, d: 16, zone: 'ring', aliases: ['short mid on', 'short midon', 'mid on up', 'short of mid on'] },
    { id: 'shortmidwicket', name: 'Short mid-wicket', short: 'SMW', theta: -48, d: 14, zone: 'ring', aliases: ['short mid wicket', 'short midwicket'] },
    { id: 'shortfine', name: 'Short fine leg', short: 'SFL', theta: -150, d: 25, zone: 'ring', aliases: ['short fine leg', 'short fine', 'fine leg up', 'short fine lake'] },
    { id: 'shortthird', name: 'Short third man', short: 'STM', theta: 143, d: 27, zone: 'ring', aliases: ['short third man', 'short third', 'third man up'] },

    // ---- the ring ----
    { id: 'backpoint', name: 'Backward point', short: 'BP', theta: 108, d: 22, zone: 'ring', aliases: ['backward point', 'back point', 'backwards point'] },
    { id: 'point', name: 'Point', short: 'Pt', theta: 92, d: 23, zone: 'ring', aliases: ['point', 'square point', 'pointe'] },
    { id: 'coverpoint', name: 'Cover point', short: 'CP', theta: 72, d: 25, zone: 'ring', aliases: ['cover point', 'covers point'] },
    { id: 'cover', name: 'Cover', short: 'Cv', theta: 55, d: 26, zone: 'ring', aliases: ['cover', 'covers', 'short of cover'] },
    { id: 'extracover', name: 'Extra cover', short: 'EC', theta: 38, d: 27, zone: 'ring', aliases: ['extra cover', 'extra covers', 'extra', 'xtra cover'] },
    { id: 'midoff', name: 'Mid-off', short: 'MO', theta: 15, d: 28, zone: 'ring', aliases: ['mid off', 'midoff', 'mid of', 'med off', 'mid-off'] },
    { id: 'midon', name: 'Mid-on', short: 'MN', theta: -15, d: 28, zone: 'ring', aliases: ['mid on', 'midon', 'mid one', 'med on', 'mid-on', 'mid 1'] },
    { id: 'midwicket', name: 'Mid-wicket', short: 'MW', theta: -52, d: 25, zone: 'ring', aliases: ['mid wicket', 'midwicket', 'mid wickets', 'mid wicked', 'mid-wicket', 'mid ticket'] },
    { id: 'squareleg', name: 'Square leg', short: 'SqL', theta: -88, d: 23, zone: 'ring', aliases: ['square leg', 'square lake', 'square', 'square leg up'] },
    { id: 'backsquare', name: 'Backward square leg', short: 'BSq', theta: -115, d: 23, zone: 'ring', aliases: ['backward square leg', 'backward square', 'back square leg', 'back square'] },

    // ---- the deep (on the rope) ----
    { id: 'thirdman', name: 'Third man', short: '3M', theta: 140, d: 'B', zone: 'deep', aliases: ['third man', '3rd man', 'third mon', 'deep third man', 'third', 'deep third'] },
    { id: 'finethird', name: 'Fine third man', short: 'F3M', theta: 158, d: 'B', zone: 'deep', aliases: ['fine third man', 'fine third', 'deep fine third'] },
    { id: 'deepbackpoint', name: 'Deep backward point', short: 'DBP', theta: 115, d: 'B', zone: 'deep', aliases: ['deep backward point', 'deep back point'] },
    { id: 'deeppoint', name: 'Deep point', short: 'DPt', theta: 93, d: 'B', zone: 'deep', aliases: ['deep point', 'deep square point'] },
    { id: 'deepcoverpoint', name: 'Deep cover point', short: 'DCP', theta: 73, d: 'B', zone: 'deep', aliases: ['deep cover point', 'sweeper', 'sweeper cover', 'sweeper on the off side'] },
    { id: 'deepcover', name: 'Deep cover', short: 'DC', theta: 55, d: 'B', zone: 'deep', aliases: ['deep cover', 'deep covers'] },
    { id: 'deepextra', name: 'Deep extra cover', short: 'DEC', theta: 37, d: 'B', zone: 'deep', aliases: ['deep extra cover', 'deep extra', 'long extra cover', 'deep extra covers'] },
    { id: 'longoff', name: 'Long-off', short: 'LO', theta: 13, d: 'B', zone: 'deep', aliases: ['long off', 'longoff', 'long of', 'lung off', 'long-off', 'deep mid off'] },
    { id: 'straighthit', name: 'Straight hit', short: 'SH', theta: 0, d: 'B', zone: 'deep', aliases: ['straight hit', 'long straight', 'deep straight', 'straight', 'straight long', 'straight deep'] },
    { id: 'longon', name: 'Long-on', short: 'LN', theta: -13, d: 'B', zone: 'deep', aliases: ['long on', 'longon', 'long one', 'lawn on', 'long-on', 'long own', 'deep mid on'] },
    { id: 'cowcorner', name: 'Cow corner', short: 'Cow', theta: -36, d: 'B', zone: 'deep', aliases: ['cow corner', 'cow', 'cow corna', 'deep cow corner'] },
    { id: 'deepmidwicket', name: 'Deep mid-wicket', short: 'DMW', theta: -55, d: 'B', zone: 'deep', aliases: ['deep mid wicket', 'deep midwicket', 'deep mid wickets', 'deep mid wicked'] },
    { id: 'deepforwardsquare', name: 'Deep forward square leg', short: 'DFS', theta: -71, d: 'B', zone: 'deep', aliases: ['deep forward square leg', 'deep forward square', 'forward deep square'] },
    { id: 'deepsquare', name: 'Deep square leg', short: 'DSq', theta: -88, d: 'B', zone: 'deep', aliases: ['deep square leg', 'deep square', 'deep square lake', 'sweeper on the leg side'] },
    { id: 'deepbacksquare', name: 'Deep backward square leg', short: 'DBS', theta: -117, d: 'B', zone: 'deep', aliases: ['deep backward square leg', 'deep backward square', 'deep back square'] },
    { id: 'longleg', name: 'Long leg', short: 'LL', theta: -140, d: 'B', zone: 'deep', aliases: ['long leg', 'long lake'] },
    { id: 'fineleg', name: 'Fine leg', short: 'FL', theta: -158, d: 'B', zone: 'deep', aliases: ['fine leg', 'deep fine leg', 'find leg', 'fine lake', 'fine lag', 'fine leg back'] },
  ];

  const BY_ID = Object.fromEntries(POSITIONS.map((p) => [p.id, p]));

  /** Resolve a catalogue entry's distance for the current ground. */
  function resolveDist(pos, ground, keeperMode) {
    if (pos.id === 'wk' && keeperMode) return keeperDist(keeperMode);
    if (pos.d === 'B') return boundaryDist(pos.theta, ground) - BOUNDARY_INSET;
    return pos.d;
  }

  function keeperDist(mode) {
    return { up: 1.6, medium: 10, back: 17, deep: 21 }[mode] || 17;
  }

  /** Spot (theta, d) for a catalogue id on the given ground. */
  function spotFor(id, ground, opts = {}) {
    const p = BY_ID[id];
    if (!p) return null;
    let d = resolveDist(p, ground, opts.keeperMode);
    let theta = p.theta;
    // When the keeper is standing up, the cordon must stand much closer.
    if (opts.keeperMode === 'up' && /^slip\d$/.test(id)) {
      const n = Number(id.slice(4));
      d = 3.2 + n * 0.4;
      theta = 180 - 24 * n;
    } else if (opts.keeperMode === 'medium' && /^slip\d$/.test(id)) {
      d = 12;
    }
    if (opts.keeperMode === 'up' && id === 'legslip') { d = 3.4; theta = -158; }
    if (opts.keeperMode === 'up' && id === 'gully') { d = 12; }
    return { theta, d };
  }

  /**
   * Name the nearest catalogued position to an arbitrary spot.
   * Metric blends angular difference with a log-scale depth difference so
   * that "deep" and "ring" variants at the same angle are distinguished.
   */
  function classify(theta, d, ground, opts = {}) {
    let best = null, bestScore = Infinity;
    for (const p of POSITIONS) {
      if (p.id === 'wk' && !opts.allowKeeper) continue;
      const s = spotFor(p.id, ground, opts);
      const close = Math.min(d, s.d) < 12;
      const angW = close ? 0.55 : 1; // angles matter less right next to the bat
      const score = angDiff(theta, s.theta) * angW + Math.abs(Math.log((d + 2) / (s.d + 2))) * 75;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return { pos: best, score: bestScore };
  }

  /** Human description of an arbitrary spot e.g. "Deep cover point" or "Wide mid-off". */
  function describe(theta, d, ground, opts) {
    const { pos, score } = classify(theta, d, ground, opts);
    if (score < 14) return pos.name;
    return pos.name + ' (adj.)';
  }

  // ---------- voice / text matching ----------
  function normaliseText(s) {
    return String(s)
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[-_/]/g, ' ')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const ALIAS_INDEX = [];
  for (const p of POSITIONS) {
    const set = new Set([normaliseText(p.name), ...p.aliases.map(normaliseText)]);
    for (const a of set) ALIAS_INDEX.push({ alias: a, compact: a.replace(/ /g, ''), phon: phonetic(a), id: p.id });
  }

  /**
   * Fuzzy-match a phrase to a fielding position.
   * Returns {id, score} with score in [0,1] or null.
   */
  /**
   * Fuzzy-match a phrase to a fielding position.
   * Combines exact alias, edit-distance and a phonetic key (so speech
   * errors like "third maan", "mid one", "fine lake" still resolve).
   * Returns {id, score} with score in [0,1] or null. opts.min lowers the
   * acceptance threshold for "best guess" matching.
   */
  function matchPosition(phrase, opts = {}) {
    const n = normaliseText(phrase).replace(/^(the|a|an|at|to) /, '').replace(/ (position|spot|please|fielder|man)$/, '');
    if (!n) return null;
    const c = n.replace(/ /g, '');
    const ph = phonetic(n);
    let best = null;
    for (const e of ALIAS_INDEX) {
      let s;
      if (e.alias === n || e.compact === c) s = 1;
      else {
        s = similarity(e.compact, c) * 0.97;
        if (ph.length >= 3 && e.phon.length >= 3) s = Math.max(s, similarity(e.phon, ph) * 0.9);
      }
      if (!best || s > best.score) best = { id: e.id, score: s };
    }
    return best && best.score >= (opts.min || 0.74) ? best : null;
  }

  /** crude phonetic key: drop vowels (after the first letter), merge sound-alikes, collapse repeats */
  function phonetic(s) {
    let t = String(s).toLowerCase().replace(/[^a-z ]/g, '')
      .replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/q/g, 'k').replace(/z/g, 's').replace(/x/g, 'ks')
      .replace(/(\w)\1+/g, '$1');
    return t.split(' ').filter(Boolean).map((w) => w[0] + w.slice(1).replace(/[aeiouyhw]/g, '')).join('').replace(/(\w)\1+/g, '$1');
  }

  Object.assign(CFS, {
    POSITIONS, POS_BY_ID: BY_ID, BOUNDARY_INSET,
    spotFor, keeperDist, classify, describe, matchPosition, normaliseText, phonetic,
  });
})(typeof window !== 'undefined' ? window : globalThis);
