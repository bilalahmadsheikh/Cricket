/*
 * FieldCraft application controller: state, UI wiring, command execution,
 * persistence, voice.
 */
(function () {
  'use strict';
  const C = window.CFS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const STORE_KEY = 'fieldcraft.v1';

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const DEFAULTS = {
    format: 'T20', phase: 'powerplay', bowlerType: 'rf', overWicket: true, plan: 'auto',
    hand: 'R', batterProfile: 'balanced', pitch: 'balanced', overhead: 'sunny', ballAge: 'new',
    outfield: 'average', ground: 'medium', dew: false, objective: 'balanced', forcedShot: null,
    simBalls: 3000, lang: 'en-GB', speak: true, wake: false, theme: null,
  };

  const state = {
    s: Object.assign({}, DEFAULTS),
    field: null,
    history: [], future: [],
    saved: {},
    stats: null,
    pendingField: null,
    job: null,
    log: [],
  };

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(state.s, d.s || {});
      if (d.field && Array.isArray(d.field.fielders) && d.field.fielders.length === 10) state.field = d.field;
      state.saved = d.saved || {};
    } catch (e) { /* storage unavailable */ }
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ s: state.s, field: state.field, saved: state.saved })); } catch (e) { /* ignore */ }
  }
  function loadFromHash() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (!m) return false;
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(m[1]))));
      if (d.s) Object.assign(state.s, d.s);
      if (d.field) state.field = d.field;
      return true;
    } catch (e) { return false; }
  }

  const ctx = () => C.buildContext(state.s);
  const ground = () => C.makeGround(state.s.ground);
  const phaseInfo = () => C.FORMATS[state.s.format].phases[state.s.phase];
  const bowler = () => C.BOWLERS[state.s.bowlerType];

  function defaultPresetFor(s) {
    const c = C.buildContext(s);
    let list = C.presetsFor(c, { includeTraps: false, minFit: 3 });
    if (!list.length) list = C.presetsFor(c, { includeTraps: false, minFit: 2 });
    if (!list.length) list = C.presetsFor(c, { includeTraps: true, minFit: 1 });
    return list.find((p) => p.style === 'balanced') || list[0] || C.PRESETS[0];
  }

  // ------------------------------------------------------------------
  // Field mutations (all go through here for undo/redo)
  // ------------------------------------------------------------------
  function snapshot() { return JSON.stringify({ field: state.field, plan: state.s.plan }); }
  function pushHistory() {
    state.history.push(snapshot());
    if (state.history.length > 100) state.history.shift();
    state.future = [];
  }
  function setField(f, { record = true, keepStats = false } = {}) {
    if (record && state.field) pushHistory();
    state.field = f;
    if (!keepStats) state.statsStale = true;
    saveStore();
    renderAll();
  }
  function undo() {
    if (!state.history.length) return 'Nothing to undo.';
    state.future.push(snapshot());
    const d = JSON.parse(state.history.pop());
    state.field = d.field; state.s.plan = d.plan;
    saveStore(); renderAll();
    return 'Undone.';
  }
  function redo() {
    if (!state.future.length) return 'Nothing to redo.';
    state.history.push(snapshot());
    const d = JSON.parse(state.future.pop());
    state.field = d.field; state.s.plan = d.plan;
    saveStore(); renderAll();
    return 'Redone.';
  }

  function loadPreset(id, { announce = true } = {}) {
    const p = C.PRESET_BY_ID[id];
    if (!p) return 'Unknown field.';
    const nf = state.field ? C.applyPresetKeepingPlayers(state.field, p, ground()) : C.fieldFromPreset(p, ground());
    pushHistory();
    state.s.plan = p.plan || 'auto';
    state.field = nf;
    state.statsStale = true;
    saveStore(); renderAll();
    const rules = C.checkRules(nf, state.s, ground());
    let msg = `${p.trap ? 'Trap set' : 'Field set'}: ${p.name.replace(/^Trap: /, '')}.`;
    if (p.plan && p.plan !== 'auto') msg += ` Bowling plan: ${C.PLANS[p.plan].name}.`;
    if (!rules.ok) msg += ' Warning: ' + rules.issues[0];
    if (announce) $('#preset-desc').textContent = p.description;
    return msg;
  }

  function moveFielder(f, theta, d, { snap = false } = {}) {
    const g = ground();
    let spot = C.legalSpot(theta, d, g);
    if (snap) {
      const c = C.classify(spot.theta, spot.d, g, { keeperMode: state.field.keeperMode });
      if (c.score < 10) spot = C.spotFor(c.pos.id, g, { keeperMode: state.field.keeperMode });
    }
    const nf = C.deepClone(state.field);
    const t = nf.fielders.find((x) => x.id === f.id);
    t.theta = spot.theta; t.d = spot.d;
    nf.presetId = null;
    if (!/custom|edited/i.test(nf.name)) nf.name = (nf.name || 'Field') + ' (edited)';
    setField(nf);
    return t;
  }

  // ------------------------------------------------------------------
  // Fielder references (voice): "mid on", "fielder 3", "Smith", "keeper"
  // ------------------------------------------------------------------
  function resolveFielder(phrase) {
    const g = ground();
    const p = C.normaliseText(phrase).replace(/^(the|my|our) /, '');
    let m = p.match(/^(?:fielder|player|number|no|man) ?(\d+)$/);
    if (m) { const f = state.field.fielders.find((x) => x.id === Number(m[1])); return f ? { f } : { err: `There is no fielder number ${m[1]}.` }; }
    if (/^(keeper|wk)$/.test(p)) return { f: state.field.fielders.find((x) => x.role === 'keeper') };
    for (const f of state.field.fielders) {
      if (f.name && C.similarity(C.normaliseText(f.name), p) > 0.8 && !/^fielder \d/.test(C.normaliseText(f.name))) return { f };
    }
    const pm = C.matchPosition(p);
    if (!pm) return { err: `I don't know a fielder or position called "${phrase}".` };
    if (pm.id === 'wk') return { f: state.field.fielders.find((x) => x.role === 'keeper') };
    const spot = C.spotFor(pm.id, g, { keeperMode: state.field.keeperMode });
    const sp = C.toXY(spot.theta, spot.d);
    const exact = state.field.fielders.filter((f) => f.role === 'fielder' && C.positionId(f, g, state.field.keeperMode) === pm.id);
    const pool = exact.length ? exact : state.field.fielders.filter((f) => f.role === 'fielder');
    let best = null;
    for (const f of pool) {
      const q = C.toXY(f.theta, f.d);
      const dd = Math.hypot(q.x - sp.x, q.y - sp.y);
      if (!best || dd < best.dd) best = { f, dd };
    }
    if (exact.length || (best && best.dd < Math.max(8, spot.d * 0.22))) return { f: best.f, posId: pm.id };
    return { err: `No one is at ${C.POS_BY_ID[pm.id].name}. Nearest is ${best.f.name} at ${C.positionName(best.f, g, state.field.keeperMode)}.`, near: best.f };
  }

  // ------------------------------------------------------------------
  // Command execution
  // ------------------------------------------------------------------
  function describeFielder(f) {
    const g = ground();
    const nm = C.positionName(f, g, state.field.keeperMode).replace(' (adj.)', '');
    const out = !C.insideRingPolar(f.theta, f.d);
    return { nm, out, text: `${f.name} is at ${nm}, ${Math.round(f.d)} metres from the bat${f.role === 'keeper' ? '' : out ? ', outside the circle' : ', inside the circle'}.` };
  }

  function applySettings(set) {
    const msgs = [];
    const before = Object.assign({}, state.s);
    for (const [k, v] of Object.entries(set)) {
      if (k === 'hand') {
        state.s.hand = v === 'toggle' ? (state.s.hand === 'R' ? 'L' : 'R') : v;
        msgs.push(`${state.s.hand === 'R' ? 'Right' : 'Left'}-handed batter — field mirrored automatically`);
      } else if (k === 'format') {
        state.s.format = v;
        const phases = Object.keys(C.FORMATS[v].phases);
        if (!phases.includes(state.s.phase)) {
          state.s.phase = v === 'Test' ? (state.s.phase === 'powerplay' ? 'newball' : 'oldball') : (state.s.phase === 'newball' ? 'powerplay' : 'middle');
        }
        msgs.push(`Format ${v}, ${phaseInfo().short}`);
      } else if (k === 'phase') {
        let ph = v;
        const phases = C.FORMATS[state.s.format].phases;
        if (!phases[ph]) {
          if (ph === 'newball') ph = 'powerplay';
          else if (ph === 'oldball') ph = 'middle';
          else if (ph === 'powerplay' || ph === 'death' || ph === 'middle') { state.s.format = state.s.format === 'Test' ? 'T20' : state.s.format; }
        }
        if (!C.FORMATS[state.s.format].phases[ph]) ph = Object.keys(C.FORMATS[state.s.format].phases)[0];
        state.s.phase = ph;
        const pi = phaseInfo();
        msgs.push(`${pi.name}${pi.maxOut != null ? ` — max ${pi.maxOut} outside the circle` : ''}`);
      } else if (k === 'bowlerType') {
        state.s.bowlerType = v;
        msgs.push(`Bowler: ${C.BOWLERS[v].name}`);
      } else if (k === 'keeper') {
        const nf = C.deepClone(state.field);
        nf.keeperMode = v;
        const kp = nf.fielders.find((f) => f.role === 'keeper');
        const ks = C.spotFor('wk', ground(), { keeperMode: v });
        kp.theta = ks.theta; kp.d = ks.d;
        setField(nf);
        msgs.push(v === 'up' ? 'Keeper standing up to the stumps' : 'Keeper standing back');
      } else if (k in state.s) {
        state.s[k] = v;
        const label = {
          pitch: () => `Pitch: ${C.PITCHES[v].name}`,
          plan: () => `Bowling plan: ${C.PLANS[v].name}`,
          outfield: () => `Outfield: ${C.OUTFIELDS[v].name}`,
          ground: () => `Boundaries: ${v}`,
          overhead: () => `Overhead: ${C.OVERHEAD[v].name}`,
          dew: () => (v ? 'Dew on' : 'No dew'),
          overWicket: () => (v ? 'Over the wicket' : 'Around the wicket'),
          batterProfile: () => `Batter: ${C.BATTERS[v].name}`,
          ballAge: () => `${v === 'new' ? 'New' : 'Old'} ball`,
        }[k];
        msgs.push(label ? label() : `${k} set`);
      }
    }
    if (set.ground && state.field) {
      // re-seat boundary riders on the new rope
      const nf = C.deepClone(state.field);
      const og = C.makeGround(before.ground), ng = ground();
      for (const f of nf.fielders) {
        const obd = C.boundaryDist(f.theta, og);
        if (f.d > obd - 8) f.d = C.boundaryDist(f.theta, ng) - C.BOUNDARY_INSET;
      }
      state.field = nf;
    }
    // Context changed in a way that suggests a different field?
    const kindChanged = C.BOWLERS[before.bowlerType].kind !== bowler().kind || C.BOWLERS[before.bowlerType].pace !== bowler().pace || C.turnFor(before.bowlerType, before.hand) !== C.turnFor(state.s.bowlerType, state.s.hand);
    const phaseChanged = before.format !== state.s.format || before.phase !== state.s.phase;
    if (kindChanged && !set.plan && state.s.plan !== 'auto') {
      const spinPlans = ['flight', 'darts'], pacePlans = ['short', 'yorkers', 'wide', 'body', 'drive', 'channel'];
      const bad = bowler().kind === 'spin' ? pacePlans : spinPlans;
      if (bad.includes(state.s.plan)) { state.s.plan = 'auto'; msgs.push('Bowling plan reset to auto'); }
    }
    if ((kindChanged || phaseChanged) && !set.plan) {
      const rec = defaultPresetFor(state.s);
      if (state.field && state.field.presetId && rec && rec.id !== state.field.presetId) {
        msgs.push(loadPreset(rec.id, { announce: true }).replace(/\.$/, ''));
      } else if (rec && state.field && !state.field.presetId) {
        toast(`Suggested field for this situation: ${rec.name}`, { action: 'Load it', onAction: () => say(loadPreset(rec.id)) });
      } else if (!state.field.presetId && rec) { /* nothing */ }
    }
    state.statsStale = true;
    saveStore();
    syncControls();
    renderAll();
    return msgs.join('. ') + '.';
  }

  function nudge(f, dir, small) {
    const g = ground();
    if (f.role === 'keeper') {
      return applySettings({ keeper: dir === 'in' ? 'up' : 'back' });
    }
    let { theta, d } = f;
    const bd = C.boundaryDist(theta, g);
    const step = small ? 0.5 : 1;
    if (dir === 'in') {
      if (small) d -= 4;
      else if (d > 0.7 * bd) d = 26;
      else if (d > 16) d = Math.max(9, d * 0.55);
      else d = Math.max(3, d * 0.7);
    } else if (dir === 'out') {
      if (small) d += 4;
      else if (d < 12) d = 22;
      else if (d < 0.7 * bd) d = bd - C.BOUNDARY_INSET;
      else return `${f.name} is already on the boundary.`;
    } else {
      const sign = theta >= 0 ? 1 : -1;
      const a = Math.abs(theta);
      const delta = 12 * step;
      let na = a;
      if (dir === 'squarer' || dir === 'wider') na = a < 90 ? Math.min(90, a + delta) : Math.max(90, a - delta);
      else if (dir === 'finer') na = Math.min(178, a + delta);
      else if (dir === 'straighter') na = Math.max(0, a - delta);
      theta = sign * na;
      if (d > 0.7 * bd) d = C.boundaryDist(theta, g) - C.BOUNDARY_INSET;
    }
    const t = moveFielder(f, theta, d);
    return `${t.name} moved ${dir === 'in' ? 'up' : dir === 'out' ? 'back' : dir} to ${describeFielder(t).nm}.`;
  }

  async function execute(cmd, source = 'text') {
    const g = ground();
    switch (cmd.type) {
      case 'help': $('#help-dialog').showModal(); return 'Here is the guide. You can say things like: move long on to mid on, bouncer trap, or which field is best.';
      case 'mic': voice.stop(); return 'Microphone off.';
      case 'speak': state.s.speak = cmd.on; voice.speakEnabled = cmd.on; $('#chk-speak').checked = cmd.on; saveStore(); return cmd.on ? 'Spoken replies on.' : 'Spoken replies off.';
      case 'undo': return undo();
      case 'redo': return redo();
      case 'reset': return loadPreset(defaultPresetFor(state.s).id);
      case 'mirror': setField(C.mirrorField(state.field)); return 'Field mirrored — off side and leg side swapped.';
      case 'save': {
        const name = cmd.name ? C.titleCase(cmd.name) : `My field ${Object.keys(state.saved).length + 1}`;
        state.saved[name] = Object.assign(C.deepClone(state.field), { name, plan: state.s.plan, savedAt: Date.now() });
        saveStore(); buildPresetSelect(); syncControls();
        return `Saved as ${name}. Say "load ${name}" to bring it back.`;
      }
      case 'rename': {
        const r = /^\d+$/.test(cmd.ref) ? state.field.fielders.find((f) => f.id === Number(cmd.ref)) : resolveFielder(cmd.ref).f;
        if (!r) return `Couldn't find fielder ${cmd.ref}.`;
        const nf = C.deepClone(state.field);
        nf.fielders.find((f) => f.id === r.id).name = C.titleCase(cmd.name);
        setField(nf, { keepStats: true });
        return `Fielder ${r.id} is now ${C.titleCase(cmd.name)}.`;
      }
      case 'zoom': view.zoom = cmd.level; renderField(); return cmd.level === 'in' ? 'Zoomed to the batting end.' : 'Showing the whole ground.';
      case 'layer': {
        if (cmd.layer === 'ring') return 'The 30-yard circle is always shown.';
        const on = cmd.on == null ? !view.layers[cmd.layer] : cmd.on;
        setLayer(cmd.layer, on);
        if (on && (cmd.layer === 'heatmap' || cmd.layer === 'wagon') && (!state.stats || state.statsStale)) runSimulation({ quiet: true });
        return `${{ heatmap: 'Heat-map', wagon: 'Wagon wheel', labels: 'Labels' }[cmd.layer]} ${on ? 'on' : 'off'}.`;
      }
      case 'theme': setTheme(cmd.theme); return `${cmd.theme === 'dark' ? 'Dark' : 'Light'} mode.`;
      case 'tab': showTab(cmd.tab); return '';
      case 'optimise': showTab('analytics'); return await runOptimise();
      case 'matrix': showTab('analytics'); return await runMatrix();
      case 'recommend': showTab('analytics'); return await runRank(cmd.apply);
      case 'analyse': showTab('sim'); return runSimulation();
      case 'apply': {
        if (!state.pendingField) return 'There is no suggested field waiting. Say "optimise the field" first.';
        setField(state.pendingField); state.pendingField = null;
        return 'Optimised field applied.';
      }
      case 'where': {
        const r = resolveFielder(cmd.ref);
        if (!r.f) return r.err;
        view.highlight(r.f.id);
        return describeFielder(r.f).text;
      }
      case 'read': {
        const parts = state.field.fielders.filter((f) => f.role === 'fielder').map((f) => describeFielder(f));
        const inside = parts.filter((p) => !p.out).map((p) => p.nm);
        const outside = parts.filter((p) => p.out).map((p) => p.nm);
        const k = state.field.keeperMode === 'up' ? 'Keeper up.' : 'Keeper back.';
        return `${k} Inside the circle: ${inside.join(', ') || 'none'}. Outside: ${outside.join(', ') || 'none'}.`;
      }
      case 'rules': {
        const r = C.checkRules(state.field, state.s, g);
        return r.ok ? `Field is legal. ${r.info.outside} outside the circle${r.info.maxOut != null ? ` of a maximum ${r.info.maxOut}` : ''}, ${r.info.behindLeg} behind square on the leg side.` : 'Field is NOT legal: ' + r.issues.join(' ');
      }
      case 'shot': {
        state.s.forcedShot = cmd.shot === 'any' ? null : cmd.shot;
        syncControls(); state.statsStale = true;
        return cmd.shot === 'any' ? 'Batter will play natural shots.' : `Batter will play the ${C.SHOTS[cmd.shot].name}.`;
      }
      case 'simulate': {
        if (cmd.shot !== undefined && cmd.shot !== null) { state.s.forcedShot = cmd.shot === 'any' ? null : cmd.shot; syncControls(); }
        if (cmd.balls === 1) return await bowlBalls(1);
        if (cmd.balls && cmd.balls <= 12) return await bowlBalls(cmd.balls);
        showTab('sim');
        return runSimulation({ balls: cmd.balls || state.s.simBalls });
      }
      case 'swap': {
        const a = resolveFielder(cmd.a), b = resolveFielder(cmd.b);
        if (!a.f) return a.err; if (!b.f) return b.err;
        if (a.f.id === b.f.id) return 'That is the same fielder.';
        const nf = C.deepClone(state.field);
        const fa = nf.fielders.find((f) => f.id === a.f.id), fb = nf.fielders.find((f) => f.id === b.f.id);
        [fa.theta, fb.theta] = [fb.theta, fa.theta]; [fa.d, fb.d] = [fb.d, fa.d];
        if (fa.role === 'keeper' || fb.role === 'keeper') { [fa.role, fb.role] = [fb.role, fa.role]; }
        nf.presetId = null;
        setField(nf);
        return `Swapped ${fa.name} and ${fb.name}.`;
      }
      case 'add': {
        const pm = C.matchPosition(cmd.to);
        if (!pm) return `I don't know the position "${cmd.to}".`;
        const already = state.field.fielders.find((f) => f.role === 'fielder' && C.positionId(f, g, state.field.keeperMode) === pm.id);
        if (already) return `${already.name} is already at ${C.POS_BY_ID[pm.id].name}.`;
        const best = C.bestFielderToMove(state.s, state.field, pm.id, { objective: state.s.objective });
        if (!best) return 'No fielder available.';
        const fromName = C.positionName(best.fielder, g, state.field.keeperMode);
        const s = C.spotFor(pm.id, g, { keeperMode: state.field.keeperMode });
        moveFielder(best.fielder, s.theta, s.d);
        return `Moved ${best.fielder.name} from ${fromName} to ${C.POS_BY_ID[pm.id].name} — the simulator rates that the least costly fielder to move.${best.legal ? '' : ' Warning: the field now breaks a fielding restriction.'}`;
      }
      case 'nudge': {
        const r = resolveFielder(cmd.ref);
        if (!r.f) return r.err;
        return nudge(r.f, cmd.dir, cmd.small);
      }
      case 'move': {
        const r = resolveFielder(cmd.from);
        if (!r.f) return r.err;
        const pm = C.matchPosition(cmd.to);
        if (!pm) return `I don't know the position "${cmd.to}".`;
        if (pm.id === 'wk') return 'Use "swap" to change the wicket-keeper.';
        const fromName = C.positionName(r.f, g, state.field.keeperMode).replace(' (adj.)', '');
        const s = C.spotFor(pm.id, g, { keeperMode: state.field.keeperMode });
        const occupant = state.field.fielders.find((f) => f.id !== r.f.id && f.role === 'fielder' && C.positionId(f, g, state.field.keeperMode) === pm.id);
        moveFielder(r.f, s.theta, s.d);
        view.highlight(r.f.id);
        const rules = C.checkRules(state.field, state.s, g);
        let msg = `${r.f.name}: ${fromName} to ${C.POS_BY_ID[pm.id].name}.`;
        if (occupant) msg += ` Note: ${occupant.name} was already there.`;
        if (!rules.ok) msg += ' Warning: ' + rules.issues[0];
        return msg;
      }
      case 'preset': {
        if (cmd.kind === 'saved' && state.saved[cmd.id]) {
          const sf = C.deepClone(state.saved[cmd.id]);
          if (sf.plan) state.s.plan = sf.plan;
          setField(sf); syncControls();
          return `Loaded your saved field ${cmd.id}.`;
        }
        return loadPreset(cmd.id);
      }
      case 'settings': return applySettings(cmd.settings);
    }
    return '';
  }

  // ------------------------------------------------------------------
  // Command intake (voice + text)
  // ------------------------------------------------------------------
  function parserEnv() {
    const c = ctx();
    return {
      roster: state.field.fielders.map((f) => f.name),
      savedFields: Object.keys(state.saved),
      presetFit: (pr) => 0.1 * Math.max(0, C.presetFit(pr, c) - 1),
    };
  }

  async function handleUtterance(alternatives, source) {
    let chosen = null, cmds = [];
    for (const alt of alternatives) {
      let text = alt.trim();
      if (source === 'voice' && state.s.wake) {
        if (!/^\s*(hey )?(captain|skipper)\b/i.test(text)) continue;
      }
      const c = C.parseCommand(text, parserEnv(), { bowlerArm: bowler().arm });
      if (c.length) { chosen = text; cmds = c; break; }
    }
    if (!cmds.length) {
      if (source === 'voice' && state.s.wake) return; // ignore chatter
      const heard = alternatives[0] || '';
      logCommand(heard, "Sorry — I didn't understand that.", false);
      say(`Sorry, I didn't catch that. Say help for examples.`, { toastText: `Didn't understand: “${heard}”` });
      return;
    }
    const replies = [];
    for (const c of cmds) {
      try {
        const r = await execute(c, source);
        if (r) replies.push(r);
      } catch (e) {
        console.error(e);
        replies.push('Something went wrong: ' + e.message);
      }
    }
    const reply = replies.join(' ');
    logCommand(chosen, reply, true);
    if (reply) say(reply);
  }

  function logCommand(text, reply, ok) {
    state.log.unshift({ text, reply, ok, t: new Date() });
    state.log = state.log.slice(0, 30);
    const ol = $('#voice-log');
    ol.innerHTML = state.log.map((l) => `<li class="${l.ok ? 'ok' : 'bad'}"><b>“${esc(l.text)}”</b><span>${esc(l.reply)}</span></li>`).join('');
  }

  function say(text, { toastText } = {}) {
    toast(toastText || text);
    voice.speak(text);
  }

  // ------------------------------------------------------------------
  // Simulation
  // ------------------------------------------------------------------
  const BALL_RESULT_CLASS = (ev) => (ev.out ? 'w' : ev.runs === 6 ? 'six' : ev.runs === 4 ? 'four' : ev.runs > 0 ? 'run' : 'dot');
  const BALL_SYMBOL = (ev) => (ev.out ? 'W' : ev.runs === 0 ? '•' : String(ev.runs));

  let overBalls = [];
  async function bowlBalls(n) {
    showTab('sim');
    const c = ctx();
    const prep = C.prepareField(state.field, c);
    let runs = 0, wkts = 0, last = null;
    for (let i = 0; i < n; i++) {
      const ev = C.simulateBall(prep, c, C.makeRng());
      const d = C.describeEvent(ev, state.field, c);
      runs += ev.runs; if (ev.out) wkts++;
      overBalls.push(ev);
      if (overBalls.length > 6) overBalls = overBalls.slice(-6);
      renderOverLog();
      $('#ticker').innerHTML = `<span class="del">${esc(d.delivery)}</span> <span class="shot">${esc(d.shot)}</span> <b class="${BALL_RESULT_CLASS(ev)}">${esc(d.result)}</b>`;
      $('#ticker').classList.add('show');
      await new Promise((res) => view.fv.animateBall(ev, res));
      if (ev.fielder && ev.fielder.id != null) view.highlight(ev.fielder.id);
      last = d;
      if (n > 1) await new Promise((r) => setTimeout(r, 450));
    }
    if (n === 1) return last.result.replace('OUT!', 'Out!');
    return `Over complete: ${runs} run${runs === 1 ? '' : 's'}${wkts ? `, ${wkts} wicket${wkts > 1 ? 's' : ''}` : ''}.`;
  }
  function renderOverLog() {
    $('#over-log').innerHTML = '<span class="lbl">Last balls</span>' + overBalls.map((ev) => `<span class="ball-chip ${BALL_RESULT_CLASS(ev)}" title="${esc(C.SHOTS[ev.shot].name)}">${BALL_SYMBOL(ev)}</span>`).join('');
  }

  function runSimulation({ balls, quiet } = {}) {
    const c = ctx();
    const N = balls || state.s.simBalls;
    const st = C.evaluateField(state.field, c, { balls: N, seed: (Math.random() * 1e9) | 0, wagon: 500 });
    state.stats = st; state.statsStale = false;
    renderSimResults(st, c);
    if (!view.layers.heatmap && !view.layers.wagon) setLayer('heatmap', true);
    renderField();
    if (quiet) return '';
    const ins = C.insights(st, state.field, c);
    const leak = ins.find((i) => i.kind === 'leak');
    return `Over ${N} balls${c.forcedShot ? ' of ' + C.SHOTS[c.forcedShot].name + 's' : ''}: ${C.fmt(st.rpo, 1)} runs an over, a wicket every ${Number.isFinite(st.bpw) ? Math.round(st.bpw) : 'never'} balls.${leak ? ' ' + leak.text.split(' — ')[0] + '.' : ''}`;
  }

  function statCard(label, value, sub) {
    return `<div class="stat"><div class="v">${value}</div><div class="l">${label}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  }
  function renderSimResults(st, c) {
    const out = $('#sim-results');
    const shotRows = Object.entries(st.byShot).sort((a, b) => b[1].n - a[1].n).slice(0, 12)
      .map(([k, v]) => `<tr><td>${esc(C.SHOTS[k].name)}</td><td>${C.pct(v.n / st.balls, 1)}</td><td>${C.fmt((v.runs / v.n) * 6, 1)}</td><td>${v.outs}</td></tr>`).join('');
    const fRows = state.field.fielders.map((f) => {
      const b = st.byFielder[f.id] || { involved: 0, catches: 0, drops: 0, stops: 0, runsConceded: 0 };
      return `<tr><td><span class="num">${f.role === 'keeper' ? 'WK' : f.id}</span> ${esc(C.positionName(f, c.ground, state.field.keeperMode))}</td><td>${C.pct(b.involved / st.balls, 1)}</td><td>${b.catches}</td><td>${b.drops}</td></tr>`;
    }).join('');
    const wk = st.wkts || 1;
    const dis = [['Caught', st.caught], ['Bowled', st.bowled], ['LBW', st.lbw], ['Stumped', st.stumped]]
      .map(([n, v]) => `<div class="bar-row"><span>${n}</span><div class="bar"><i style="width:${(100 * v) / wk}%"></i></div><b>${v}</b></div>`).join('');
    const ins = C.insights(st, state.field, c).map((i) => `<li class="ins-${i.kind}">${esc(i.text)}</li>`).join('');
    out.innerHTML = `
      <h3>${C.fmt(st.balls, 0)} balls simulated ${c.forcedShot ? `<small>(only ${esc(C.SHOTS[c.forcedShot].name)})</small>` : ''}</h3>
      <div class="stats">
        ${statCard('Runs / over', C.fmt(st.rpo, 2))}
        ${statCard('Balls / wicket', Number.isFinite(st.bpw) ? C.fmt(st.bpw, 1) : '∞')}
        ${statCard('Dot balls', C.pct(st.dotPct))}
        ${statCard('Boundary %', C.pct(st.boundaryPct, 1), `${st.fours}×4 · ${st.sixes}×6`)}
        ${statCard('Chances', st.chances, `${st.drops} dropped`)}
        ${statCard('Net score', C.fmt(C.objectiveScore(st, c, state.s.objective), 2), 'lower = better for bowling side')}
      </div>
      <h4>Insights</h4><ul class="insights">${ins}</ul>
      <h4>Dismissals (${st.wkts})</h4><div class="bars">${dis}</div>
      <h4>Shots played</h4>
      <table class="tbl"><thead><tr><th>Shot</th><th>Freq</th><th>Runs/6</th><th>Outs</th></tr></thead><tbody>${shotRows}</tbody></table>
      <h4>Fielder workload</h4>
      <table class="tbl"><thead><tr><th>Fielder</th><th>Involved</th><th>Catches</th><th>Drops</th></tr></thead><tbody>${fRows}</tbody></table>
      <p class="hint">Model: ball-by-ball physics-lite simulation (delivery → shot choice → execution → ball flight → fielder reach/catch). Use it to compare fields, not as an exact forecast.</p>`;
  }

  // ------------------------------------------------------------------
  // Analytics jobs
  // ------------------------------------------------------------------
  function startJob() {
    if (state.job) state.job.cancelled = true;
    const token = { cancelled: false };
    state.job = token;
    const pr = $('#progress');
    pr.hidden = false;
    return {
      token,
      progress: (p) => { pr.querySelector('.bar').style.setProperty('--p', `${(100 * p.done) / p.total}%`); pr.querySelector('span').textContent = `${Math.round((100 * p.done) / p.total)}% · ${p.label}`; },
      end: () => { if (state.job === token) { state.job = null; pr.hidden = true; } },
    };
  }

  async function runRank(applyBest) {
    const j = startJob();
    const out = $('#analytics-out');
    out.innerHTML = '<p class="hint">Ranking every suitable field and trap for these conditions…</p>';
    const res = await C.runAsync(C.rankFieldsGen(state.s, state.field, { objective: state.s.objective, balls: 2400 }), j.progress, j.token);
    j.end();
    if (!res) return 'Cancelled.';
    const c = ctx();
    const curIdx = res.findIndex((r) => r.current);
    out.innerHTML = `
      <h3>Best fields — ${esc(C.BOWLERS[c.bowlerType].short)} to ${c.hand === 'R' ? 'RHB' : 'LHB'}, ${esc(c.pitch.short)} pitch, ${esc(c.phaseInfo.short)}</h3>
      <p class="hint">Objective: ${esc(C.OBJECTIVES[state.s.objective].name)}. Net = runs/over − wicket value (${c.wicketValue} runs) × wickets/over. 2,400 identical deliveries per field.</p>
      <table class="tbl rank"><thead><tr><th>#</th><th>Field</th><th>RPO</th><th>Balls/W</th><th>Dot</th><th>Net</th><th></th></tr></thead><tbody>
      ${res.map((r, i) => `<tr class="${r.current ? 'current' : ''} ${r.legal ? '' : 'illegal'}"><td>${i + 1}</td><td>${esc(r.label)}${r.preset && r.preset.trap ? ' <span class="pill">trap</span>' : ''}${r.legal ? '' : ' <span class="pill bad" title="' + esc(r.issues.join(' ')) + '">illegal</span>'}</td><td>${C.fmt(r.stats.rpo, 2)}</td><td>${Number.isFinite(r.stats.bpw) ? C.fmt(r.stats.bpw, 0) : '∞'}</td><td>${C.pct(r.stats.dotPct)}</td><td><b>${C.fmt(r.score, 2)}</b></td><td>${r.preset ? `<button class="link" data-load="${r.preset.id}">load</button>` : ''}</td></tr>`).join('')}
      </tbody></table>`;
    $$('[data-load]', out).forEach((b) => b.addEventListener('click', () => say(loadPreset(b.dataset.load))));
    const best = res.find((r) => r.legal) || res[0];
    let msg = `Statistically best: ${best.label}, ${C.fmt(best.stats.rpo, 1)} runs an over and a wicket every ${Number.isFinite(best.stats.bpw) ? Math.round(best.stats.bpw) : 'never'} balls.`;
    if (curIdx >= 0) msg += ` Your current field ranks ${curIdx + 1} of ${res.length}.`;
    if (applyBest && best.preset) msg += ' ' + loadPreset(best.preset.id);
    else if (best.preset) msg += ' Say "load the best field" to use it.';
    return msg;
  }

  async function runMatrix() {
    const j = startJob();
    const out = $('#analytics-out');
    out.innerHTML = '<p class="hint">Simulating every suitable field on every pitch type…</p>';
    const res = await C.runAsync(C.pitchMatrixGen(state.s, { objective: state.s.objective, balls: 1000 }), j.progress, j.token);
    j.end();
    if (!res) return 'Cancelled.';
    const { presets, pitches, cells, best } = res;
    // per-column ranks for colouring
    const rankOf = {};
    for (const pk of pitches) {
      const sorted = presets.map((p) => ({ id: p.id, s: cells[p.id + '|' + pk].score })).sort((a, b) => a.s - b.s);
      sorted.forEach((x, i) => { rankOf[x.id + '|' + pk] = i / Math.max(1, sorted.length - 1); });
    }
    out.innerHTML = `
      <h3>Which field for which pitch?</h3>
      <p class="hint">${esc(bowler().name)} to a ${state.s.hand === 'R' ? 'right' : 'left'}-hander, ${esc(phaseInfo().name)}. Cells show runs/over · balls per wicket. Green = best for that pitch, ★ = recommended.</p>
      <div class="matrix-wrap"><table class="tbl matrix"><thead><tr><th>Field</th>${pitches.map((pk) => `<th class="${pk === state.s.pitch ? 'cur' : ''}">${esc(C.PITCHES[pk].short)}</th>`).join('')}</tr></thead><tbody>
      ${presets.map((p) => `<tr><td><button class="link" data-load="${p.id}">${esc(p.name)}</button></td>${pitches.map((pk) => { const c = cells[p.id + '|' + pk]; const r = rankOf[p.id + '|' + pk]; return `<td style="--h:${Math.round(130 - 130 * r)}" class="${best[pk] === p.id ? 'best' : ''} ${c.legal ? '' : 'illegal'}">${best[pk] === p.id ? '★ ' : ''}${C.fmt(c.rpo, 1)} · ${Number.isFinite(c.bpw) ? Math.round(c.bpw) : '∞'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table></div>
      <h4>Recommendation by pitch</h4>
      <ul class="insights">${pitches.map((pk) => `<li><b>${esc(C.PITCHES[pk].short)}:</b> ${best[pk] ? esc(C.PRESET_BY_ID[best[pk]].name) : '—'}</li>`).join('')}</ul>`;
    $$('[data-load]', out).forEach((b) => b.addEventListener('click', () => say(loadPreset(b.dataset.load))));
    const bp = best[state.s.pitch];
    return `On this ${C.PITCHES[state.s.pitch].short.toLowerCase()} pitch the best field is ${bp ? C.PRESET_BY_ID[bp].name : 'unclear'}. The full pitch-by-pitch table is in the Analytics tab.`;
  }

  async function runOptimise() {
    const j = startJob();
    const out = $('#analytics-out');
    out.innerHTML = '<p class="hint">Searching for the best single-fielder moves (greedy hill-climb with common random numbers)…</p>';
    const res = await C.runAsync(C.optimizeGen(state.s, state.field, { objective: state.s.objective, balls: 450, maxIter: 5 }), j.progress, j.token);
    j.end();
    if (!res) return 'Cancelled.';
    const c = ctx();
    const b = res.before, a = res.after;
    if (!res.log.length) {
      out.innerHTML = '<h3>Optimiser</h3><p>No single move improves this field — it is already well balanced for these conditions.</p>';
      return 'Your field is already optimal for these conditions — no single move improves it.';
    }
    state.pendingField = res.field;
    out.innerHTML = `
      <h3>Optimised field — ${res.log.length} move${res.log.length > 1 ? 's' : ''}</h3>
      <ol class="moves">${res.log.map((m) => `<li><b>${esc(m.fielder)}</b>: ${esc(m.from.replace(' (adj.)', ''))} → <b>${esc(m.to)}</b> <small>(−${C.fmt(m.gain, 2)} net)</small></li>`).join('')}</ol>
      <table class="tbl"><thead><tr><th></th><th>RPO</th><th>Balls/W</th><th>Net</th></tr></thead><tbody>
      <tr><td>Before</td><td>${C.fmt(b.rpo, 2)}</td><td>${C.fmt(b.bpw, 1)}</td><td>${C.fmt(C.objectiveScore(b, c, state.s.objective), 2)}</td></tr>
      <tr><td>After</td><td>${C.fmt(a.rpo, 2)}</td><td>${C.fmt(a.bpw, 1)}</td><td>${C.fmt(C.objectiveScore(a, c, state.s.objective), 2)}</td></tr></tbody></table>
      <p class="hint">Verified on 3,000 fresh deliveries. ${res.improved ? '' : 'Note: the gain did not hold up on the verification sample — treat with caution.'}</p>
      <div class="btn-row"><button class="btn primary" id="btn-apply-opt">Apply optimised field</button><button class="btn" id="btn-preview-opt">Preview</button></div>`;
    $('#btn-apply-opt').addEventListener('click', () => handleUtterance(['apply'], 'text'));
    $('#btn-preview-opt').addEventListener('mousedown', () => { view.preview = res.field; renderField(); });
    $('#btn-preview-opt').addEventListener('mouseup', () => { view.preview = null; renderField(); });
    $('#btn-preview-opt').addEventListener('mouseleave', () => { if (view.preview) { view.preview = null; renderField(); } });
    const first = res.log[0];
    return `Found ${res.log.length} improving move${res.log.length > 1 ? 's' : ''}, starting with ${first.fielder} from ${first.from.replace(' (adj.)', '')} to ${first.to}. Runs per over ${C.fmt(b.rpo, 1)} to ${C.fmt(a.rpo, 1)}. Say "apply" to use it.`;
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  const view = {
    fv: null, zoom: 'out', layers: { labels: true, heatmap: false, wagon: false }, preview: null, _hl: null,
    highlight(id) { this._hl = id; renderField(); clearTimeout(this._t); this._t = setTimeout(() => { this._hl = null; renderField(); }, 1800); },
  };

  function renderField() {
    const f = view.preview || state.field;
    const g = ground();
    const names = {};
    for (const x of f.fielders) names[x.id] = C.positionName(x, g, f.keeperMode);
    const rules = C.checkRules(f, state.s, g);
    const flagged = new Set();
    if (rules.info.maxOut != null && rules.info.outside > rules.info.maxOut) f.fielders.forEach((x) => { if (x.role !== 'keeper' && !C.insideRingPolar(x.theta, x.d)) flagged.add(x.id); });
    if (rules.info.behindLeg > 2) f.fielders.forEach((x) => { const p = C.toXY(x.theta, x.d); if (x.role !== 'keeper' && p.x < -0.5 && p.y < 0) flagged.add(x.id); });
    view.fv.zoom = view.zoom;
    view.fv.layers = view.layers;
    view.fv.render({ field: f, ground: g, hand: state.s.hand, keeperMode: f.keeperMode, names, stats: state.stats, flagged, highlight: view._hl, showPlayerNames: true });
    // rule bar
    const pi = phaseInfo();
    $('#rule-bar').innerHTML = `
      <span class="${rules.ok ? 'ok' : 'bad'}">${rules.ok ? '✓ Legal field' : '⚠ ' + esc(rules.issues.join(' '))}</span>
      <span>Outside circle: <b>${rules.info.outside}</b>${pi.maxOut != null ? ` / ${pi.maxOut}` : ''}</span>
      <span>Behind square (leg): <b>${rules.info.behindLeg}</b> / 2</span>
      <span>Off–leg: <b>${rules.info.off}–${rules.info.leg}</b></span>
      <span>Catchers (&lt;15 m): <b>${rules.info.close}</b></span>`;
  }

  function renderFielderList() {
    const g = ground();
    const groups = [['Catching / close', POS_GROUPS.close], ['Ring', POS_GROUPS.ring], ['Deep', POS_GROUPS.deep]];
    const opts = (cur) => groups.map(([lab, list]) => `<optgroup label="${lab}">${list.map((p) => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
    $('#fielder-list').innerHTML = state.field.fielders.map((f) => {
      const pid = C.positionId(f, g, state.field.keeperMode);
      const out = f.role !== 'keeper' && !C.insideRingPolar(f.theta, f.d);
      return `<div class="frow ${f.role} ${out ? 'out' : ''}" data-id="${f.id}">
        <span class="num">${f.role === 'keeper' ? 'WK' : f.id}</span>
        <input class="fname" value="${esc(f.name)}" aria-label="Name of fielder ${f.id}" />
        ${f.role === 'keeper'
          ? `<select class="kmode" aria-label="Keeper stance"><option value="up" ${state.field.keeperMode === 'up' ? 'selected' : ''}>Standing up</option><option value="medium" ${state.field.keeperMode === 'medium' ? 'selected' : ''}>Half-way</option><option value="back" ${state.field.keeperMode === 'back' ? 'selected' : ''}>Standing back</option><option value="deep" ${state.field.keeperMode === 'deep' ? 'selected' : ''}>Deep (express pace)</option></select>`
          : `<select class="fpos" aria-label="Position of fielder ${f.id}">${opts(pid)}</select>`}
        <span class="dist">${Math.round(f.d)} m${out ? ' · out' : ''}</span>
      </div>`;
    }).join('');
    $$('#fielder-list .frow').forEach((row) => {
      const id = Number(row.dataset.id);
      const f = () => state.field.fielders.find((x) => x.id === id);
      row.querySelector('.fname').addEventListener('change', (e) => { execute({ type: 'rename', ref: String(id), name: e.target.value || `Fielder ${id}` }); });
      const sel = row.querySelector('.fpos');
      if (sel) sel.addEventListener('change', (e) => { const s = C.spotFor(e.target.value, ground(), { keeperMode: state.field.keeperMode }); moveFielder(f(), s.theta, s.d); });
      const km = row.querySelector('.kmode');
      if (km) km.addEventListener('change', (e) => say(applySettings({ keeper: e.target.value })));
      row.addEventListener('mouseenter', () => { view._hl = id; renderField(); });
      row.addEventListener('mouseleave', () => { view._hl = null; renderField(); });
    });
  }

  function renderChips() {
    const c = ctx();
    const chips = [
      [c.format, 'fmt'], [c.phaseInfo.short, 'phase'], [`${c.bowler.short}${c.bowler.kind === 'spin' ? ` (turns ${c.turn})` : ''}`, 'bowl'],
      [c.hand === 'R' ? 'RHB' : 'LHB', 'bat'], [`${c.pitch.short} pitch`, 'pitch'],
    ];
    if (c.forcedShot) chips.push([`Shot: ${C.SHOTS[c.forcedShot].name}`, 'shot']);
    $('#context-chips').innerHTML = chips.map(([t, k]) => `<span class="chip chip-${k}">${esc(t)}</span>`).join('');
  }

  function renderAll() {
    renderField();
    renderFielderList();
    renderChips();
    syncPresetValue();
    $('#btn-undo').disabled = !state.history.length;
    $('#btn-redo').disabled = !state.future.length;
    renderSuggestions();
  }

  // ------------------------------------------------------------------
  // Controls
  // ------------------------------------------------------------------
  const POS_GROUPS = { close: [], ring: [], deep: [] };
  C.POSITIONS.filter((p) => p.id !== 'wk').forEach((p) => POS_GROUPS[p.zone].push(p));

  function fillSelect(sel, entries, value) {
    sel.innerHTML = entries.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
    if (value != null) sel.value = value;
  }

  function buildPresetSelect() {
    const c = ctx();
    const sel = $('#sel-preset');
    const rec = C.PRESETS.filter((p) => !p.trap && C.presetFit(p, c) >= 3);
    const traps = C.PRESETS.filter((p) => p.trap && C.presetFit(p, c) >= 1);
    const others = C.PRESETS.filter((p) => !rec.includes(p) && !traps.includes(p) && C.presetFit(p, c) >= 1);
    const og = (label, list) => (list.length ? `<optgroup label="${label}">${list.map((p) => `<option value="${p.id}">${esc(p.name.replace(/^Trap: /, ''))}</option>`).join('')}</optgroup>` : '');
    const saved = Object.keys(state.saved);
    sel.innerHTML = `<option value="">— Custom / edited field —</option>` + og('Recommended for this situation', rec) + og('Traps', traps) + og('Other fields for this bowler', others) +
      (saved.length ? `<optgroup label="My saved fields">${saved.map((n) => `<option value="saved:${esc(n)}">${esc(n)}</option>`).join('')}</optgroup>` : '');
    syncPresetValue();
  }
  function syncPresetValue() {
    const sel = $('#sel-preset');
    const v = state.field && state.field.presetId ? state.field.presetId : '';
    if ([...sel.options].some((o) => o.value === v)) sel.value = v; else sel.value = '';
    const p = state.field && state.field.presetId && C.PRESET_BY_ID[state.field.presetId];
    $('#preset-desc').innerHTML = p ? `<b>${esc(p.name)}</b><br>${esc(p.description)}` : `<b>${esc(state.field ? state.field.name : '')}</b>`;
  }

  function syncControls() {
    const s = state.s;
    fillSelect($('#sel-phase'), Object.entries(C.FORMATS[s.format].phases).map(([k, v]) => [k, v.name]), s.phase);
    $('#sel-format').value = s.format;
    $('#sel-bowler').value = s.bowlerType;
    $('#sel-plan').value = s.plan;
    $('#sel-batter').value = s.batterProfile;
    $('#sel-pitch').value = s.pitch;
    $('#sel-overhead').value = s.overhead;
    $('#sel-ball').value = s.ballAge;
    $('#sel-outfield').value = s.outfield;
    $('#sel-ground').value = s.ground;
    $('#chk-dew').checked = !!s.dew;
    $('#sel-shot').value = s.forcedShot || '';
    $('#sel-objective').value = s.objective;
    $('#sel-balls').value = String(s.simBalls);
    $('#sel-lang').value = s.lang;
    $('#chk-speak').checked = !!s.speak;
    $('#chk-wake').checked = !!s.wake;
    $$('[data-hand]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hand === s.hand)));
    $$('[data-over]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.over === '1') === s.overWicket)));
    const pi = phaseInfo();
    $('#restriction-note').innerHTML = pi.maxOut != null ? `Max <b>${pi.maxOut}</b> fielders outside the 30-yard circle · max 2 behind square on the leg side.` : 'No circle restriction (Test) · max 2 behind square on the leg side.';
    $('#pitch-tip').textContent = C.PITCHES[s.pitch].tip;
    const b = bowler();
    const c = ctx();
    $('#bowler-note').textContent = b.kind === 'spin'
      ? `Stock ball turns ${c.turn === 'in' ? 'INTO' : 'AWAY from'} this ${s.hand === 'R' ? 'right' : 'left'}-hander. Keeper usually stands up.`
      : `${b.pace === 'fast' ? 'Fast' : 'Medium-fast'}: angle ${c.angle === 'across' ? 'ACROSS' : 'INTO'} the ${s.hand === 'R' ? 'right' : 'left'}-hander from ${s.overWicket ? 'over' : 'around'} the wicket.`;
    buildPresetSelect();
    renderChips();
  }

  function bindControls() {
    fillSelect($('#sel-format'), Object.keys(C.FORMATS).map((k) => [k, k]));
    fillSelect($('#sel-bowler'), Object.entries(C.BOWLERS).map(([k, v]) => [k, v.name]));
    fillSelect($('#sel-plan'), Object.entries(C.PLANS).map(([k, v]) => [k, v.name]));
    fillSelect($('#sel-batter'), Object.entries(C.BATTERS).map(([k, v]) => [k, v.name]));
    fillSelect($('#sel-pitch'), Object.entries(C.PITCHES).map(([k, v]) => [k, v.name]));
    fillSelect($('#sel-overhead'), Object.entries(C.OVERHEAD).map(([k, v]) => [k, v.name]));
    fillSelect($('#sel-outfield'), Object.entries(C.OUTFIELDS).map(([k, v]) => [k, v.name]));
    fillSelect($('#sel-shot'), [['', 'Natural shot selection']].concat(Object.entries(C.SHOTS).map(([k, v]) => [k, v.name])));
    fillSelect($('#sel-objective'), Object.entries(C.OBJECTIVES).map(([k, v]) => [k, v.name]));

    const bindSel = (id, key, conv = (x) => x) => $(id).addEventListener('change', (e) => say(applySettings({ [key]: conv(e.target.value) })));
    bindSel('#sel-format', 'format');
    bindSel('#sel-phase', 'phase');
    bindSel('#sel-bowler', 'bowlerType');
    bindSel('#sel-plan', 'plan');
    bindSel('#sel-batter', 'batterProfile');
    bindSel('#sel-pitch', 'pitch');
    bindSel('#sel-overhead', 'overhead');
    bindSel('#sel-ball', 'ballAge');
    bindSel('#sel-outfield', 'outfield');
    bindSel('#sel-ground', 'ground');
    $('#chk-dew').addEventListener('change', (e) => say(applySettings({ dew: e.target.checked })));
    $$('[data-hand]').forEach((b) => b.addEventListener('click', () => say(applySettings({ hand: b.dataset.hand }))));
    $$('[data-over]').forEach((b) => b.addEventListener('click', () => say(applySettings({ overWicket: b.dataset.over === '1' }))));
    $('#sel-shot').addEventListener('change', (e) => { state.s.forcedShot = e.target.value || null; state.statsStale = true; saveStore(); renderChips(); });
    $('#sel-objective').addEventListener('change', (e) => { state.s.objective = e.target.value; saveStore(); });
    $('#sel-balls').addEventListener('change', (e) => { state.s.simBalls = Number(e.target.value); saveStore(); });
    $('#sel-lang').addEventListener('change', (e) => { state.s.lang = e.target.value; voice.setLang(e.target.value); saveStore(); });
    $('#chk-speak').addEventListener('change', (e) => { state.s.speak = e.target.checked; voice.speakEnabled = e.target.checked; saveStore(); });
    $('#chk-wake').addEventListener('change', (e) => { state.s.wake = e.target.checked; saveStore(); toast(e.target.checked ? 'Start voice commands with “Captain…”, e.g. “Captain, move point to gully”.' : 'Wake word off — every phrase is treated as a command.'); });

    $('#sel-preset').addEventListener('change', (e) => {
      const v = e.target.value;
      if (!v) return;
      if (v.startsWith('saved:')) handleUtterance([`load ${v.slice(6)}`], 'text');
      else say(loadPreset(v));
    });

    $('#btn-undo').addEventListener('click', () => say(undo()));
    $('#btn-redo').addEventListener('click', () => say(redo()));
    $('#btn-mirror').addEventListener('click', () => execute({ type: 'mirror' }).then(say));
    $('#btn-save').addEventListener('click', () => {
      const name = prompt('Save this field as:', state.field.name.replace(/ \(edited\)$/, ''));
      if (name) execute({ type: 'save', name }).then(say);
    });
    $('#btn-more').addEventListener('click', (e) => { e.stopPropagation(); $('#more-menu').hidden = !$('#more-menu').hidden; });
    document.addEventListener('click', () => { $('#more-menu').hidden = true; });
    $('#btn-export').addEventListener('click', exportField);
    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', importField);
    $('#btn-png').addEventListener('click', downloadPNG);
    $('#btn-share').addEventListener('click', shareLink);
    $('#btn-print').addEventListener('click', printCard);

    const toggleBtn = (id, layer) => $(id).addEventListener('click', () => execute({ type: 'layer', layer, on: !view.layers[layer] }).then((r) => toast(r)));
    toggleBtn('#tg-labels', 'labels');
    toggleBtn('#tg-heatmap', 'heatmap');
    toggleBtn('#tg-wagon', 'wagon');
    $('#tg-snap').addEventListener('click', () => { view.fv.snap = !view.fv.snap; $('#tg-snap').setAttribute('aria-pressed', String(view.fv.snap)); toast(`Snap to named positions ${view.fv.snap ? 'on' : 'off'}.`); });
    $('#btn-zoom').addEventListener('click', () => { execute({ type: 'zoom', level: view.zoom === 'in' ? 'out' : 'in' }); });
    $('#btn-theme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    $('#btn-help').addEventListener('click', () => $('#help-dialog').showModal());

    $$('.tabs [role=tab]').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

    $('#btn-ball').addEventListener('click', () => bowlBalls(1).then((r) => voice.speak(r)));
    $('#btn-over').addEventListener('click', () => bowlBalls(6).then(say));
    $('#btn-sim').addEventListener('click', () => { const r = runSimulation(); voice.speak(r); });
    $('#btn-rank').addEventListener('click', () => runRank().then(say));
    $('#btn-matrix').addEventListener('click', () => runMatrix().then(say));
    $('#btn-opt').addEventListener('click', () => runOptimise().then(say));
    $('#btn-cancel').addEventListener('click', () => { if (state.job) state.job.cancelled = true; $('#progress').hidden = true; });

    $('#command-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#command-input').value.trim();
      if (!v) return;
      $('#command-input').value = '';
      handleUtterance([v], 'text');
    });

    // keyboard shortcuts
    let spaceHeld = false;
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); say(e.shiftKey ? redo() : undo()); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); say(redo()); return; }
      if (typing) return;
      if (e.key === 'm' || e.key === 'M') { toggleMic(); }
      else if (e.key === '/') { e.preventDefault(); $('#command-input').focus(); }
      else if (e.code === 'Space' && !spaceHeld && document.activeElement === document.body) {
        e.preventDefault(); spaceHeld = true; if (!voice.wanted) { voice.start(); voice._ptt = true; }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && spaceHeld) { spaceHeld = false; if (voice._ptt) { voice._ptt = false; setTimeout(() => voice.stop(), 700); } }
    });
  }

  function showTab(tab) {
    $$('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $$('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  }
  function setLayer(layer, on) {
    view.layers[layer] = on;
    const btn = { labels: '#tg-labels', heatmap: '#tg-heatmap', wagon: '#tg-wagon' }[layer];
    if (btn) $(btn).setAttribute('aria-pressed', String(on));
    renderField();
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    state.s.theme = t; saveStore();
  }

  // ------------------------------------------------------------------
  // Export / import / share / print
  // ------------------------------------------------------------------
  function download(name, href) {
    const a = document.createElement('a');
    a.href = href; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function exportField() {
    const data = { app: 'FieldCraft', version: 1, settings: state.s, field: state.field, exportedAt: new Date().toISOString() };
    download(`${(state.field.name || 'field').replace(/[^\w-]+/g, '_')}.json`, URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })));
  }
  function importField(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((t) => {
      const d = JSON.parse(t);
      if (!d.field || !Array.isArray(d.field.fielders)) throw new Error('Not a FieldCraft field file');
      if (d.settings) Object.assign(state.s, d.settings);
      setField(d.field); syncControls();
      say(`Imported ${d.field.name || 'field'}.`);
    }).catch((err) => toast('Import failed: ' + err.message));
    e.target.value = '';
  }
  async function downloadPNG() {
    const url = await view.fv.toPNG();
    download(`${(state.field.name || 'field').replace(/[^\w-]+/g, '_')}.png`, url);
  }
  function shareLink() {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ s: state.s, field: state.field }))));
    const url = `${location.origin}${location.pathname}#s=${payload}`;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Share link copied to clipboard.'), () => prompt('Copy this link:', url));
  }
  async function printCard() {
    const url = await view.fv.toPNG(4);
    const g = ground();
    const c = ctx();
    const rows = state.field.fielders.map((f) => `<tr><td>${f.role === 'keeper' ? 'WK' : f.id}</td><td>${esc(f.name)}</td><td>${esc(C.positionName(f, g, state.field.keeperMode))}</td></tr>`).join('');
    const w = window.open('', '_blank');
    if (!w) return toast('Allow pop-ups to print the field card.');
    w.document.write(`<!doctype html><title>${esc(state.field.name)}</title><style>body{font-family:system-ui,sans-serif;margin:24px}img{width:420px;float:left;margin-right:24px}table{border-collapse:collapse}td{border-bottom:1px solid #ccc;padding:4px 10px}</style>
      <h1>${esc(state.field.name)}</h1><p>${esc(c.format)} · ${esc(c.phaseInfo.name)} · ${esc(c.bowler.name)} to ${c.hand === 'R' ? 'right' : 'left'}-hander · ${esc(c.pitch.name)} · plan: ${esc(state.s.plan === 'auto' ? 'auto' : C.PLANS[state.s.plan].name)}</p>
      <img src="${url}"><table>${rows}</table><script>setTimeout(()=>print(),300)<\/script>`);
    w.document.close();
  }

  // ------------------------------------------------------------------
  // Toasts, suggestions, help
  // ------------------------------------------------------------------
  function toast(text, { action, onAction, ms = 4200 } = {}) {
    if (!text) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span>${esc(text)}</span>`;
    if (action) {
      const b = document.createElement('button');
      b.className = 'link'; b.textContent = action;
      b.addEventListener('click', () => { onAction(); t.remove(); });
      t.appendChild(b);
    }
    $('#toasts').appendChild(t);
    setTimeout(() => t.classList.add('gone'), ms);
    setTimeout(() => t.remove(), ms + 400);
    const all = $$('#toasts .toast');
    const max = window.innerWidth < 860 ? 2 : 4;
    while (all.length > max) all.shift().remove();
  }

  function renderSuggestions() {
    const b = bowler();
    const c = ctx();
    const sugg = ['which field is best?', 'simulate an over'];
    if (b.kind === 'pace') sugg.push(c.phase === 'death' ? 'wide yorker trap' : 'bouncer trap');
    else sugg.push('sweep trap');
    sugg.push(state.s.hand === 'R' ? 'left hander' : 'right hander');
    sugg.push('compare pitches', 'optimise the field');
    const f = state.field.fielders.find((x) => x.role === 'fielder' && !C.insideRingPolar(x.theta, x.d));
    if (f) sugg.push(`bring ${C.positionName(f, ground(), state.field.keeperMode).replace(' (adj.)', '').toLowerCase()} up`);
    $('#suggest').innerHTML = sugg.slice(0, 7).map((s) => `<button class="sugg">${esc(s)}</button>`).join('');
    $$('#suggest .sugg').forEach((b2) => b2.addEventListener('click', () => handleUtterance([b2.textContent], 'text')));
  }

  const CMD_REF = [
    ['Move fielders', ['move long on to mid on', 'put fine leg at short fine leg', 'third man to second slip', 'swap point and cover', 'bring mid off up', 'push fine leg back', 'move point a bit squarer', 'add a slip', 'bring in a short leg', 'move fielder 3 to gully', 'move Smith to deep mid wicket']],
    ['Fields & traps', ['load the death field', 'bouncer trap', 'sweep trap', 'wide yorker trap', 'drive trap', 'ring field', 'mirror field', 'reset field', 'undo', 'save field as new ball plan']],
    ['Situation', ['T20', 'ODI', 'test match', 'powerplay', 'outside the powerplay', 'death overs', 'left hander', 'switch batter', 'right arm leg spinner', 'left arm orthodox', 'left arm fast', 'medium pacer', 'around the wicket', 'keeper up']],
    ['Conditions', ['green pitch', 'the pitch is dusty', 'flat pitch', 'bouncy pitch', 'slow pitch', 'overcast', 'dew', 'fast outfield', 'small boundaries']],
    ['Bowling plan & batter', ['bowl short', 'bowl yorkers', 'bowl wide', 'fourth stump channel', 'stump to stump', 'power hitter batter', 'anchor batter']],
    ['Simulate', ['bowl', 'bowl an over', 'simulate 1000 balls', 'simulate cover drive', 'simulate 5 overs of pull shots', 'any shots']],
    ['Statistics', ['which field is best', 'load the best field', 'compare pitches', 'optimise the field', 'apply', 'analyse this field']],
    ['Info & view', ['where is mid on', 'read the field', 'is the field legal', 'zoom in', 'zoom out', 'show heatmap', 'show wagon wheel', 'hide labels', 'dark mode', 'help', 'stop listening']],
  ];
  function buildHelp() {
    $('#cmd-ref').innerHTML = CMD_REF.map(([h, list]) => `<div><h4>${h}</h4>${list.map((c) => `<button class="sugg">${esc(c)}</button>`).join('')}</div>`).join('');
    $$('#cmd-ref .sugg').forEach((b) => b.addEventListener('click', () => handleUtterance([b.textContent], 'text')));
    $('#help-body').innerHTML = `
      <ol class="guide">
        <li><b>Set the situation</b> on the left (format, phase, bowler, batter, pitch). The recommended field loads automatically.</li>
        <li><b>Move fielders</b> by dragging, by tapping a fielder then tapping a spot, from the Fielders tab, or by voice.</li>
        <li><b>Talk to it</b>: press the mic (or <kbd>M</kbd>, or hold <kbd>Space</kbd>) and speak naturally — <em>“move long-on to mid-on”</em>, <em>“bring in a short leg”</em>, <em>“bouncer trap”</em>, <em>“which field is best?”</em>. Everything you can say, you can also type in the command bar (<kbd>/</kbd>).</li>
        <li><b>Simulate</b> balls, overs or thousands of deliveries; see the heat-map of where runs leak, the wagon wheel, dismissals and fielder workload.</li>
        <li><b>Analytics</b> ranks every field & trap for the conditions, builds a <em>pitch × field</em> matrix, and can optimise your field move by move.</li>
      </ol>
      <p>Positions are relative to the batter, so a field automatically mirrors for a left-hander. Fielding restrictions (30-yard circle, max 2 behind square on the leg side) are checked live.</p>
      <p>Voice recognition uses your browser's Web Speech API (Chrome, Edge, Safari). Choose your accent in the Voice tab for better accuracy.</p>
      ${$('#cmd-ref').innerHTML}`;
    $$('#help-body .sugg').forEach((b) => b.addEventListener('click', () => { $('#help-dialog').close(); handleUtterance([b.textContent], 'text'); }));
  }

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ------------------------------------------------------------------
  // Voice
  // ------------------------------------------------------------------
  let voice;
  function setupVoice() {
    voice = new C.VoiceControl({
      lang: state.s.lang,
      speak: state.s.speak,
      onResult: (alts) => { $('#interim').textContent = ''; handleUtterance(alts, 'voice'); },
      onInterim: (t) => { $('#interim').textContent = '… ' + t; },
      onState: (st) => {
        const on = st === 'listening' || (st === 'paused' && voice.wanted);
        $('#btn-mic').setAttribute('aria-pressed', String(on));
        $('#btn-mic .mic-label').textContent = on ? 'Listening…' : 'Tap to talk';
        document.body.classList.toggle('listening', on);
      },
      onError: (err) => {
        const msg = { 'not-allowed': 'Microphone permission was denied. Allow mic access in the browser address bar.', 'audio-capture': 'No microphone found.', network: 'Speech service unreachable (network). Typed commands still work.' }[err] || `Voice error: ${err}`;
        toast(msg);
      },
    });
    const sup = $('#voice-support');
    if (!voice.supported) {
      sup.innerHTML = '⚠ This browser has no speech recognition. Use Chrome, Edge or Safari for voice — typed commands work everywhere.';
      $('#btn-mic').classList.add('unsupported');
    } else {
      sup.textContent = 'Voice ready. Press the mic, M, or hold Space. Speak naturally; several commands can be chained with “and”.';
    }
  }
  function toggleMic() {
    if (!voice.supported) { toast('Speech recognition is not supported in this browser. Try Chrome or Edge — or type commands below.'); $('#command-input').focus(); return; }
    const on = voice.toggle();
    if (on) toast('Listening… try “move long-on to mid-on”.');
  }

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  function boot() {
    loadStore();
    loadFromHash();
    if (!state.s.theme) state.s.theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = state.s.theme;
    if (!state.field) state.field = C.fieldFromPreset(defaultPresetFor(state.s), ground());

    view.fv = new C.FieldView($('#field-svg'), {
      onMove: (id, theta, d, final, keyboard) => {
        if (!final) return;
        const f = state.field.fielders.find((x) => x.id === id);
        moveFielder(f, theta, d);
        if (!keyboard) toast(`${f.name} → ${C.positionName(state.field.fielders.find((x) => x.id === id), ground(), state.field.keeperMode)}`);
        view.fv.selected = null;
      },
      onSelect: (id) => {
        view.fv.selected = view.fv.selected === id ? null : id;
        renderField();
        if (view.fv.selected != null) toast(`Selected ${state.field.fielders.find((x) => x.id === id).name}. Tap anywhere on the field to place.`);
      },
      onPlace: (id, theta, d) => {
        const f = state.field.fielders.find((x) => x.id === id);
        const t = moveFielder(f, theta, d, { snap: view.fv.snap });
        view.fv.selected = null;
        renderField();
        toast(`${t.name} → ${C.positionName(t, ground(), state.field.keeperMode)}`);
      },
    });

    bindControls();
    setupVoice();
    $('#btn-mic').addEventListener('click', toggleMic);
    buildHelp();
    syncControls();
    renderAll();

    if (!localStorage.getItem('fieldcraft.seenHelp')) {
      try { localStorage.setItem('fieldcraft.seenHelp', '1'); } catch (e) { /* ignore */ }
      setTimeout(() => $('#help-dialog').showModal(), 400);
    }
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.FieldCraft = { state, execute, handleUtterance, ctx };
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
