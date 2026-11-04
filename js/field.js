/*
 * Field model: building fields from presets, moving fielders, rule checks.
 * A field = { name, keeperMode, fielders: [ {id, role, name, theta, d} x10 ] }
 * (9 outfielders + keeper; the bowler is implicit at the bowler's end).
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;
  const { spotFor, toXY, insideRingPolar, classify, boundaryDist, clamp, normAngle } = CFS;

  const DEFAULT_NAMES = ['Keeper', 'Fielder 1', 'Fielder 2', 'Fielder 3', 'Fielder 4', 'Fielder 5', 'Fielder 6', 'Fielder 7', 'Fielder 8', 'Fielder 9'];

  function fieldFromPositions(positionIds, ground, keeperMode = 'back', name = 'Custom field', roster) {
    const kSpot = spotFor('wk', ground, { keeperMode });
    const fielders = [{ id: 0, role: 'keeper', name: (roster && roster[0]) || DEFAULT_NAMES[0], theta: kSpot.theta, d: kSpot.d }];
    positionIds.slice(0, 9).forEach((pid, i) => {
      const s = spotFor(pid, ground, { keeperMode });
      fielders.push({ id: i + 1, role: 'fielder', name: (roster && roster[i + 1]) || DEFAULT_NAMES[i + 1], theta: s.theta, d: s.d });
    });
    return { name, keeperMode, fielders };
  }

  function fieldFromPreset(preset, ground, roster) {
    const f = fieldFromPositions(preset.positions, ground, preset.keeper, preset.name, roster);
    f.presetId = preset.id;
    return f;
  }

  /** Apply a new preset while keeping individual players' identities stable where possible. */
  function applyPresetKeepingPlayers(oldField, preset, ground) {
    const nf = fieldFromPreset(preset, ground, oldField.fielders.map((f) => f.name));
    // Hungarian-lite: greedily assign each new spot to the nearest old fielder to minimise movement.
    const oldOut = oldField.fielders.filter((f) => f.role === 'fielder');
    const newSpots = nf.fielders.filter((f) => f.role === 'fielder');
    const pairs = [];
    for (const o of oldOut) for (const n of newSpots) {
      const a = toXY(o.theta, o.d), b = toXY(n.theta, n.d);
      pairs.push({ o, n, dd: Math.hypot(a.x - b.x, a.y - b.y) });
    }
    pairs.sort((p, q) => p.dd - q.dd);
    const usedO = new Set(), usedN = new Set();
    const result = [nf.fielders[0]];
    result[0].name = oldField.fielders[0].name;
    for (const p of pairs) {
      if (usedO.has(p.o.id) || usedN.has(p.n)) continue;
      usedO.add(p.o.id); usedN.add(p.n);
      result.push({ id: p.o.id, role: 'fielder', name: p.o.name, theta: p.n.theta, d: p.n.d });
    }
    result.sort((a, b) => a.id - b.id);
    return { name: preset.name, keeperMode: preset.keeper, presetId: preset.id, fielders: result };
  }

  function positionName(f, ground, keeperMode) {
    if (f.role === 'keeper') return f.d < 6 ? 'Wicket-keeper (up)' : 'Wicket-keeper';
    return CFS.describe(f.theta, f.d, ground, { keeperMode });
  }
  function positionId(f, ground, keeperMode) {
    if (f.role === 'keeper') return 'wk';
    return classify(f.theta, f.d, ground, { keeperMode }).pos.id;
  }

  /** Clamp a spot to the playing area and off the pitch. */
  function legalSpot(theta, d, ground) {
    const maxD = boundaryDist(theta, ground) - 1.5;
    d = clamp(d, 1.2, maxD);
    // keep fielders off the pitch strip (except keeper behind the stumps)
    const p = toXY(theta, d);
    if (Math.abs(p.x) < 1.6 && p.y > 1.5 && p.y < CFS.PITCH_LEN - 1.5) {
      p.x = p.x < 0 ? -1.7 : 1.7;
      const back = CFS.fromXY(p.x, p.y);
      return { theta: back.theta, d: back.d };
    }
    return { theta: normAngle(theta), d };
  }

  /**
   * Check fielding restrictions. Returns {ok, issues:[], info:{outside, behindSquareLeg, offSide, legSide, close}}.
   */
  function checkRules(field, ctx, ground) {
    const phase = CFS.FORMATS[ctx.format].phases[ctx.phase];
    const issues = [];
    let outside = 0, behindLeg = 0, off = 0, leg = 0, close = 0, inside = 0;
    for (const f of field.fielders) {
      if (f.role === 'keeper') continue;
      const p = toXY(f.theta, f.d);
      if (!insideRingPolar(f.theta, f.d)) outside++; else inside++;
      if (p.x < -0.5 && p.y < 0) behindLeg++;
      if (p.x > 0.5) off++; else if (p.x < -0.5) leg++;
      if (f.d < 15) close++;
    }
    if (phase.maxOut != null && outside > phase.maxOut) {
      issues.push(`${outside} fielders outside the 30-yard circle — maximum is ${phase.maxOut} in the ${phase.short}.`);
    }
    if (behindLeg > 2) issues.push(`${behindLeg} fielders behind square on the leg side — Law 28.4 allows at most 2.`);
    if (ctx.format !== 'Test' && inside < 4) issues.push(`Only ${inside} fielders inside the circle — at least 4 required (plus bowler & keeper).`);
    return { ok: issues.length === 0, issues, info: { outside, inside, behindLeg, off, leg, close, maxOut: phase.maxOut } };
  }

  /** Mirror a field off<->leg (e.g. bowler wants the "other" side heavy). */
  function mirrorField(field) {
    const f = CFS.deepClone(field);
    for (const x of f.fielders) if (x.role !== 'keeper') x.theta = normAngle(-x.theta);
    f.name = field.name + ' (mirrored)';
    return f;
  }

  /** Field summary text e.g. "6–3 off-side field, 3 out (third man, deep point, fine leg)". */
  function summarise(field, ctx, ground) {
    const r = checkRules(field, ctx, ground);
    const outs = field.fielders.filter((f) => f.role !== 'keeper' && !insideRingPolar(f.theta, f.d)).map((f) => positionName(f, ground, field.keeperMode));
    return `${r.info.off}–${r.info.leg} field, ${r.info.outside} out${outs.length ? ' (' + outs.join(', ') + ')' : ''}`;
  }

  Object.assign(CFS, {
    DEFAULT_NAMES, fieldFromPositions, fieldFromPreset, applyPresetKeepingPlayers,
    positionName, positionId, legalSpot, checkRules, mirrorField, summarise,
  });
})(typeof window !== 'undefined' ? window : globalThis);
