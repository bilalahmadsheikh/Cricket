/*
 * Analytics: compare/rank fields, pitch × field matrix, field optimiser,
 * and plain-English insights. Long jobs are written as generators so the UI
 * can run them in chunks (keeping the page responsive) and tests can run
 * them synchronously.
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;
  const { evaluateField, buildContext, fieldFromPreset, presetsFor, checkRules, spotFor, POSITIONS, positionName, deepClone, PITCHES, toXY, fmt, pct } = CFS;

  const OBJECTIVES = {
    balanced: { name: 'Balanced (runs vs wickets)', wMult: 1 },
    wickets: { name: 'Take wickets', wMult: 1.8 },
    runs: { name: 'Stop runs', wMult: 0.45 },
  };

  function objectiveScore(st, ctx, objective = 'balanced') {
    const m = (OBJECTIVES[objective] || OBJECTIVES.balanced).wMult;
    return st.rpo - ctx.wicketValue * m * st.wpo;
  }

  /** Run a generator to completion synchronously (tests / small jobs). */
  function runSync(gen) {
    let r = gen.next();
    while (!r.done) r = gen.next();
    return r.value;
  }

  /** Run a generator in timed slices so the UI stays responsive. */
  function runAsync(gen, onProgress, token = {}, sliceMs = 30) {
    return new Promise((resolve, reject) => {
      function step() {
        if (token.cancelled) return resolve(null);
        const t0 = performance.now();
        try {
          let r;
          do {
            r = gen.next();
            if (r.done) return resolve(r.value);
            if (onProgress && r.value) onProgress(r.value);
          } while (performance.now() - t0 < sliceMs);
        } catch (e) { return reject(e); }
        setTimeout(step, 0);
      }
      setTimeout(step, 0);
    });
  }

  // ---------- ranking ----------
  function* rankFieldsGen(settings, currentField, opts = {}) {
    const ctx = buildContext(settings);
    const balls = opts.balls || 2400;
    const candidates = presetsFor(ctx, { includeTraps: true, minFit: 2 })
      .map((p) => ({ label: p.name, preset: p, field: fieldFromPreset(p, ctx.ground), plan: p.plan }));
    if (currentField) candidates.unshift({ label: 'Current field' + (currentField.name ? ` (${currentField.name})` : ''), field: currentField, current: true, plan: settings.plan });
    const out = [];
    let i = 0;
    for (const c of candidates) {
      // Use the preset's own bowling plan when the user has the plan on "auto".
      const s2 = Object.assign({}, settings);
      if ((settings.plan === 'auto' || !settings.plan) && c.preset && c.preset.plan) s2.plan = c.preset.plan;
      const cctx = buildContext(s2);
      const st = evaluateField(c.field, cctx, { balls, seed: opts.seed || 777 });
      const rules = checkRules(c.field, cctx, cctx.ground);
      out.push({ ...c, stats: st, score: objectiveScore(st, cctx, opts.objective), legal: rules.ok, issues: rules.issues });
      yield { done: ++i, total: candidates.length, label: c.label };
    }
    out.sort((a, b) => (a.legal === b.legal ? a.score - b.score : a.legal ? -1 : 1));
    return out;
  }

  // ---------- pitch matrix ----------
  function* pitchMatrixGen(settings, opts = {}) {
    const ctx0 = buildContext(settings);
    const presets = presetsFor(ctx0, { includeTraps: true, minFit: 2 });
    const pitches = Object.keys(PITCHES);
    const balls = opts.balls || 1200;
    const cells = {};
    let n = 0;
    const total = presets.length * pitches.length;
    for (const pk of pitches) {
      for (const p of presets) {
        const s2 = Object.assign({}, settings, { pitch: pk });
        if ((settings.plan === 'auto' || !settings.plan) && p.plan) s2.plan = p.plan;
        const cctx = buildContext(s2);
        const st = evaluateField(fieldFromPreset(p, cctx.ground), cctx, { balls, seed: opts.seed || 4242 });
        const legal = checkRules(fieldFromPreset(p, cctx.ground), cctx, cctx.ground).ok;
        cells[p.id + '|' + pk] = { rpo: st.rpo, bpw: st.bpw, wpo: st.wpo, score: objectiveScore(st, cctx, opts.objective), legal };
        yield { done: ++n, total, label: `${PITCHES[pk].short}: ${p.name}` };
      }
    }
    const best = {};
    for (const pk of pitches) {
      let b = null;
      for (const p of presets) {
        const c = cells[p.id + '|' + pk];
        if (!c.legal) continue;
        if (!b || c.score < b.score) b = { id: p.id, score: c.score };
      }
      best[pk] = b && b.id;
    }
    return { presets, pitches, cells, best };
  }

  // ---------- optimiser ----------
  /**
   * Greedy hill-climb: repeatedly make the single fielder move (to any
   * catalogue position) that most improves the objective, using common
   * random numbers so the comparison is fair. Moves must keep the field legal.
   */
  function* optimizeGen(settings, field, opts = {}) {
    const ctx = buildContext(settings);
    const balls = opts.balls || 500;
    const maxIter = opts.maxIter || 6;
    const seed = opts.seed || 9001;
    const objective = opts.objective || 'balanced';
    let cur = deepClone(field);
    let curScore = objectiveScore(evaluateField(cur, ctx, { balls, seed }), ctx, objective);
    const startScore = curScore;
    const log = [];
    const cands = POSITIONS.filter((p) => p.id !== 'wk').map((p) => ({ id: p.id, ...spotFor(p.id, ctx.ground, { keeperMode: cur.keeperMode }) }));
    const outfielders = () => cur.fielders.filter((f) => f.role === 'fielder');
    const totalSteps = maxIter * outfielders().length * cands.length;
    let steps = 0;

    for (let it = 0; it < maxIter; it++) {
      let best = null;
      for (const f of outfielders()) {
        for (const c of cands) {
          steps++;
          // skip spots already occupied
          const cp = toXY(c.theta, c.d);
          if (cur.fielders.some((g) => { const gp = toXY(g.theta, g.d); return Math.hypot(gp.x - cp.x, gp.y - cp.y) < 3.5; })) continue;
          const trial = deepClone(cur);
          const tf = trial.fielders.find((g) => g.id === f.id);
          tf.theta = c.theta; tf.d = c.d;
          if (!checkRules(trial, ctx, ctx.ground).ok) continue;
          const sc = objectiveScore(evaluateField(trial, ctx, { balls, seed }), ctx, objective);
          if (sc < curScore - 0.03 && (!best || sc < best.score)) best = { score: sc, fid: f.id, to: c, from: { theta: f.theta, d: f.d } };
          if (steps % 6 === 0) yield { done: steps, total: totalSteps, label: `Pass ${it + 1}: trying ${f.name} → ${CFS.POS_BY_ID[c.id].name}` };
        }
      }
      if (!best) break;
      const mf = cur.fielders.find((g) => g.id === best.fid);
      const fromName = positionName(mf, ctx.ground, cur.keeperMode);
      mf.theta = best.to.theta; mf.d = best.to.d;
      log.push({ fielder: mf.name, from: fromName, to: CFS.POS_BY_ID[best.to.id].name, gain: curScore - best.score });
      curScore = best.score;
    }
    // verify on a larger, independent sample
    const verifyBalls = opts.verifyBalls || 3000;
    const before = evaluateField(field, ctx, { balls: verifyBalls, seed: seed + 1 });
    const after = evaluateField(cur, ctx, { balls: verifyBalls, seed: seed + 1 });
    cur.name = (field.name || 'Field') + ' — optimised';
    cur.presetId = null;
    return { field: cur, log, before, after, startScore, endScore: curScore, improved: objectiveScore(after, ctx, objective) < objectiveScore(before, ctx, objective) };
  }

  /** Quick: find which fielder should be moved to a requested spot (voice "add a slip"). */
  function bestFielderToMove(settings, field, posId, opts = {}) {
    const ctx = buildContext(settings);
    const spot = spotFor(posId, ctx.ground, { keeperMode: field.keeperMode });
    let best = null;
    for (const f of field.fielders) {
      if (f.role !== 'fielder') continue;
      const trial = deepClone(field);
      const tf = trial.fielders.find((g) => g.id === f.id);
      tf.theta = spot.theta; tf.d = spot.d;
      const legal = checkRules(trial, ctx, ctx.ground).ok;
      const sc = objectiveScore(evaluateField(trial, ctx, { balls: opts.balls || 600, seed: 31337 }), ctx, opts.objective);
      const key = (legal ? 0 : 1000) + sc;
      if (!best || key < best.key) best = { key, fielder: f, legal, score: sc };
    }
    return best;
  }

  // ---------- insights ----------
  function sectorLabel(idx, ctx) {
    const mid = -180 + idx * 15 + 7.5;
    const deep = CFS.boundaryDist(mid, ctx.ground) - 4;
    return CFS.describe(mid, deep, ctx.ground).replace(' (adj.)', '');
  }

  function insights(st, field, ctx) {
    const out = [];
    const b = st.balls || 1;
    out.push({ kind: 'summary', text: `Economy ${fmt(st.rpo, 2)} rpo · wicket every ${Number.isFinite(st.bpw) ? fmt(st.bpw, 1) : '∞'} balls · ${pct(st.dotPct)} dots · ${pct(st.boundaryPct, 1)} boundary balls.` });

    // boundary leaks
    const boundaries = st.fours + st.sixes;
    if (boundaries > 0) {
      const secs = st.sectors.map((s, i) => ({ i, ...s })).sort((a, c) => c.boundaries - a.boundaries);
      const top = secs[0];
      const share = top.boundaries / boundaries;
      if (share > 0.12) {
        out.push({ kind: 'leak', text: `${pct(share)} of boundaries leak through the ${sectorLabel(top.i, ctx)} region — consider a fielder there (try voice: "move <fielder> to ${sectorLabel(top.i, ctx).toLowerCase()}").`, sector: top.i });
      }
      if (secs[1] && secs[1].boundaries / boundaries > 0.12) {
        out.push({ kind: 'leak', text: `Second-biggest leak: ${sectorLabel(secs[1].i, ctx)} (${pct(secs[1].boundaries / boundaries)} of boundaries).`, sector: secs[1].i });
      }
    }
    // wicket takers / idle fielders
    const fl = field.fielders.map((f) => ({ f, s: st.byFielder[f.id] || { involved: 0, catches: 0, drops: 0, stops: 0 } }));
    const catchers = fl.filter((x) => x.s.catches > 0).sort((a, c) => c.s.catches - a.s.catches);
    if (catchers.length && st.wkts) {
      const c = catchers[0];
      out.push({ kind: 'wicket', text: `${c.f.name} at ${positionName(c.f, ctx.ground, field.keeperMode)} is the key catcher (${pct(c.s.catches / st.wkts)} of wickets).` });
    }
    const idle = fl.filter((x) => x.f.role === 'fielder').sort((a, c) => a.s.involved - c.s.involved)[0];
    if (idle && idle.s.involved / b < 0.012 && idle.s.catches === 0) {
      out.push({ kind: 'idle', text: `${idle.f.name} at ${positionName(idle.f, ctx.ground, field.keeperMode)} is almost never involved (${pct(idle.s.involved / b, 1)} of balls) — a candidate to move.` });
    }
    // dismissal mix
    if (st.wkts) {
      const bowledLbw = (st.bowled + st.lbw) / st.wkts;
      if (bowledLbw > 0.4) out.push({ kind: 'plan', text: `${pct(bowledLbw)} of wickets are bowled/LBW — attack the stumps; catchers are less critical on this surface.` });
      if (st.drops / Math.max(1, st.chances) > 0.3) out.push({ kind: 'plan', text: `${pct(st.drops / st.chances)} of chances go down — many are hard, low/reaction catches. Consider a straighter/finer cordon.` });
    }
    // shot danger
    const shots = Object.entries(st.byShot).filter(([, v]) => v.n > b * 0.02).map(([k, v]) => ({ k, rpb: v.runs / v.n, ...v })).sort((a, c) => c.runs - a.runs);
    if (shots[0]) out.push({ kind: 'shot', text: `Most damaging shot: ${CFS.SHOTS[shots[0].k].name} (${pct(shots[0].runs / Math.max(1, st.runs))} of runs, ${fmt(shots[0].rpb * 6, 1)} per 6 balls).` });
    out.push({ kind: 'pitch', text: `Pitch: ${ctx.pitch.tip}` });
    return out;
  }

  Object.assign(CFS, { OBJECTIVES, objectiveScore, runSync, runAsync, rankFieldsGen, pitchMatrixGen, optimizeGen, bestFielderToMove, insights, sectorLabel });
})(typeof window !== 'undefined' ? window : globalThis);
