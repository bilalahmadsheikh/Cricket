/*
 * Ball-by-ball physics-lite simulation engine.
 *
 * For each ball:
 *  1. choose a delivery (length × line, slower-ball / variation) from the bowling plan
 *  2. the batter chooses a shot (phase aggression, profile, delivery, gaps in the field)
 *  3. execution: clean / edge / top-edge / leading-edge / mistime / miss, driven by
 *     pitch (seam, spin, bounce, variable bounce, grip), overhead swing, ball age
 *  4. the ball travels (ground roll with outfield friction, or aerial carry + hang time)
 *  5. fielders (incl. keeper & bowler) try to catch / intercept using reaction time,
 *     sprint speed and dive reach; runs come from the time taken to return the ball.
 *
 * It's a model, not a crystal ball — but every number is driven by the actual
 * fielder coordinates, so comparisons between fields are meaningful.
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;
  const { SHOTS, SHOT_IDS, PITCHES, BOWLERS, BATTERS, PLANS, FORMATS, OUTFIELDS, OVERHEAD,
    toXY, makeRng, clamp, DEG, PITCH_LEN, boundaryDist, angDiff, normAngle, gradeFactor } = CFS;

  const G = 9.81;
  const RUN_SPEED = 6.6; // m/s average sprint for an athletic fielder
  const STOP_REACH = 1.9; // m, ground-ball dive/stretch
  const CATCH_REACH = 1.6; // m, catch stretch when running
  const CATCH_RUN = 5.0; // m/s effective speed while judging a high ball
  const THROW_SPEED = 30; // m/s flat throw
  const BOWLER_SPOT = { x: 1.3, y: PITCH_LEN - 3.5 };

  // ---------- context ----------
  /** Build a fully-resolved simulation context from UI settings. */
  function buildContext(s) {
    const fmt = FORMATS[s.format];
    const phase = fmt.phases[s.phase] || Object.values(fmt.phases)[0];
    const bowler = BOWLERS[s.bowlerType];
    const batter = BATTERS[s.batterProfile] || BATTERS.balanced;
    const pitch = PITCHES[s.pitch] || PITCHES.balanced;
    const ground = CFS.makeGround(s.ground || 'medium');
    const plan = s.plan && s.plan !== 'auto' && PLANS[s.plan] ? PLANS[s.plan] : CFS.autoPlan(bowler, s.phase);
    const swing = (OVERHEAD[s.overhead] || OVERHEAD.sunny).swing;
    const newBall = s.ballAge === 'new';
    const slowerP = bowler.kind === 'pace' && s.format !== 'Test' ? { powerplay: 0.07, middle: 0.16, death: 0.24 }[s.phase] || 0.1 : 0.02;
    return {
      format: s.format, phase: s.phase, phaseInfo: phase,
      bowlerType: s.bowlerType, bowler, hand: s.hand, overWicket: s.overWicket !== false,
      turn: CFS.turnFor(s.bowlerType, s.hand), angle: CFS.angleFor(s.bowlerType, s.hand, s.overWicket !== false),
      batter, batterProfile: s.batterProfile, pitch, pitchKey: s.pitch, ground, plan,
      swing, newBall, dew: !!s.dew,
      decel: (OUTFIELDS[s.outfield] || OUTFIELDS.average).decel,
      aggression: clamp(phase.aggression * batter.aggression * (0.85 + 0.15 * pitch.ease), 0.02, 1),
      wicketValue: s.wicketValue || phase.wicketValue,
      forcedShot: s.forcedShot && SHOTS[s.forcedShot] ? s.forcedShot : null,
      slowerP,
      placement: s.placement != null ? s.placement : Math.max(1, (batter.placement || 2) - (s.format === 'Test' ? 1 : 0)),
    };
  }

  // ---------- field preparation ----------
  function insideGround(x, y, ground) {
    const c = PITCH_LEN / 2;
    return (x * x) / (ground.a * ground.a) + ((y - c) * (y - c)) / (ground.b * ground.b) <= 1;
  }

  function prepareField(field, ctx) {
    const fs = field.fielders.map((f) => {
      const p = toXY(f.theta, f.d);
      return { id: f.id, role: f.role, name: f.name, x: p.x, y: p.y, theta: f.theta, d: f.d, bd: boundaryDist(f.theta, ctx.ground), react: f.d < 12 ? 0.2 : 0.3 };
    });
    // bowler in follow-through: slow to react, limited reach
    fs.push({ id: 'bowler', role: 'bowler', name: 'Bowler', x: BOWLER_SPOT.x, y: BOWLER_SPOT.y, theta: 0, d: PITCH_LEN, react: 0.55, reach: 0.8 });
    const keeper = fs.find((f) => f.role === 'keeper');
    const keeperUp = keeper && keeper.d < 6;

    // Gap factors: batters (sensibly) target gaps. Pre-compute per shot.
    const gap = {};
    for (const id of SHOT_IDS) {
      const s = SHOTS[id];
      if (s.g === 0 || s.theta == null) { gap[id] = 1; continue; }
      const lofted = s.type === 'aerial' || (s.type === 'mixed' && s.loft > 0.5);
      let cov = 0;
      for (const f of fs) {
        if (f.role === 'bowler') continue;
        const bd = boundaryDist(f.theta, ctx.ground);
        if (lofted && f.d < 0.72 * bd) continue;
        if (!lofted && (f.d < 4 || (id === 'push' && f.d > 35))) continue;
        const w = Math.exp(-Math.pow(angDiff(f.theta, s.theta) / (lofted ? 13 : 11), 2));
        cov = Math.max(cov, w);
      }
      gap[id] = 1 + 0.85 * (0.5 - cov); // 0.575 .. 1.425
    }
    return { fs, keeperUp, gap };
  }

  // ---------- shot selection ----------
  function chooseShot(ctx, prep, del, rng) {
    if (ctx.forcedShot) return ctx.forcedShot;
    const kind = ctx.bowler.kind;
    const mods = ctx.batter.mods || {};
    const entries = [];
    for (const id of SHOT_IDS) {
      const s = SHOTS[id];
      let w = (s.L[del.length] || 0) * (s.Ln[del.line] || 0) * (s.vs[kind] || 0) * gradeFactor(s.g, ctx.aggression);
      if (!w) continue;
      for (const t of s.tags) if (mods[t]) w *= mods[t];
      if (id === 'leave' && ctx.format !== 'Test') w *= 0.35 * (1 - ctx.aggression) + 0.05;
      if (del.slower && s.g === 3) w *= 1.1;
      if (kind === 'spin' && ctx.turn === 'away' && (s.tags.includes('offside') || id === 'loftedoff')) w *= 1.12;
      if (kind === 'spin' && ctx.turn === 'in' && s.tags.includes('legside')) w *= 1.12;
      w *= prep.gap[id] || 1;
      entries.push([id, w]);
    }
    return rng.pick(entries);
  }

  // ---------- delivery ----------
  function chooseDelivery(ctx, rng) {
    const length = rng.pick(ctx.plan.L);
    const line = rng.pick(ctx.plan.Ln);
    const slower = ctx.bowler.kind === 'pace' && rng.chance(ctx.slowerP);
    const variation = ctx.bowler.kind === 'spin' && rng.chance(ctx.bowler.spinType === 'wrist' ? 0.15 : 0.1);
    return { length, line, slower, variation };
  }

  // ---------- execution ----------
  function failProbability(ctx, shotId, del) {
    const s = SHOTS[shotId];
    const pitch = ctx.pitch;
    const aff = clamp((s.L[del.length] || 0.05) * (s.Ln[del.line] || 0.05), 0.04, 2);
    let p = s.risk * (1.25 / (0.4 + 0.6 * aff));
    if (del.length === 'yorker' && s.g > 0) p *= 1.3;
    const lofted = s.tags.includes('lofted');
    if (ctx.bowler.kind === 'pace') {
      const move = pitch.seam * (ctx.newBall ? 1.2 : 0.9) * (0.65 + 0.35 * ctx.swing);
      const spd = ctx.bowler.pace === 'fast' ? 1.08 : 0.95;
      p *= (0.45 + 0.55 * move) * spd;
      if (del.length === 'short' || del.length === 'back') p *= Math.pow(pitch.bounce, 0.6);
      if (ctx.angle === 'across' && (del.line === 'off' || del.line === 'wide')) p *= 1.06;
      if (del.slower) p *= lofted ? 1.55 : 1.2;
    } else {
      const turn = pitch.spin * (ctx.dew ? 0.78 : 1) * (ctx.newBall ? 0.9 : 1.08) * (del.variation ? 1.35 : 1);
      p *= (0.62 + 0.38 * turn) * (ctx.bowler.spinType === 'wrist' ? 1.05 : 1);
    }
    p *= Math.pow(pitch.variable, 0.35) * Math.pow(pitch.slow, lofted ? 0.7 : 0.25);
    if (ctx.batter.weak && ctx.batter.weak[del.length]) p *= ctx.batter.weak[del.length];
    p /= Math.pow(pitch.ease, 0.7) * ctx.batter.control;
    return clamp(p, 0.005, 0.85);
  }

  function failType(ctx, shotId, rng) {
    const s = SHOTS[shotId];
    const spin = ctx.bowler.kind === 'spin';
    const w = {
      off: spin ? { edge: 0.33, batpad: 0.17, miss: 0.32, mistime: 0.18 } : { edge: 0.62, miss: 0.24, mistime: 0.14 },
      leg: spin ? { leading: 0.3, inside: 0.15, batpad: 0.12, miss: 0.3, mistime: 0.13 } : { leading: 0.3, inside: 0.25, miss: 0.32, mistime: 0.13 },
      cross: { topedge: 0.5, miss: 0.3, inside: 0.1, mistime: 0.1 },
      loft: { mistime: 0.66, edge: 0.13, topedge: 0.1, miss: 0.11 },
      leave: { miss: 1 },
    }[s.fam];
    const ww = Object.assign({}, w);
    if (spin && ww.batpad) ww.batpad *= ctx.pitch.spin * (ctx.turn === 'in' ? 1.3 : 0.9);
    if (ww.leading) ww.leading *= ctx.pitch.slow;
    if (ww.miss) ww.miss *= Math.sqrt(ctx.pitch.variable);
    return rng.pick(ww);
  }

  // ---------- trajectories ----------
  function hangFromCarry(carry, angleDeg) {
    return Math.sqrt((2 * Math.max(1, carry) * Math.tan(angleDeg * DEG)) / G);
  }

  function powerFactor(ctx) {
    const b = ctx.bowler;
    const onto = b.kind === 'pace' ? 0.9 + 0.12 * b.speed * ctx.pitch.pace : 0.94;
    return ctx.batter.power * onto * Math.pow(ctx.pitch.pace, 0.25) / Math.pow(ctx.pitch.slow, 0.25);
  }

  /**
   * Shot placement: a batter in control aims for the gap. Draw a few
   * candidate directions within the shot's natural arc and keep the one
   * furthest (angularly) from the nearest run-saving fielder in range.
   */
  function placeShot(prep, s, rng, ctx) {
    const tries = ctx.placement;
    let best = rng.normal(s.theta, s.sd), bestGap = -1;
    if (tries <= 1 || s.g === 0) return best;
    const lofted = s.type === 'aerial';
    for (let k = 0; k < tries; k++) {
      const th = k === 0 ? best : rng.normal(s.theta, s.sd);
      let gap = 180;
      for (const f of prep.fs) {
        if (f.d < 4 || f.role === 'bowler') continue;
        if (lofted && f.d < 0.7 * f.bd) continue;
        const a = angDiff(f.theta, th);
        if (a < gap) gap = a;
      }
      if (gap > bestGap) { bestGap = gap; best = th; }
    }
    return best;
  }

  /** Build a ball "flight" description for a clean or failed shot. */
  function makeFlight(ctx, shotId, kind, rng, del, prep) {
    const s = SHOTS[shotId];
    const pf = powerFactor(ctx);
    const pace = ctx.bowler.kind === 'pace';
    const fastness = pace ? (ctx.bowler.pace === 'fast' ? 1 : 0.72) : 0.35;
    switch (kind) {
      case 'clean': {
        const theta = placeShot(prep, s, rng, ctx);
        const aerial = s.type === 'aerial' || (s.type === 'mixed' && rng.chance(s.loft));
        if (aerial) {
          let carry = rng.normal(s.carry * 1.08, 9) * pf * (del.slower ? 0.88 : 1);
          carry = Math.max(15, carry);
          return { theta, aerial: true, carry, hang: hangFromCarry(carry, 24), quality: 'clean', struck: true };
        }
        return { theta, aerial: false, v0: Math.max(3, rng.normal(s.power, s.power * 0.13) * pf) };
      }
      case 'edge': {
        if (!pace) {
          const thick = rng.chance(0.3);
          const theta = thick ? rng.normal(122, 16) : rng.normal(166, 12);
          const carry = Math.max(0.3, rng.normal(thick ? 3.2 : 2.6, 1.3) * Math.sqrt(ctx.pitch.bounce));
          return { theta, aerial: true, carry, hang: carry / 9 + 0.08, quality: 'edge', fast: true, roll: 6 };
        }
        const r = rng();
        const sub = r < 0.33 ? 'thin' : r < 0.8 ? 'regular' : 'thick';
        const theta = sub === 'thin' ? rng.normal(175, 4.5) : sub === 'regular' ? rng.normal(161, 8) : rng.normal(132, 13);
        const base = 21 * fastness * Math.sqrt(ctx.pitch.bounce * ctx.pitch.pace) * (del.slower ? 0.75 : 1);
        const carry = Math.max(1, rng.normal(base * (sub === 'thick' ? 0.85 : 1), base * 0.25));
        const ve = 25 * fastness;
        return { theta, aerial: true, carry, hang: carry / ve + 0.05, quality: 'edge', fast: true, roll: ve * 0.55 };
      }
      case 'batpad': {
        const legSide = ctx.turn === 'in' ? rng.chance(0.7) : rng.chance(0.5);
        const theta = legSide ? rng.normal(-85, 30) : rng.normal(80, 22);
        const carry = Math.max(0.5, rng.normal(4.5, 1.8));
        return { theta, aerial: true, carry, hang: 0.42 + rng() * 0.25, quality: 'batpad', fast: true, roll: 3 };
      }
      case 'leading': {
        const theta = rng.normal(35, 30);
        const carry = Math.max(3, rng.normal(14, 7) * pf);
        return { theta, aerial: true, carry, hang: hangFromCarry(carry, 45), quality: 'leading' };
      }
      case 'inside': {
        if (rng.chance(pace ? 0.3 : 0.25) && (del.line === 'stumps')) return { bowledInside: true };
        if (!pace && rng.chance(0.4)) return makeFlight(ctx, shotId, 'batpad', rng, del, prep);
        return { theta: rng.normal(-152, 16), aerial: false, v0: rng.normal(15, 4) * pf, quality: 'inside' };
      }
      case 'topedge': {
        let mu = -150;
        if (shotId === 'reversesweep') mu = 150;
        else if (shotId === 'scoop' || shotId === 'ramp') mu = 178;
        else if (shotId === 'loftedstraight' || shotId === 'loftedoff') mu = 120;
        const theta = rng.normal(mu, 28);
        const carry = Math.max(4, rng.normal(26, 11) * pf);
        return { theta, aerial: true, carry, hang: hangFromCarry(carry, 66), quality: 'skier' };
      }
      case 'mistime': {
        const lofted = s.type === 'aerial' || (s.type === 'mixed' && rng.chance(Math.max(0.35, s.loft || 0)));
        const theta = rng.normal(s.theta ?? 0, (s.sd || 20) * 1.25);
        if (lofted || s.fam === 'loft') {
          const carry = Math.max(8, rng.normal((s.carry || 50) * 0.6, 10) * pf);
          return { theta, aerial: true, carry, hang: hangFromCarry(carry, 42), quality: 'mistime' };
        }
        return { theta, aerial: false, v0: Math.max(3, (s.power || 15) * 0.45 * pf * (0.7 + rng() * 0.6)), quality: 'mistime' };
      }
    }
    return null;
  }

  // ---------- fielding ----------
  function catchProbability(D, reach, hang, isKeeper, fast, isSkier) {
    const q = D / reach;
    let p;
    if (fast) {
      p = 0.82 - 0.42 * q * q - (hang < 0.45 ? 0.12 : 0);
      if (isKeeper) p += 0.07;
    } else {
      p = 0.94 - 0.6 * q * q;
      if (isSkier) p = Math.min(p, 0.86);
    }
    return clamp(p, 0.05, 0.97);
  }

  function runsFromTime(t, throwDist, ctx) {
    const total = t + 0.6 + throwDist / THROW_SPEED;
    // white-ball batters run harder; quicker singles when attacking
    const first = ({ T10: 2.9, T20: 3.0, ODI: 3.15, Test: 3.45 }[ctx.format] || 3.2) - 0.35 * ctx.aggression;
    if (total < first) return 0;
    return Math.min(3, 1 + Math.floor((total - first) / 3.0));
  }

  function throwDistance(x, y) {
    return Math.min(Math.hypot(x, y), Math.hypot(x, y - PITCH_LEN));
  }

  /**
   * Roll a ground ball from (x0,y0) along theta with speed v0 starting at time t0.
   * Returns {type:'four'|'fielded'|'stopped', runs, fielder, x, y}
   */
  function rollGround(prep, ctx, rng, theta, v0, x0, y0, t0, exclude) {
    const u = { x: Math.sin(theta * DEG), y: Math.cos(theta * DEG) };
    const dec = ctx.decel;
    const sStop = (v0 * v0) / (2 * dec);
    const step = 1.5;
    for (let s = 0.5; s <= sStop; s += step) {
      const px = x0 + u.x * s, py = y0 + u.y * s;
      if (!insideGround(px, py, ctx.ground)) {
        return { type: 'four', runs: 4, x: px, y: py, fielder: null };
      }
      const tb = t0 + (v0 - Math.sqrt(Math.max(0, v0 * v0 - 2 * dec * s))) / dec;
      let best = null;
      for (const f of prep.fs) {
        if (f === exclude) continue;
        const D = Math.hypot(f.x - px, f.y - py);
        // close-in fielders have no time to dive at a hard-hit ball
        let reach = f.reach || STOP_REACH;
        if (f.d < 12 && t0 === 0) { const vNow = Math.sqrt(Math.max(0, v0 * v0 - 2 * dec * s)); if (vNow > 14) reach = Math.min(reach, 0.9); }
        const tn = f.react + Math.max(0, D - reach) / RUN_SPEED;
        if (tn <= tb && (!best || D < best.D)) best = { f, D };
      }
      if (best) {
        let runs = runsFromTime(tb, throwDistance(px, py), ctx);
        if (best.f.d < 10 && tb < 1.2) runs = 0;
        // fumble chance (harder for diving stops / deep fielders)
        const pMis = 0.025 + (best.D > 1.2 ? 0.03 : 0) + (best.f.d > 45 ? 0.02 : 0);
        if (rng.chance(pMis)) runs = Math.min(4, runs + 1);
        return { type: 'fielded', runs, x: px, y: py, fielder: best.f };
      }
    }
    // ball stopped in a gap: nearest fielder chases
    const px = x0 + u.x * sStop, py = y0 + u.y * sStop;
    const tStop = t0 + v0 / dec;
    let best = null;
    for (const f of prep.fs) {
      const D = Math.hypot(f.x - px, f.y - py);
      const tf = f.react + D / RUN_SPEED;
      if (!best || tf < best.tf) best = { f, tf };
    }
    const t = Math.max(tStop, best.tf);
    let runs = runsFromTime(t, throwDistance(px, py), ctx);
    // dead-batted near the pitch: only a pinched single, and only sometimes
    if (Math.hypot(px, py) < 9) runs = rng.chance(0.3 * ctx.aggression) ? 1 : 0;
    return { type: 'stopped', runs, x: px, y: py, fielder: best.f };
  }

  /** Resolve an aerial ball. Returns outcome object. */
  function resolveAerial(prep, ctx, rng, fl) {
    const u = { x: Math.sin(fl.theta * DEG), y: Math.cos(fl.theta * DEG) };
    const lx = u.x * fl.carry, ly = u.y * fl.carry;
    const bd = boundaryDist(fl.theta, ctx.ground);
    const isSkier = fl.quality === 'skier';

    if (fl.carry > bd) {
      // over the rope — chance for a boundary catch only if it's barely clearing
      if (fl.carry - bd < 2.2) {
        const cx = u.x * (bd - 0.6), cy = u.y * (bd - 0.6);
        let best = null;
        for (const f of prep.fs) {
          const D = Math.hypot(f.x - cx, f.y - cy);
          const reach = CATCH_RUN * Math.max(0, fl.hang - f.react) + CATCH_REACH;
          if (D <= reach && (!best || D < best.D)) best = { f, D };
        }
        if (best && rng.chance(0.42)) {
          return { type: 'out', how: 'caught', fielder: best.f, x: cx, y: cy, chance: true, boundaryCatch: true };
        }
      }
      return { type: 'six', runs: 6, x: lx, y: ly };
    }

    // catch attempts
    let best = null;
    for (const f of prep.fs) {
      const D = Math.hypot(f.x - lx, f.y - ly);
      let reach;
      if (fl.fast) reach = Math.min(2.8, 0.85 + 3.2 * Math.max(0, fl.hang - 0.16));
      else reach = CATCH_RUN * Math.max(0, fl.hang - f.react) + CATCH_REACH;
      if (D <= reach) {
        let p = catchProbability(D, reach, fl.hang, f.role === 'keeper', fl.fast, isSkier);
        if (fl.struck) p *= 0.82; // flat, clean hits are hard catches
        if (!best || p > best.p) best = { f, D, p };
      }
    }
    if (best) {
      if (rng.chance(best.p)) return { type: 'out', how: 'caught', fielder: best.f, x: lx, y: ly, chance: true };
      // dropped
      return { type: 'dropped', runs: rng.chance(0.4) ? 1 : 0, fielder: best.f, x: lx, y: ly, chance: true };
    }
    // lands safe and rolls on
    const horiz = fl.carry / Math.max(0.2, fl.hang);
    const v = fl.roll != null ? fl.roll : horiz * 0.38;
    const g = rollGround(prep, ctx, rng, fl.theta, Math.max(1, v), lx, ly, fl.hang, null);
    return Object.assign(g, { landed: { x: lx, y: ly } });
  }

  // ---------- one ball ----------
  function simulateBall(prep, ctx, rng) {
    const del = chooseDelivery(ctx, rng);
    const shot = chooseShot(ctx, prep, del, rng);
    const s = SHOTS[shot];
    const ev = { del, shot, runs: 0, out: null, theta: null, x: 0, y: 0, aerial: false, fielder: null, quality: 'clean', chance: false };

    const pf = failProbability(ctx, shot, del);
    const failed = rng.chance(pf);

    if (shot === 'leave') {
      if (failed && (del.line === 'off' || del.line === 'stumps')) {
        ev.out = rng.chance(0.55) ? 'bowled' : 'lbw';
        ev.quality = 'leave';
      }
      ev.y = -1; ev.quality = ev.out ? 'leave' : 'left';
      return ev;
    }

    let kind = 'clean';
    if (failed) kind = failType(ctx, shot, rng);
    ev.quality = kind;

    if (kind === 'miss') {
      const pace = ctx.bowler.kind === 'pace';
      let pW = 0;
      if (del.line === 'stumps') pW = 0.45 * Math.pow(ctx.pitch.variable, 0.4);
      else if (del.line === 'pads') pW = !pace && ctx.turn === 'in' ? 0.16 : 0.08;
      else if (del.line === 'off') pW = pace ? 0.07 * ctx.pitch.seam : (ctx.turn === 'in' ? 0.14 : 0.04);
      if (rng.chance(pW)) {
        ev.out = rng.chance(0.55) ? 'bowled' : 'lbw';
      } else if (!pace && prep.keeperUp && (s.g >= 3 || shot === 'loftedstraight') && rng.chance(0.5)) {
        ev.out = 'stumped';
        ev.fielder = prep.fs.find((f) => f.role === 'keeper');
      }
      ev.y = -1;
      return ev;
    }

    const fl = makeFlight(ctx, shot, kind, rng, del, prep);
    if (fl.bowledInside) { ev.out = 'bowled'; ev.quality = 'inside edge'; ev.y = -1; return ev; }
    ev.theta = normAngle(fl.theta);
    fl.theta = ev.theta;
    ev.aerial = !!fl.aerial;

    let res;
    if (fl.aerial) res = resolveAerial(prep, ctx, rng, fl);
    else res = rollGround(prep, ctx, rng, fl.theta, fl.v0, 0, 0, 0, null);

    ev.x = res.x; ev.y = res.y; ev.fielder = res.fielder || null; ev.chance = !!res.chance;
    ev.landed = res.landed || (fl.aerial ? { x: res.x, y: res.y } : null);
    if (res.type === 'out') { ev.out = res.how; ev.boundaryCatch = !!res.boundaryCatch; }
    else if (res.type === 'six') ev.runs = 6;
    else if (res.type === 'four') ev.runs = 4;
    else { ev.runs = res.runs; if (res.type === 'dropped') ev.dropped = true; }
    return ev;
  }

  // ---------- batch evaluation ----------
  function emptyStats() {
    return { balls: 0, runs: 0, wkts: 0, dots: 0, singles: 0, twos: 0, threes: 0, fours: 0, sixes: 0, caught: 0, bowled: 0, lbw: 0, stumped: 0, drops: 0, chances: 0, edges: 0, byShot: {}, byFielder: {}, sectors: new Array(24).fill(0).map(() => ({ runs: 0, n: 0, boundaries: 0, outs: 0 })), wagon: [] };
  }

  function record(st, ev, keepWagon) {
    st.balls++;
    const r = ev.runs;
    st.runs += r;
    if (ev.out) {
      st.wkts++;
      st[ev.out] = (st[ev.out] || 0) + 1;
    } else if (r === 0) st.dots++;
    else if (r === 1) st.singles++;
    else if (r === 2) st.twos++;
    else if (r === 3) st.threes++;
    else if (r === 4) st.fours++;
    else if (r === 6) st.sixes++;
    if (ev.dropped) st.drops++;
    if (ev.chance) st.chances++;
    if (ev.quality === 'edge') st.edges++;
    const bs = (st.byShot[ev.shot] = st.byShot[ev.shot] || { n: 0, runs: 0, outs: 0 });
    bs.n++; bs.runs += r; if (ev.out) bs.outs++;
    if (ev.fielder && ev.fielder.id != null) {
      const bf = (st.byFielder[ev.fielder.id] = st.byFielder[ev.fielder.id] || { involved: 0, catches: 0, drops: 0, stops: 0, runsConceded: 0 });
      bf.involved++;
      if (ev.out === 'caught' || ev.out === 'stumped') bf.catches++;
      else if (ev.dropped) bf.drops++;
      else { bf.stops++; bf.runsConceded += r; }
    }
    if (ev.theta != null) {
      const idx = Math.floor(((ev.theta + 180) % 360) / 15) % 24;
      const sec = st.sectors[idx];
      sec.n++; sec.runs += r; if (r >= 4) sec.boundaries++; if (ev.out) sec.outs++;
    }
    if (keepWagon && st.wagon.length < keepWagon && ev.theta != null) {
      st.wagon.push({ x: ev.x, y: ev.y, runs: r, out: ev.out, aerial: ev.aerial, shot: ev.shot });
    }
  }

  function finalise(st, ctx) {
    const b = Math.max(1, st.balls);
    st.rpo = (st.runs / b) * 6;
    st.sr = (st.runs / b) * 100;
    st.wpo = (st.wkts / b) * 6;
    st.bpw = st.wkts ? b / st.wkts : Infinity;
    st.dotPct = st.dots / b;
    st.boundaryPct = (st.fours + st.sixes) / b;
    st.net = st.rpo - ctx.wicketValue * st.wpo; // lower is better for the bowling side
    return st;
  }

  /**
   * Evaluate a field over N balls with common random numbers (each ball i
   * uses seed+i), so two fields are compared on the same deliveries.
   */
  function evaluateField(field, ctx, opts = {}) {
    const N = opts.balls || 1200;
    const seed = opts.seed == null ? 12345 : opts.seed;
    const prep = prepareField(field, ctx);
    const st = emptyStats();
    for (let i = 0; i < N; i++) {
      const rng = makeRng((seed + i * 2654435761) >>> 0);
      record(st, simulateBall(prep, ctx, rng), opts.wagon || 0);
    }
    return finalise(st, ctx);
  }

  /** Commentary-style description of a single event. */
  function describeEvent(ev, field, ctx) {
    const shot = SHOTS[ev.shot].name;
    const lenNames = { yorker: 'yorker', full: 'full', good: 'good length', back: 'back of a length', short: 'short' };
    const lineNames = { wide: 'wide outside off', off: 'outside off', stumps: 'on the stumps', pads: 'on the pads' };
    let del = `${lenNames[ev.del.length]}, ${lineNames[ev.del.line]}`;
    if (ev.del.slower) del = 'slower ball, ' + del;
    if (ev.del.variation) del = (ctx.bowler.spinType === 'wrist' ? "wrong'un" : 'arm ball') + ', ' + del;
    const fname = ev.fielder ? (ev.fielder.role === 'bowler' ? 'the bowler' : `${ev.fielder.name} at ${CFS.positionName(field.fielders.find((f) => f.id === ev.fielder.id) || { theta: 0, d: 20, role: 'fielder' }, ctx.ground, field.keeperMode)}`) : '';
    const where = ev.theta != null ? CFS.describe(ev.theta, Math.hypot(ev.x, ev.y), ctx.ground).replace(' (adj.)', '') : '';
    let res;
    if (ev.out === 'caught') res = `OUT! Caught by ${fname}${ev.boundaryCatch ? ' on the boundary' : ''}.`;
    else if (ev.out === 'stumped') res = 'OUT! Stumped — beaten in the flight.';
    else if (ev.out === 'bowled') res = 'OUT! Bowled!';
    else if (ev.out === 'lbw') res = 'OUT! LBW — trapped in front.';
    else if (ev.runs === 6) res = `SIX! Over ${where}.`;
    else if (ev.runs === 4) res = `FOUR through ${where}.`;
    else if (ev.dropped) res = `Dropped! ${fname} puts it down. ${ev.runs} run${ev.runs === 1 ? '' : 's'}.`;
    else if (ev.quality === 'left') res = 'Left alone.';
    else if (ev.theta == null) res = 'Beaten! Dot ball.';
    else if (ev.runs === 0) res = `Dot — fielded by ${fname}.`;
    else res = `${ev.runs} run${ev.runs === 1 ? '' : 's'} — towards ${where}${fname ? ', ' + fname : ''}.`;
    const qual = { edge: ' (edged)', topedge: ' (top edge)', leading: ' (leading edge)', mistime: ' (mistimed)', batpad: ' (bat-pad)', inside: ' (inside edge)' }[ev.quality] || '';
    return { delivery: del, shot: shot + qual, result: res };
  }

  Object.assign(CFS, {
    buildContext, prepareField, simulateBall, evaluateField, describeEvent, emptyStats, record, finalise,
    insideGround, RUN_SPEED,
  });
})(typeof window !== 'undefined' ? window : globalThis);
