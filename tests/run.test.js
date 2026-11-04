// Run with:  node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['core', 'positions', 'conditions', 'presets', 'field', 'sim', 'analytics', 'voice']) require(`../js/${f}.js`);
const C = globalThis.CFS;

const BASE = { format: 'T20', phase: 'powerplay', bowlerType: 'rf', hand: 'R', batterProfile: 'balanced', plan: 'auto', pitch: 'balanced', overhead: 'sunny', ballAge: 'new', outfield: 'average', ground: 'medium', dew: false, overWicket: true };
const env = { presetFit: () => 0 };
const parse = (t) => C.parseCommand(t, env, { bowlerArm: 'R' });

// ---------------- geometry ----------------
test('boundary distance: straight and square from the striker', () => {
  const g = C.makeGround('medium');
  // straight down the ground = half-length + half pitch
  assert.ok(Math.abs(C.boundaryDist(0, g) - (g.b + C.PITCH_LEN / 2)) < 1e-6);
  // square: slightly more than half-width (striker is off-centre)
  const sq = C.boundaryDist(90, g);
  assert.ok(sq > g.a * 0.95 && sq < g.a * 1.05);
});

test('30-yard ring geometry', () => {
  assert.ok(C.insideRingPolar(90, 25));
  assert.ok(!C.insideRingPolar(90, 30));
  assert.ok(C.insideRingPolar(0, C.PITCH_LEN + 25)); // straight, behind bowler
  assert.ok(!C.insideRingPolar(0, C.PITCH_LEN + 30));
});

test('polar <-> cartesian round trip', () => {
  for (const [t, d] of [[0, 10], [90, 20], [-135, 40], [180, 5]]) {
    const p = C.toXY(t, d), q = C.fromXY(p.x, p.y);
    assert.ok(C.angDiff(q.theta, t) < 1e-6 && Math.abs(q.d - d) < 1e-6);
  }
});

// ---------------- positions ----------------
test('every catalogued position classifies as itself', () => {
  const g = C.makeGround('medium');
  for (const p of C.POSITIONS) {
    if (p.id === 'wk') continue;
    const s = C.spotFor(p.id, g);
    assert.equal(C.classify(s.theta, s.d, g).pos.id, p.id, p.id);
  }
});

test('voice aliases & mis-hearings match positions', () => {
  const cases = { 'mid on': 'midon', 'mid one': 'midon', 'long of': 'longoff', 'find leg': 'fineleg', 'galley': 'gully', '2nd slip': null, 'second slip': 'slip2', 'third man': 'thirdman', 'sweeper': 'deepcoverpoint', 'cow corner': 'cowcorner', 'mid wicked': 'midwicket', 'short fine': 'shortfine' };
  for (const [k, v] of Object.entries(cases)) {
    if (v === null) continue;
    const m = C.matchPosition(k);
    assert.ok(m, k);
    assert.equal(m.id, v, k);
  }
});

// ---------------- presets & rules ----------------
test('every preset has 9 distinct, known positions', () => {
  for (const p of C.PRESETS) {
    assert.equal(p.positions.length, 9, p.id);
    assert.equal(new Set(p.positions).size, 9, p.id);
    for (const id of p.positions) assert.ok(C.POS_BY_ID[id], `${p.id}: ${id}`);
  }
});

test('presets respect the leg-side law (max 2 behind square)', () => {
  const g = C.makeGround('medium');
  for (const p of C.PRESETS) {
    const f = C.fieldFromPreset(p, g);
    const r = C.checkRules(f, { format: 'Test', phase: 'oldball' }, g);
    assert.ok(r.info.behindLeg <= 2, `${p.id} has ${r.info.behindLeg}`);
  }
});

test('non-trap presets are legal in at least one of their phases', () => {
  const g = C.makeGround('medium');
  for (const p of C.PRESETS.filter((x) => !x.trap)) {
    const f = C.fieldFromPreset(p, g);
    const ok = p.formats.some((fmt) => p.phases.some((ph) => C.FORMATS[fmt].phases[ph] && C.checkRules(f, { format: fmt, phase: ph }, g).ok));
    assert.ok(ok, p.id);
  }
});

test('powerplay restriction is enforced', () => {
  const g = C.makeGround('medium');
  const f = C.fieldFromPreset(C.PRESET_BY_ID.pace_death, g);
  const r = C.checkRules(f, { format: 'T20', phase: 'powerplay' }, g);
  assert.equal(r.ok, false);
  assert.match(r.issues[0], /outside the 30-yard circle/);
});

test('mirroring swaps off and leg counts', () => {
  const g = C.makeGround('medium');
  const f = C.fieldFromPreset(C.PRESET_BY_ID.trap_offstack, g);
  const a = C.checkRules(f, { format: 'Test', phase: 'oldball' }, g).info;
  const b = C.checkRules(C.mirrorField(f), { format: 'Test', phase: 'oldball' }, g).info;
  assert.equal(a.off, b.leg);
  assert.equal(a.leg, b.off);
});

// ---------------- simulation ----------------
function evalPreset(s, id, balls = 4000) {
  const ctx = C.buildContext(Object.assign({}, BASE, s));
  return C.evaluateField(C.fieldFromPreset(C.PRESET_BY_ID[id], ctx.ground), ctx, { balls, seed: 99 });
}

test('simulation is deterministic for a given seed', () => {
  const a = evalPreset({}, 'pace_pp_standard', 1500), b = evalPreset({}, 'pace_pp_standard', 1500);
  assert.equal(a.runs, b.runs);
  assert.equal(a.wkts, b.wkts);
});

test('economy rates are in realistic ranges per format', () => {
  const t20 = evalPreset({}, 'pace_pp_standard');
  assert.ok(t20.rpo > 6 && t20.rpo < 10.5, `T20 PP rpo ${t20.rpo}`);
  assert.ok(t20.bpw > 12 && t20.bpw < 40, `T20 PP bpw ${t20.bpw}`);
  const test_ = evalPreset({ format: 'Test', phase: 'newball' }, 'pace_test_standard');
  assert.ok(test_.rpo > 2 && test_.rpo < 4.5, `Test rpo ${test_.rpo}`);
  assert.ok(test_.bpw > 25, `Test bpw ${test_.bpw}`);
});

test('pitch matters: green seamer produces more wickets than a flat road for pace', () => {
  const green = evalPreset({ format: 'Test', phase: 'newball', pitch: 'green' }, 'pace_test_standard');
  const flat = evalPreset({ format: 'Test', phase: 'newball', pitch: 'flat' }, 'pace_test_standard');
  assert.ok(green.wpo > flat.wpo * 1.3, `green ${green.wpo} vs flat ${flat.wpo}`);
  assert.ok(flat.rpo > green.rpo);
});

test('turning pitch helps spin more than pace', () => {
  const spinDry = evalPreset({ format: 'Test', phase: 'oldball', bowlerType: 'rls', pitch: 'dry', ballAge: 'old' }, 'spin_away_test_attack');
  const spinFlat = evalPreset({ format: 'Test', phase: 'oldball', bowlerType: 'rls', pitch: 'flat', ballAge: 'old' }, 'spin_away_test_attack');
  assert.ok(spinDry.wpo > spinFlat.wpo);
});

test('fields matter: slips take catches; removing the cordon loses wickets on a green top', () => {
  const s = { format: 'Test', phase: 'newball', pitch: 'green' };
  const att = evalPreset(s, 'pace_test_umbrella', 6000);
  const def = evalPreset(s, 'pace_test_contain', 6000);
  assert.ok(att.wpo > def.wpo, `attack ${att.wpo} vs contain ${def.wpo}`);
});

test('left-hander mirrors the field: identical stats when everything is mirrored', () => {
  const r = evalPreset({ hand: 'R', bowlerType: 'rf' }, 'pace_pp_standard', 2000);
  const l = evalPreset({ hand: 'L', bowlerType: 'lf' }, 'pace_pp_standard', 2000);
  // same relative geometry → same results
  assert.equal(r.runs, l.runs);
});

test('forced shot focus only plays that shot', () => {
  const st = evalPreset({ forcedShot: 'pull' }, 'pace_pp_standard', 500);
  assert.deepEqual(Object.keys(st.byShot), ['pull']);
});

// ---------------- analytics ----------------
test('ranking returns sorted legal fields first', () => {
  const res = C.runSync(C.rankFieldsGen(BASE, null, { balls: 400 }));
  assert.ok(res.length >= 3);
  const firstIllegal = res.findIndex((r) => !r.legal);
  if (firstIllegal >= 0) assert.ok(res.slice(firstIllegal).every((r) => !r.legal));
  for (let i = 1; i < res.length; i++) if (res[i].legal === res[i - 1].legal) assert.ok(res[i].score >= res[i - 1].score);
});

test('optimiser never makes the field worse on its own sample and stays legal', () => {
  const ctx = C.buildContext(BASE);
  const f = C.fieldFromPreset(C.PRESET_BY_ID.trap_ring, ctx.ground);
  const res = C.runSync(C.optimizeGen(BASE, f, { balls: 200, maxIter: 2, verifyBalls: 500 }));
  assert.ok(res.endScore <= res.startScore);
  assert.ok(C.checkRules(res.field, BASE, ctx.ground).ok);
});

// ---------------- voice parser ----------------
test('parser: moves', () => {
  assert.deepEqual(parse('move long on to mid on')[0], { type: 'move', from: 'long on', to: 'mid on', confidence: 1.02 });
  assert.equal(parse('Captain, shift third man over to second slip')[0].to, 'second slip');
  assert.equal(parse('long on 2 mid on')[0].type, 'move');
  assert.equal(parse('put fine leg at short fine leg')[0].from, 'fine leg');
  const two = parse('move long on to mid on and fine leg to short fine leg');
  assert.equal(two.length, 2);
});

test('parser: relative moves, swaps, adds', () => {
  assert.equal(parse('bring mid off up')[0].dir, 'in');
  assert.equal(parse('push fine leg back')[0].dir, 'out');
  const sq = parse('move point a bit squarer')[0];
  assert.equal(sq.dir, 'squarer'); assert.equal(sq.small, true);
  assert.equal(parse('swap point and cover')[0].type, 'swap');
  assert.deepEqual(parse('add a slip')[0], { type: 'add', to: 'slip' });
  assert.equal(parse('bring in a short leg')[0].type, 'add');
});

test('parser: settings', () => {
  const s = (t) => parse(t)[0].settings;
  assert.equal(s('left hander').hand, 'L');
  assert.equal(s('right arm leg spinner').bowlerType, 'rls');
  assert.equal(s('bowler left arm orthodox').bowlerType, 'lob');
  assert.equal(s('change bowler to left arm fast').bowlerType, 'lf');
  assert.equal(s('medium pacer').bowlerType, 'rmf');
  assert.equal(s('green pitch').pitch, 'green');
  assert.equal(s('the pitch is dusty').pitch, 'dusty');
  assert.equal(s('twenty twenty').format, 'T20');
  assert.equal(s('one day').format, 'ODI');
  assert.equal(s('test').format, 'Test');
  assert.equal(s('outside the powerplay').phase, 'middle');
  assert.equal(s('power play').phase, 'powerplay');
  assert.equal(s('death overs').phase, 'death');
  assert.equal(s('fast outfield').outfield, 'fast');
  assert.equal(s('small boundaries').ground, 'small');
  assert.equal(s('bowl short').plan, 'short');
  assert.equal(s('around the wicket').overWicket, false);
});

test('parser: presets, sim, analytics, info', () => {
  assert.equal(parse('bouncer trap')[0].id, 'trap_bouncer');
  assert.equal(parse('load the death field')[0].id, 'pace_death');
  assert.deepEqual(parse('bowl an over')[0], { type: 'simulate', balls: 6, shot: null });
  assert.equal(parse('simulate cover drive')[0].shot, 'coverdrive');
  assert.equal(parse('simulate 5 overs of pull shots')[0].balls, 30);
  assert.equal(parse('which field is best')[0].type, 'recommend');
  assert.equal(parse('load the best field')[0].apply, true);
  assert.equal(parse('optimize the field')[0].type, 'optimise');
  assert.equal(parse('compare pitches')[0].type, 'matrix');
  assert.equal(parse('where is mid on')[0].type, 'where');
  assert.equal(parse('apply')[0].type, 'apply');
  assert.equal(parse('undo')[0].type, 'undo');
  assert.equal(parse('blah blah nonsense').length, 0);
});

// ---------------- v1.1: T10, zones, fuzzy matching ----------------
test('T10 format: 2-over powerplay with 2 out, then 5 out', () => {
  const t10 = C.FORMATS.T10.phases;
  assert.equal(t10.powerplay.maxOut, 2);
  assert.match(t10.powerplay.name, /1–2/);
  assert.equal(t10.middle.maxOut, 5);
  assert.equal(t10.death.maxOut, 5);
  const g = C.makeGround('medium');
  const death = C.fieldFromPreset(C.PRESET_BY_ID.pace_death, g);
  assert.equal(C.checkRules(death, { format: 'T10', phase: 'powerplay' }, g).ok, false);
  assert.equal(C.checkRules(death, { format: 'T10', phase: 'middle' }, g).ok, true);
  // T10 reuses T20 fields
  assert.ok(C.presetsFor(C.buildContext(Object.assign({}, BASE, { format: 'T10' })), { minFit: 3 }).length > 0);
  const st = evalPreset({ format: 'T10', phase: 'middle' }, 'pace_t20_middle', 3000);
  const t20 = evalPreset({ format: 'T20', phase: 'middle' }, 'pace_t20_middle', 3000);
  assert.ok(st.rpo > t20.rpo, 'T10 batters should score faster');
});

test('ring distance follows the 30-yard circle shape', () => {
  assert.ok(Math.abs(C.ringDist(90) - C.RING_RADIUS) < 0.05);
  assert.ok(Math.abs(C.ringDist(180) - C.RING_RADIUS) < 0.05);
  assert.ok(Math.abs(C.ringDist(0) - (C.PITCH_LEN + C.RING_RADIUS)) < 0.05);
});

test('fuzzy/phonetic position matching', () => {
  for (const [k, v] of [['third maan', 'thirdman'], ['thurd man', 'thirdman'], ['long gone', 'longon'], ['cover pint', 'coverpoint'], ['sily point', 'sillypoint'], ['extra cove', 'extracover']]) {
    assert.equal(C.matchPosition(k).id, v, k);
  }
  assert.equal(C.matchPosition('long off').id, 'longoff');
  assert.equal(C.matchPosition('long on').id, 'longon');
});

test('parser: zone moves relative to circle and boundary', () => {
  const z = (t) => parse(t)[0];
  assert.deepEqual(z('move third maan inside the circle'), { type: 'zone', ref: 'third maan', zone: 'inside' });
  assert.equal(z('move short third man outside the circle').zone, 'outside');
  assert.equal(z('put point on the edge of the circle').zone, 'edge');
  assert.equal(z('fine leg just outside the circle').zone, 'justout');
  assert.equal(z('move mid off to the middle of the circle').zone, 'mid');
  const b = z('put long on in the middle of the circle and boundary');
  assert.equal(b.zone, 'between'); assert.equal(b.ref, 'long on');
  assert.equal(z('send fine leg to the boundary').zone, 'boundary');
  assert.equal(z('move fielder three to gully').from, 'fielder 3');
  assert.equal(z('T10').settings.format, 'T10');
  assert.equal(z('ten over match').settings.format, 'T10');
  assert.equal(z('small boundaries').settings.ground, 'small');
  assert.equal(z('just move point to gully').from, 'point');
});
