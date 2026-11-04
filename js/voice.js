/*
 * Voice & text command layer.
 *  - parseCommand(text, env): pure function → array of command objects
 *  - VoiceControl: Web Speech API wrapper (recognition + speech synthesis)
 *
 * The same parser powers the typed command bar, so everything you can say
 * you can also type.
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;
  const { matchPosition, normaliseText, similarity, PRESETS, SHOTS } = CFS;

  // ---------------- normalisation ----------------
  const REPLACEMENTS = [
    [/\b1st\b/g, 'first'], [/\b2nd\b/g, 'second'], [/\b3rd\b/g, 'third'], [/\b4th\b/g, 'fourth'],
    [/\bt ?20s?\b|\bt twenty\b|\btwenty ?twenty\b|\btwenty 20\b|\b20 20\b/g, 't20'],
    [/\bo d i\b|\bone ?day( international)?\b|\b50 over(s)?\b|\bfifty over(s)?\b/g, 'odi'],
    [/\btest match\b|\bred ball\b/g, 'test'],
    [/\bpower ?plays?\b|\bpower plate\b|\bpower place\b/g, 'powerplay'],
    [/\bleft ?handers?\b|\bleft ?handed( batsman| batter)?\b|\blefty\b|\bleftie\b|\bsouthpaw\b|\bleft hand bat(ter|sman)?\b/g, 'left hander'],
    [/\bright ?handers?\b|\bright ?handed( batsman| batter)?\b|\brighty\b|\bright hand bat(ter|sman)?\b/g, 'right hander'],
    [/\bbatsman\b|\bbatswoman\b|\bbats person\b|\bstriker\b/g, 'batter'],
    [/\bleg ?spinn?(er|ing)?\b|\bleg ?break( bowler)?\b|\bleggie\b/g, 'leg spin'],
    [/\boff ?spinn?(er|ing)?\b|\bof spin(ner)?\b|\boff ?break( bowler)?\b|\boffie\b/g, 'off spin'],
    [/\bmedium ?(fast|pacer?|pace bowler|pace)\b|\bmedium(?= bowler)/g, 'medium fast'],
    [/\bwicket ?keeper\b|\bkipper\b/g, 'keeper'],
    [/\bwagon wheel\b|\bwagon will\b/g, 'wagonwheel'],
    [/\bheat ?map\b/g, 'heatmap'],
    [/\boptimi[sz](e|ed|ation)\b/g, 'optimise'],
    [/\banaly[sz]e\b/g, 'analyse'],
  ];
  const FILLERS = /\b(please|can you|could you|would you|will you|i want to|i want|i would like to|id like to|lets|let us|go ahead and|kindly|okay|ok|hey|now|just|quickly|for me|right now|thanks|thank you)\b/g;
  const WAKE = /^(hey )?(captain|skipper|field|fielding|coach|cricket)\b[, ]*/;

  const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, twenty: 20, thirty: 30, fifty: 50, hundred: 100, 'a hundred': 100, 'one hundred': 100, thousand: 1000, 'a thousand': 1000 };

  function normalise(text) {
    let s = normaliseText(text);
    for (const [re, rep] of REPLACEMENTS) s = s.replace(re, rep);
    s = s.replace(FILLERS, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }

  function parseNumber(s) {
    if (!s) return null;
    if (/^\d+$/.test(s)) return Number(s);
    if (NUM_WORDS[s] != null) return NUM_WORDS[s];
    const m = s.match(/^(\w+) (hundred|thousand)$/);
    if (m && NUM_WORDS[m[1]]) return NUM_WORDS[m[1]] * (m[2] === 'hundred' ? 100 : 1000);
    return null;
  }

  // ---------------- references ----------------
  function defaultEnv() {
    return {
      roster: [],
      savedFields: [],
      scoreFielder(phrase) {
        const p = phrase.replace(/^(the|my|our) /, '');
        if (/^(fielder|player|number|no|man) ?\d+$/.test(p)) return 1;
        if (/^(keeper|the keeper)$/.test(p)) return 1;
        for (const n of this.roster) if (n && similarity(normaliseText(n), p) > 0.8) return 0.95;
        const m = matchPosition(p);
        return m ? m.score : 0;
      },
      scorePosition(phrase) {
        const m = matchPosition(phrase);
        return m ? m.score : 0;
      },
    };
  }

  // ---------------- preset matching ----------------
  const PRESET_KEYWORDS = {
    pace_death: ['death', 'yorker field', 'death overs field', 'death field'],
    pace_pp_standard: ['powerplay field', 'standard powerplay', 'new ball field'],
    pace_pp_attack: ['attacking powerplay', 'powerplay attack', 'two slips'],
    pace_pp_defend: ['defensive powerplay'],
    pace_t20_middle: ['middle overs field', 't20 middle', 'five out'],
    pace_odi_middle: ['odi middle', 'sweeper field', 'four out'],
    pace_test_umbrella: ['four slips', '4 slips', 'test new ball'],
    pace_test_standard: ['three slips', '3 slips', 'test field', 'standard test'],
    pace_test_oldball: ['old ball field'],
    pace_test_contain: ['containing', 'defensive test'],
    trap_bouncer: ['bouncer', 'hook', 'short ball', 'bouncer trap'],
    trap_legside: ['leg side trap', 'leg trap', 'leg gully trap', 'body'],
    trap_drive: ['drive trap', 'drive bait', 'fly slip trap'],
    trap_offstack: ['off side stack', 'off stack', 'seven two', '7 2'],
    trap_wideyorker: ['wide yorker', 'wide'],
    trap_legyorker: ['leg stump yorker', 'leg yorker'],
    trap_slower: ['slower ball', 'slower', 'cutter', 'mistimed'],
    trap_uppercut: ['upper cut', 'uppercut', 'third man trap'],
    trap_umbrella: ['umbrella', 'all out attack'],
    trap_sweep: ['sweep trap', 'sweep'],
    trap_reverse: ['reverse sweep', 'reverse'],
    trap_googly: ['googly', 'wrong un', 'wrongun'],
    trap_flight: ['flight', 'dip', 'stumping'],
    trap_ring: ['ring field', 'save the single', 'save one', 'ring'],
    spin_death: ['spin death'],
  };

  function matchPreset(phrase, env, ctxFilter) {
    const p = phrase.replace(/\b(the|a|an|field|trap|plan|setup|set up|preset|please)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!p) return null;
    let best = null;
    const consider = (id, label, kind, bonus = 0) => {
      const l = normaliseText(label);
      let s = similarity(l, p);
      if (l.includes(p) && p.length > 3) s = Math.max(s, 0.75 + p.length / (l.length * 6));
      s += bonus;
      if (!best || s > best.score) best = { id, kind, score: s };
    };
    for (const sf of env.savedFields || []) consider(sf, sf, 'saved', 0.05);
    for (const pr of PRESETS) {
      const fit = ctxFilter ? ctxFilter(pr) : 0;
      consider(pr.id, pr.name.replace(/^trap: /i, ''), 'preset', fit);
      for (const kw of PRESET_KEYWORDS[pr.id] || []) consider(pr.id, kw, 'preset', 0.04 + fit);
    }
    return best && best.score >= 0.7 ? best : null;
  }

  // ---------------- settings vocab ----------------
  function detectBowler(s, currentArm) {
    let arm = /\bleft arm\b|\bleftie\b|\blefty\b/.test(s) ? 'L' : /\bright arm\b/.test(s) ? 'R' : null;
    let type = null;
    if (/\bchinaman\b|\bwrist spin\b|\bleft arm (wrist|leg) spin\b/.test(s)) { type = 'ls'; arm = arm || 'L'; }
    else if (/\borthodox\b|\bslow left arm\b|\bsla\b|\bleft arm (finger|off) spin\b/.test(s)) { type = 'ob'; arm = 'L'; }
    else if (/\bleg spin\b|\bgoogly\b/.test(s)) type = 'ls';
    else if (/\boff spin\b|\bfinger spin\b|\bdoosra\b/.test(s)) type = 'ob';
    else if (/\bmedium fast\b|\bseam(er|ers)?\b|\bswing bowler\b|\bdibbly\b/.test(s)) type = 'mf';
    else if (/\bfast\b|\bquick\b|\bexpress\b|\bpace(man|r)?\b|\bfast bowler\b|\bspeedster\b/.test(s)) type = 'f';
    else if (/\bspin(ner)?\b/.test(s)) type = 'ob';
    if (!type) return null;
    arm = arm || currentArm || 'R';
    const map = { f: { R: 'rf', L: 'lf' }, mf: { R: 'rmf', L: 'lmf' }, ob: { R: 'rob', L: 'lob' }, ls: { R: 'rls', L: 'lls' } };
    return map[type][arm];
  }

  const PITCH_WORDS = [
    ['green', /\bgreen\b|\bgrass(y)?\b|\bseam(ing|er)?\b|\bgreen top\b|\bmoving\b/],
    ['flat', /\bflat\b|\broad\b|\bbelter\b|\bbatting (paradise|pitch|track|deck|wicket)\b|\bshirt ?front\b/],
    ['dusty', /\bdust(y|bowl)?\b|\bcrumbl(ing|y)\b|\bminefield\b|\bbunsen\b|\bday (four|five|4|5)\b|\bcracked\b|\brough\b/],
    ['dry', /\bdry\b|\bturn(er|ing)\b|\bspin(ning)? (pitch|track|friendly|wicket|deck)\b|\braging\b/],
    ['bouncy', /\bbouncy\b|\bbounce\b|\bhard\b|\bpacy\b|\bquick (pitch|track|deck|wicket)\b|\bperth\b|\bfast (pitch|track|deck|wicket)\b|\bcarry\b/],
    ['slow', /\bslow\b|\blow\b|\bsluggish\b|\btwo paced\b|\bsticky dead\b|\btacky\b/],
    ['damp', /\bdamp\b|\bwet\b|\bsticky\b|\bmoist(ure)?\b|\bjuic(e|y)\b/],
    ['balanced', /\bbalanced\b|\bnormal\b|\bgood (pitch|track|deck|wicket)\b|\beven\b|\bsporting\b|\bstandard\b|\bdefault\b/],
  ];

  const SHOT_WORDS = Object.entries(SHOTS).map(([id, s]) => [id, normaliseText(s.name)]).concat([
    ['coverdrive', 'cover drive'], ['straightdrive', 'straight drive'], ['ondrive', 'on drive'], ['offdrive', 'off drive'],
    ['squaredrive', 'square drive'], ['cut', 'cut'], ['cut', 'square cut'], ['latecut', 'late cut'], ['pull', 'pull'], ['pull', 'pull shot'],
    ['hook', 'hook'], ['sweep', 'sweep'], ['slogsweep', 'slog sweep'], ['reversesweep', 'reverse sweep'], ['scoop', 'scoop'], ['scoop', 'paddle'],
    ['scoop', 'paddle sweep'], ['ramp', 'ramp'], ['loftedstraight', 'lofted drive'], ['loftedstraight', 'down the ground'], ['loftedstraight', 'lofted shot'],
    ['loftedoff', 'inside out'], ['loftedoff', 'over cover'], ['slog', 'slog'], ['slog', 'cow corner slog'], ['flick', 'flick'], ['flick', 'clip'],
    ['glance', 'glance'], ['glance', 'leg glance'], ['defend', 'defence'], ['defend', 'defense'], ['defend', 'block'], ['push', 'push'], ['push', 'nudge'],
    ['dab', 'dab'], ['dab', 'steer'], ['punch', 'punch'], ['uppercut', 'upper cut'], ['leave', 'leave'],
  ]);

  function matchShot(phrase) {
    const p = phrase.replace(/\b(the|a|an|shot|shots|only|just)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (!p) return null;
    let best = null;
    for (const [id, w] of SHOT_WORDS) {
      const sc = w === p ? 1 : similarity(w, p);
      if (!best || sc > best.score) best = { id, score: sc };
    }
    return best && best.score >= 0.78 ? best.id : null;
  }

  // ---------------- main parser ----------------
  const MOVE_VERBS = '(?:move|shift|put|send|take|place|get|bring|station|have|position|change|set|relocate|go|stick|post)';
  const CONNECTORS = ['over to', 'across to', 'back to', 'up to', 'round to', 'out to', 'to', 'at', 'into', 'onto', 'towards', 'toward', 'too', '2', 'in'];

  function splitMove(body, env) {
    // try each connector occurrence; pick split maximising combined confidence
    const words = body.split(' ');
    let best = null;
    for (let i = 1; i < words.length; i++) {
      for (const c of CONNECTORS) {
        const cw = c.split(' ');
        if (words.slice(i, i + cw.length).join(' ') !== c) continue;
        const left = words.slice(0, i).join(' ');
        const right = words.slice(i + cw.length).join(' ');
        if (!left || !right) continue;
        const sl = env.scoreFielder(left), sr = env.scorePosition(right);
        const sc = Math.min(sl, sr) + (c === 'to' ? 0.02 : 0);
        if (sl >= 0.74 && sr >= 0.74 && (!best || sc > best.score)) best = { from: left, to: right, score: sc };
      }
    }
    if (best) return best;
    // no connector: "long on mid on"
    for (let i = 1; i < words.length; i++) {
      const left = words.slice(0, i).join(' '), right = words.slice(i).join(' ');
      const sl = env.scoreFielder(left), sr = env.scorePosition(right);
      const sc = Math.min(sl, sr) - 0.05;
      if (sl >= 0.85 && sr >= 0.85 && (!best || sc > best.score)) best = { from: left, to: right, score: sc };
    }
    return best;
  }

  function parseSim(s) {
    const simM = s.match(/^(simulate|sim|bowl|run|play|deliver|test|try|next ball)\b(.*)$/);
    if (simM) {
      let rest = simM[2].trim().replace(/^(the|a|an)\s+/, '');
      if (/^(simulation|sim|the simulation)$/.test(rest)) rest = '';
      if (simM[1] === 'next ball' || /^(a |one |the next )?ball$/.test(rest) || (simM[1] === 'bowl' && !rest)) return { type: 'simulate', balls: 1 };
      let balls = null, shot = null;
      const nm = rest.match(/^(\w+(?: hundred| thousand)?|an?) (balls?|deliveries|overs?)\b(.*)$/);
      if (nm) {
        const n = nm[1] === 'a' || nm[1] === 'an' ? 1 : parseNumber(nm[1]);
        if (n != null) balls = /^over/.test(nm[2]) ? n * 6 : n;
        rest = nm[3].replace(/^\s*(of|with|using|playing|only)\s+/, '').trim();
      } else if (/^(an |one )?over$/.test(rest)) { balls = 6; rest = ''; }
      if (rest) {
        const anyShot = /^(any|all|every|mixed|normal|natural|free) (shots?|strokes?)$/.test(rest);
        if (anyShot) shot = 'any';
        else shot = matchShot(rest.replace(/\b(shot|shots|stroke|strokes)\b/g, '').trim());
        if (!shot && !balls) return null; // e.g. "bowl short" is a plan, "test" a format
      }
      if (!rest && !balls && /^(test|try|play|deliver)$/.test(simM[1])) return null;
      return { type: 'simulate', balls: balls || (shot && shot !== 'any' ? 300 : null), shot };
    }
    return null;
  }

  function parseOne(raw, env, state = {}) {
    let s = normalise(raw);
    if (!s) return null;
    s = s.replace(WAKE, '').trim();
    let m;

    // --- meta ---
    if (/^(help|what can i say|what can you do|commands|show (me )?(the )?commands|voice commands)\b/.test(s)) return { type: 'help' };
    if (/^(stop listening|mic off|microphone off|go to sleep|stop the mic|turn off (the )?mic(rophone)?)\b/.test(s)) return { type: 'mic', on: false };
    if (/^(be quiet|mute|stop talking|silence|quiet|shut up|voice off|speech off)\b/.test(s)) return { type: 'speak', on: false };
    if (/^(talk to me|unmute|speak|voice on|speech on|read (out|aloud))\b/.test(s)) return { type: 'speak', on: true };
    if (/^(undo|take that back|go back|revert|cancel that|scratch that)\b/.test(s)) return { type: 'undo' };
    if (/^redo\b/.test(s)) return { type: 'redo' };
    if (/^(reset|clear|restore)( the)?( field| everything| setup)?$/.test(s) || /^(default|standard) field$/.test(s)) return { type: 'reset' };
    if (/\b(mirror|flip|reverse) (the )?field\b|^mirror( it)?$/.test(s)) return { type: 'mirror' };

    // --- save / rename ---
    if ((m = s.match(/^save( the| this)?( field| setup)?( as| called| named)? (.+)$/))) return { type: 'save', name: m[4] };
    if (/^save( the| this)?( field)?$/.test(s)) return { type: 'save', name: null };
    if ((m = s.match(/^(?:rename|call|name) (?:fielder|player|number|no) ?(\d+|\w+) (?:to|as) (.+)$/))) return { type: 'rename', ref: m[1], name: m[2] };
    if ((m = s.match(/^(?:fielder|player|number) (\d+) is (?:called |named )?(.+)$/))) return { type: 'rename', ref: m[1], name: m[2] };

    // --- view ---
    if (/^zoom (in|close|closer)\b|^(close|catching) view\b|^zoom on (the )?(bat|pitch|batter|close)/.test(s)) return { type: 'zoom', level: 'in' };
    if (/^zoom (out|reset|full)\b|^(full|whole) (field|ground|view)\b/.test(s)) return { type: 'zoom', level: 'out' };
    if ((m = s.match(/^(show|hide|toggle|display|turn on|turn off|remove) (the )?(heatmap|wagonwheel|labels|names|positions|zones|danger zones|ring|circle|grid)\b/))) {
      const on = /^(show|display|turn on)/.test(m[1]) ? true : /^(hide|turn off|remove)/.test(m[1]) ? false : null;
      const layer = { heatmap: 'heatmap', 'danger zones': 'heatmap', zones: 'heatmap', wagonwheel: 'wagon', labels: 'labels', names: 'labels', positions: 'labels', ring: 'ring', circle: 'ring', grid: 'ring' }[m[3]];
      return { type: 'layer', layer, on };
    }
    if (/\b(dark|night) (mode|theme)\b/.test(s)) return { type: 'theme', theme: 'dark' };
    if (/\b(light|day) (mode|theme)\b/.test(s)) return { type: 'theme', theme: 'light' };
    if ((m = s.match(/^(?:open|show|go to|switch to) (?:the )?(field|setup|simulat\w*|sim|analytics|analysis|stats|statistics|voice|help) (?:tab|panel|page)$/))) {
      const tab = /simul|sim/.test(m[1]) ? 'sim' : /anal|stat/.test(m[1]) ? 'analytics' : /voice|help/.test(m[1]) ? 'voice' : 'field';
      return { type: 'tab', tab };
    }

    // --- analytics ---
    if (/^(apply|accept|yes|yeah|yep|use it|do it|confirm|go with it|make it so)( it| that| this| the optimise field|the optimised field| the new field| the changes)?$/.test(s)) return { type: 'apply' };
    if (/\boptimise\b|\b(improve|perfect) (the |this |my )?field\b|\bbest possible field\b/.test(s)) return { type: 'optimise' };
    if (/\b(matrix|compare (the )?pitch(es)?|which pitch|every pitch|all (the )?pitch(es)?|each pitch|by pitch|pitch comparison)\b/.test(s)) return { type: 'matrix' };
    if (/^(set|use|load|apply|give me|put up|go with)( me)? (the )?(best|recommended|optimal|statistically best) field\b/.test(s)) return { type: 'recommend', apply: true };
    if (/\b(best field|recommend|which field|what field|suggest(ion)?( a)?( field)?|compare (the )?fields|rank (the )?fields|statistically|what should i set)\b/.test(s)) return { type: 'recommend' };
    if (/^(analyse|evaluate|assess|rate|score|how good is|how is|stats|statistics)\b/.test(s)) return { type: 'analyse' };

    // --- info ---
    if ((m = s.match(/^(?:where is|where s|wheres|find|who is at|whos at|who s at|who is) (.+)$/))) return { type: 'where', ref: m[1] };
    if (/^(read|list|describe|tell me|what is|whats|what s) (out )?(the |my )?(current )?(field|fielders|positions|setup)\b/.test(s)) return { type: 'read' };
    if (/\b(check|legal|is the field legal|restrictions|how many (are )?(out|outside|in the circle|inside))\b/.test(s)) return { type: 'rules' };

    // --- simulation ---
    const simCmd = parseSim(s);
    if (simCmd) return simCmd;
    if ((m = s.match(/^(?:batter|they|he|she)? ?(?:plays?|playing) (?:the |a |an )?(.+)$/))) {
      const sh = matchShot(m[1]); if (sh) return { type: 'shot', shot: sh };
    }
    if ((m = s.match(/^(?:any|all|every|mixed|natural) shots?$/))) return { type: 'shot', shot: 'any' };

    // --- swap ---
    if ((m = s.match(/^(?:swap|switch|exchange|interchange) (.+?) (?:and|with|for|&) (.+)$/)) && env.scoreFielder(m[1]) >= 0.74 && env.scoreFielder(m[2]) >= 0.74) {
      return { type: 'swap', a: m[1], b: m[2] };
    }

    // --- add a catcher: "add a slip", "bring in a short leg" ---
    if ((m = s.match(/^(?:(?:add|bring in|put in|get in|i want|give me|need)(?: a| an| another| one more| me a)?|a|an|another|one more) (.+)$/))) {
      const tgt = m[1].replace(/^(the) /, '');
      if (!/ to | at /.test(` ${tgt} `) && env.scorePosition(tgt) >= 0.8) return { type: 'add', to: tgt };
    }

    // --- relative moves: "bring mid on up", "push fine leg back", "point a bit squarer" ---
    m = s.match(new RegExp(`^(?:${MOVE_VERBS}|push|drop|pull|make|move)? ?(?:the )?(.+?) (?:a (?:bit|little|touch|fraction)|slightly|much|a lot|further|more)? ?(up|in|closer|forward|back|deeper|deep|out|squarer|finer|straighter|wider|finer still|square|fine)( a (?:bit|little|touch)| slightly| more)?$`));
    if (m && env.scoreFielder(m[1]) >= 0.8 && !/ (to|at) /.test(` ${m[1]} `)) {
      const small = /a (bit|little|touch|fraction)|slightly/.test(s);
      const dir = { up: 'in', in: 'in', closer: 'in', forward: 'in', back: 'out', deeper: 'out', deep: 'out', out: 'out', squarer: 'squarer', square: 'squarer', finer: 'finer', fine: 'finer', 'finer still': 'finer', straighter: 'straighter', wider: 'wider' }[m[2]];
      return { type: 'nudge', ref: m[1], dir, small };
    }

    // --- explicit moves ---
    const mv = s.match(new RegExp(`^(?:${MOVE_VERBS} )?(?:the )?(.+)$`));
    if (mv) {
      const sp = splitMove(mv[1], env);
      if (sp) return { type: 'move', from: sp.from, to: sp.to, confidence: sp.score };
    }

    // --- presets / traps (explicit) ---
    if ((m = s.match(/^(?:load|set|use|apply|give me|show me|change to|switch to|set up|go to|let s have|lets have|try)? ?(?:the |a |an |my )?(.+?) (field|trap|plan|setup|set up|preset)$/)) || (m = s.match(/^(?:load|apply|use|set up) (?:the |a |an |my )?(.+)$/))) {
      const phrase = m[1] + (m[2] && m[2] !== 'field' ? ' ' + m[2] : '');
      const pr = matchPreset(phrase, env, env.presetFit);
      if (pr) return { type: 'preset', id: pr.id, kind: pr.kind, confidence: pr.score };
    }

    // --- settings ---
    const settings = {};
    if (/\b(switch|change|swap|rotate|other)( the)? (batter|hands|strike|ends)\b|^(change|rotate) strike$/.test(s)) settings.hand = 'toggle';
    else if (/\bleft hander\b|\bleft hand(ed)?\b/.test(s)) settings.hand = 'L';
    else if (/\bright hander\b|\bright hand(ed)?\b/.test(s)) settings.hand = 'R';

    if (/\bt20\b/.test(s)) settings.format = 'T20';
    else if (/\bodi\b/.test(s)) settings.format = 'ODI';
    else if (/\btest\b/.test(s)) settings.format = 'Test';

    if (/\b(outside|after|out of|end of|no|non|without)( the)? powerplay\b|\bpowerplay (off|over|ended|finished|done)\b/.test(s)) settings.phase = 'middle';
    else if (/\bpowerplay\b|\bfirst (six|6|ten|10) overs\b|\bopening overs\b/.test(s)) settings.phase = 'powerplay';
    else if (/\bdeath\b|\bslog overs\b|\blast (few|five|5|ten|10) overs\b|\bfinal overs\b|\bend overs\b/.test(s)) settings.phase = 'death';
    else if (/\bmiddle( overs)?\b/.test(s)) settings.phase = 'middle';
    else if (/\bnew ball\b/.test(s)) settings.phase = 'newball';
    else if (/\bold ball\b/.test(s)) settings.phase = 'oldball';
    else if (/\bdeclaration\b/.test(s)) settings.phase = 'declare';

    if (/\baround( the)? wicket\b|\bround( the)? wicket\b/.test(s)) settings.overWicket = false;
    else if (/\bover( the)? wicket\b/.test(s)) settings.overWicket = true;

    if (/\bkeeper (up|standing up|stand up|to the stumps|close)\b|\bstand(ing)? up\b/.test(s)) settings.keeper = 'up';
    else if (/\bkeeper (back|standing back|stand back|deep|normal)\b|\bstand(ing)? back\b/.test(s)) settings.keeper = 'back';

    const hasOutfield = /\boutfield\b/.test(s);
    if (hasOutfield) {
      if (/\blightning\b|\bvery fast\b|\brapid\b/.test(s)) settings.outfield = 'lightning';
      else if (/\bfast\b|\bquick\b/.test(s)) settings.outfield = 'fast';
      else if (/\bslow\b|\bheavy\b|\blush\b|\bwet\b/.test(s)) settings.outfield = 'slow';
      else if (/\baverage\b|\bnormal\b/.test(s)) settings.outfield = 'average';
    }
    if (/\b(small|short) boundar(y|ies)\b|\bsmall ground\b/.test(s)) settings.ground = 'small';
    else if (/\b(big|large|long) boundar(y|ies)\b|\b(big|large) ground\b/.test(s)) settings.ground = 'large';
    else if (/\b(medium|normal) boundar(y|ies)\b/.test(s)) settings.ground = 'medium';

    if (/\b(overcast|cloudy|clouds|cloud cover)\b/.test(s)) settings.overhead = 'overcast';
    else if (/\b(sunny|clear sky|sunshine)\b/.test(s)) settings.overhead = 'sunny';
    else if (/\bhumid\b/.test(s)) settings.overhead = 'humid';
    if (/\b(no dew|dew off|dry evening|without dew)\b/.test(s)) settings.dew = false;
    else if (/\bdew\b/.test(s)) settings.dew = true;

    // batter profile (only when talking about the batter)
    if (/\bbatter\b|\bhitter\b|\btail ?ender\b|\banchor\b|\baccumulator\b/.test(s)) {
      if (/\bpower hitter\b|\baggressive\b|\bslogger\b|\bbig hitter\b|\bhitter\b/.test(s)) settings.batterProfile = 'aggressive';
      else if (/\banchor\b|\baccumulator\b|\bdefensive\b/.test(s)) settings.batterProfile = 'anchor';
      else if (/\btail ?ender\b|\btail\b|\bnumber (ten|eleven|10|11)\b/.test(s)) settings.batterProfile = 'tail';
      else if (/\boff side player\b|\bdrives\b|\bcutter of\b/.test(s)) settings.batterProfile = 'offside';
      else if (/\bleg side player\b|\bpulls\b|\bflicks\b/.test(s)) settings.batterProfile = 'legside';
      else if (/\bsweep(s|er)?\b/.test(s)) settings.batterProfile = 'sweeper';
      else if (/\bshort ball\b|\bbouncer\b/.test(s)) settings.batterProfile = 'shortweak';
      else if (/\bbalanced\b|\bnormal\b|\bstandard\b/.test(s)) settings.batterProfile = 'balanced';
    }

    // bowling plan: "bowl short", "bowl yorkers", "plan wide"
    if (/\bauto plan\b|^(bowl|bowling plan|plan|line|attack|target)\b|\bbowl(ing)? (short|yorkers|wide|full|straight|at the)/.test(s) || /\b(bouncers?|yorkers?|fourth stump|4th stump|channel|stump to stump|into the body|toss it up|flight it|darts)\b/.test(s)) {
      if (/\b(short|bouncers?|bumpers?|hit the deck)\b/.test(s)) settings.plan = 'short';
      else if (/\bwide (yorkers?|line|outside)\b|\bwide\b/.test(s)) settings.plan = 'wide';
      else if (/\byorkers?\b|\bblock hole\b/.test(s)) settings.plan = 'yorkers';
      else if (/\bfourth stump\b|\b4th stump\b|\bchannel\b|\bcorridor\b/.test(s)) settings.plan = 'channel';
      else if (/\bstump to stump\b|\b(at|attack) the stumps\b|\bstraight\b/.test(s)) settings.plan = 'stumps';
      else if (/\binto the body\b|\bbody\b|\bleg stump\b/.test(s)) settings.plan = 'body';
      else if (/\b(toss it up|flight|flighted|loop)\b/.test(s)) settings.plan = 'flight';
      else if (/\b(darts|flat|quicker)\b/.test(s)) settings.plan = 'darts';
      else if (/\b(drive|full and wide|invite)\b/.test(s)) settings.plan = 'drive';
      else if (/\b(auto|automatic|default|normal|stock)\b/.test(s)) settings.plan = 'auto';
    }

    // pitch: needs a pitch-ish noun, or a strongly pitch-specific word
    const pitchNoun = /\b(pitch|wicket|deck|surface|track|strip|conditions|turner|road|minefield|belter|green top|dustbowl)\b/.test(s);
    if (pitchNoun && !hasOutfield) {
      for (const [k, re] of PITCH_WORDS) if (re.test(s)) { settings.pitch = k; break; }
    }

    // bowler type
    if (!settings.plan || /\bbowler\b|\bbring on\b|\bspinner\b|\bpacer?\b/.test(s)) {
      const bowlerish = /\b(bowler|bowling|bring on|change to|spinner|spin|pace|pacer|seamer|fast|quick|medium fast|leg spin|off spin|orthodox|chinaman|wrist spin|left arm|right arm)\b/.test(s);
      if (bowlerish && !pitchNoun && !hasOutfield) {
        const b = detectBowler(s, state.bowlerArm);
        if (b) settings.bowlerType = b;
      }
    }

    if (Object.keys(settings).length) return { type: 'settings', settings };

    // --- last resort: preset name on its own ("death field" without verb handled above; "bouncer trap") ---
    const pr = matchPreset(s, env, env.presetFit);
    if (pr && pr.score >= 0.8) return { type: 'preset', id: pr.id, kind: pr.kind, confidence: pr.score };

    return null;
  }

  /** Parse an utterance that may contain several commands joined by "and"/"then". */
  function parseCommand(text, envIn, state) {
    const env = Object.assign(defaultEnv(), envIn || {});
    const whole = parseOne(text, env, state);
    const norm = normalise(text);
    // Try splitting into multiple commands
    const parts = norm.split(/\s*(?:,|\band then\b|\bthen\b|\band also\b|\balso\b|\band\b)\s*/).filter(Boolean);
    if (parts.length > 1) {
      const cmds = [];
      let lastVerbMove = false;
      for (const p of parts) {
        const c = parseOne(p, env, state);
        if (!c) { cmds.length = 0; break; }
        cmds.push(c);
        lastVerbMove = c.type === 'move';
      }
      void lastVerbMove;
      // prefer the split if it yields more than one concrete command and the whole didn't parse as a swap/settings
      if (cmds.length > 1 && (!whole || whole.type === 'move' || whole.type === 'settings' || whole.type === 'preset')) return cmds;
    }
    return whole ? [whole] : [];
  }

  // ---------------- speech wrapper ----------------
  class VoiceControl {
    constructor(opts = {}) {
      this.lang = opts.lang || 'en-GB';
      this.onResult = opts.onResult || (() => {});
      this.onInterim = opts.onInterim || (() => {});
      this.onState = opts.onState || (() => {});
      this.onError = opts.onError || (() => {});
      this.wanted = false;
      this.listening = false;
      this.speakEnabled = opts.speak !== false;
      const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
      this.supported = !!SR;
      this.ttsSupported = !!root.speechSynthesis;
      if (SR) {
        const r = new SR();
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 5;
        r.lang = this.lang;
        r.onstart = () => { this.listening = true; this.onState('listening'); };
        r.onend = () => {
          this.listening = false;
          if (this.wanted && !this._speaking) { setTimeout(() => this._safeStart(), 150); }
          else this.onState(this.wanted ? 'paused' : 'idle');
        };
        r.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.wanted = false; }
          this.onError(e.error);
        };
        r.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            if (res.isFinal) {
              const alts = [];
              for (let j = 0; j < res.length; j++) alts.push(res[j].transcript);
              this.onResult(alts);
            } else {
              this.onInterim(res[0].transcript);
            }
          }
        };
        this.rec = r;
      }
    }
    setLang(l) { this.lang = l; if (this.rec) { this.rec.lang = l; if (this.listening) { this.rec.stop(); } } }
    _safeStart() { try { this.rec.start(); } catch (e) { /* already started */ } }
    start() { if (!this.rec) return false; this.wanted = true; this._safeStart(); return true; }
    stop() { this.wanted = false; if (this.rec) try { this.rec.stop(); } catch (e) { /* noop */ } this.onState('idle'); }
    toggle() { return this.wanted ? (this.stop(), false) : this.start(); }
    speak(text) {
      if (!this.speakEnabled || !this.ttsSupported || !text) return;
      const synth = root.speechSynthesis;
      synth.cancel();
      const u = new root.SpeechSynthesisUtterance(text.replace(/—/g, ', ').replace(/–/g, ' to '));
      u.lang = this.lang;
      const v = synth.getVoices().find((x) => x.lang === this.lang) || synth.getVoices().find((x) => x.lang && x.lang.startsWith('en'));
      if (v) u.voice = v;
      u.rate = 1.05;
      // pause recognition while speaking so we don't hear ourselves
      if (this.rec && this.listening) { this._speaking = true; try { this.rec.abort(); } catch (e) { /* noop */ } }
      u.onend = u.onerror = () => { this._speaking = false; if (this.wanted && !this.listening) this._safeStart(); };
      synth.speak(u);
    }
  }

  Object.assign(CFS, { parseCommand, normaliseCommand: normalise, matchPreset, matchShot, detectBowler, VoiceControl });
})(typeof window !== 'undefined' ? window : globalThis);
