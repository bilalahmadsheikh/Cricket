/*
 * SVG field renderer. Screen frame: origin = centre of the pitch, metres,
 * y grows towards the bowler's end (bottom of the screen); the striker is at
 * the top. Off side is screen-left for a right-hander, screen-right for a
 * left-hander (the TV view from behind the bowler).
 */
(function (root) {
  'use strict';
  const CFS = root.CFS;
  const { toXY, fromXY, PITCH_LEN, RING_RADIUS, boundaryDist, POSITIONS, spotFor } = CFS;
  const NS = 'http://www.w3.org/2000/svg';
  const HALF = PITCH_LEN / 2;

  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  class FieldView {
    constructor(svg, cb) {
      this.svg = svg;
      this.cb = cb; // {onMove(id,theta,d,final), onSelect(id), onPlace(theta,d)}
      this.zoom = 'out';
      this.selected = null;
      this.layers = { labels: true, heatmap: false, wagon: false };
      this.snap = true;
      this._build();
    }

    _build() {
      const s = this.svg;
      s.innerHTML = '';
      const defs = el('defs', {}, s);
      const pat = el('pattern', { id: 'mow', width: 12, height: 12, patternUnits: 'userSpaceOnUse' }, defs);
      el('rect', { width: 12, height: 6, fill: 'var(--grass-a)' }, pat);
      el('rect', { y: 6, width: 12, height: 6, fill: 'var(--grass-b)' }, pat);
      const rg = el('radialGradient', { id: 'vignette', cx: '50%', cy: '50%', r: '55%' }, defs);
      el('stop', { offset: '70%', 'stop-color': '#000', 'stop-opacity': 0 }, rg);
      el('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0.28 }, rg);
      const sh = el('filter', { id: 'shadow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
      el('feDropShadow', { dx: 0, dy: 0.4, stdDeviation: 0.5, 'flood-opacity': 0.45 }, sh);
      this.gGround = el('g', {}, s);
      this.gHeat = el('g', { class: 'heat' }, s);
      this.gMarks = el('g', { class: 'marks' }, s);
      this.gWagon = el('g', { class: 'wagon' }, s);
      this.gPitch = el('g', {}, s);
      this.gGhost = el('g', { class: 'ghosts' }, s);
      this.gFielders = el('g', { class: 'fielders' }, s);
      this.gBall = el('g', {}, s);

      // tap-to-place on empty grass
      s.addEventListener('pointerdown', (e) => {
        if (e.target.closest && e.target.closest('.fielder')) return;
        if (this.selected == null) return;
        const p = this.toField(e);
        this.cb.onPlace && this.cb.onPlace(this.selected, p.theta, p.d);
      });
    }

    /** client event → batter-frame polar */
    toField(e) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const sp = pt.matrixTransform(this.svg.getScreenCTM().inverse());
      const X = sp.x * this.offSign;
      const Y = sp.y + HALF;
      return fromXY(X, Y);
    }
    /** batter-frame polar → screen */
    toScreen(theta, d) {
      const p = toXY(theta, d);
      return { x: this.offSign * p.x, y: p.y - HALF };
    }
    xyToScreen(x, y) { return { x: this.offSign * x, y: y - HALF }; }

    setViewBox() {
      const g = this.ground;
      let vb;
      if (this.zoom === 'in') vb = [-34, -HALF - 30, 68, 64];
      else vb = [-g.a - 5, -g.b - 8, 2 * g.a + 10, 2 * g.b + 13];
      this.svg.setAttribute('viewBox', vb.join(' '));
      this.k = vb[2] / 156; // scale factor for tokens/text
    }

    render(model) {
      // model: {field, ground, hand, keeperMode, rules, stats, names, highlight}
      this.model = model;
      this.ground = model.ground;
      this.offSign = model.hand === 'L' ? 1 : -1;
      this.setViewBox();
      this._drawGround();
      this._drawHeat();
      this._drawWagon();
      this._drawPitch();
      this._drawFielders();
    }

    _drawGround() {
      const g = this.gGround, gr = this.ground, k = this.k;
      g.innerHTML = '';
      el('rect', { x: -400, y: -400, width: 800, height: 800, fill: 'var(--surround)' }, g);
      el('ellipse', { cx: 0, cy: 0, rx: gr.a + 3, ry: gr.b + 3, fill: 'var(--grass-edge)' }, g);
      el('ellipse', { cx: 0, cy: 0, rx: gr.a, ry: gr.b, fill: 'url(#mow)' }, g);
      el('ellipse', { cx: 0, cy: 0, rx: gr.a, ry: gr.b, fill: 'url(#vignette)' }, g);
      el('ellipse', { cx: 0, cy: 0, rx: gr.a, ry: gr.b, fill: 'none', stroke: 'var(--rope)', 'stroke-width': 0.9 }, g);
      // 30-yard ring
      const R = RING_RADIUS;
      el('path', { d: `M ${-R} ${-HALF} A ${R} ${R} 0 0 1 ${R} ${-HALF} L ${R} ${HALF} A ${R} ${R} 0 0 1 ${-R} ${HALF} Z`, fill: 'rgba(255,255,255,0.035)', stroke: 'rgba(255,255,255,0.75)', 'stroke-width': 0.35, 'stroke-dasharray': '1.6 1.2' }, g);
      // side labels
      const offX = this.offSign * (gr.a * 0.84), legX = -offX;
      const ty = -gr.b * 0.95;
      el('text', { x: offX, y: ty, class: 'side-label', 'font-size': 3.6 * k, 'text-anchor': 'middle' }, g).textContent = 'OFF SIDE';
      el('text', { x: legX, y: ty, class: 'side-label', 'font-size': 3.6 * k, 'text-anchor': 'middle' }, g).textContent = 'LEG SIDE';
      el('text', { x: 0, y: gr.b - 3, class: 'side-label', 'font-size': 3 * k, 'text-anchor': 'middle' }, g).textContent = "Bowler's end";
    }

    _drawPitch() {
      const g = this.gPitch, k = this.k;
      g.innerHTML = '';
      el('rect', { x: -1.6, y: -HALF - 1.6, width: 3.2, height: PITCH_LEN + 3.2, fill: 'var(--pitch)', rx: 0.3 }, g);
      for (const sy of [-1, 1]) {
        const y = sy * HALF;
        el('line', { x1: -1.8, x2: 1.8, y1: y, y2: y, stroke: '#fff', 'stroke-width': 0.12 }, g); // bowling crease
        const pc = y - sy * 1.22;
        el('line', { x1: -2.4, x2: 2.4, y1: pc, y2: pc, stroke: '#fff', 'stroke-width': 0.12 }, g); // popping crease
        el('rect', { x: -0.12, y: y - 0.12, width: 0.24, height: 0.24, fill: '#fff' }, g); // stumps
      }
      // batter (bat on the off side of the body)
      const bx = -this.offSign * 0.55, by = -HALF + 1.1;
      el('circle', { cx: bx, cy: by, r: 0.75 * Math.max(1, k), class: 'batter' }, g);
      el('line', { x1: bx, y1: by, x2: bx + this.offSign * 1.4 * Math.max(1, k), y2: by + 0.4, stroke: '#e9d8a6', 'stroke-width': 0.35 * Math.max(1, k), 'stroke-linecap': 'round' }, g);
      el('text', { x: bx - this.offSign * 2.5 * k, y: by - 1.2 * k, 'font-size': 2.4 * k, class: 'mini-label', 'text-anchor': 'middle' }, g).textContent = this.model.hand === 'L' ? 'LHB' : 'RHB';
      // bowler
      const bw = el('g', { class: 'bowler-token' }, g);
      el('circle', { cx: 1.3 * this.offSign * 0, cy: HALF + 2.8, r: 1.8 * k, class: 'token bowler' }, bw);
      el('text', { x: 0, y: HALF + 2.8 + 0.8 * k, 'font-size': 2.1 * k, 'text-anchor': 'middle', class: 'token-num' }, bw).textContent = 'B';
    }

    _drawFielders() {
      const g = this.gFielders, k = this.k, m = this.model;
      g.innerHTML = '';
      const r = 2.2 * k;
      for (const f of m.field.fielders) {
        const p = this.toScreen(f.theta, f.d);
        const isOut = !CFS.insideRingPolar(f.theta, f.d);
        const cls = ['fielder', f.role === 'keeper' ? 'keeper' : '', isOut ? 'out' : '', this.selected === f.id ? 'selected' : '', m.flagged && m.flagged.has(f.id) ? 'flagged' : '', m.highlight === f.id ? 'pulse' : ''].join(' ');
        const t = el('g', { class: cls, transform: `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`, tabindex: 0, role: 'button', 'aria-label': `${f.name}, ${m.names[f.id]}` }, g);
        el('circle', { r: r * 1.9, class: 'hit' }, t);
        el('circle', { r, class: 'token', filter: 'url(#shadow)' }, t);
        el('text', { y: 0.75 * k, 'font-size': 2.1 * k, 'text-anchor': 'middle', class: 'token-num' }, t).textContent = f.role === 'keeper' ? 'WK' : String(f.id);
        if (this.layers.labels) {
          const lbl = el('text', { y: r + 2.9 * k, 'font-size': 2.45 * k, 'text-anchor': 'middle', class: 'pos-label' }, t);
          const crowded = this.zoom !== 'in' && f.d < 9;
          if (f.role === 'keeper' && this.zoom !== 'in') lbl.textContent = '';
          else if (crowded) {
            const c = CFS.classify(f.theta, f.d, this.ground, { keeperMode: m.keeperMode });
            lbl.textContent = c.pos.short;
          } else lbl.textContent = (m.names[f.id] || '').replace(' (adj.)', '*');
          if (m.showPlayerNames && !crowded && f.name && !/^Fielder \d|^Keeper$/.test(f.name)) {
            el('text', { y: r + 5.4 * k, 'font-size': 2.1 * k, 'text-anchor': 'middle', class: 'name-label' }, t).textContent = f.name;
          }
        }
        this._attachDrag(t, f);
      }
    }

    _attachDrag(node, f) {
      let dragging = false, moved = false, start = null;
      node.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        dragging = true; moved = false; start = { x: e.clientX, y: e.clientY };
        node.setPointerCapture(e.pointerId);
      });
      node.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
        moved = true;
        const p = this.toField(e);
        const sp = this.toScreen(p.theta, p.d);
        node.setAttribute('transform', `translate(${sp.x.toFixed(2)} ${sp.y.toFixed(2)})`);
        this._ghost(p);
        this.cb.onMove && this.cb.onMove(f.id, p.theta, p.d, false);
      });
      const end = (e) => {
        if (!dragging) return;
        dragging = false;
        this.gGhost.innerHTML = '';
        if (!moved) { this.cb.onSelect && this.cb.onSelect(f.id); return; }
        let p = this.toField(e);
        if (this.snap) p = this._snapped(p) || p;
        this.cb.onMove && this.cb.onMove(f.id, p.theta, p.d, true);
      };
      node.addEventListener('pointerup', end);
      node.addEventListener('pointercancel', end);
      node.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 5 : 1.5;
        const cur = toXY(f.theta, f.d);
        let dx = 0, dy = 0;
        if (e.key === 'ArrowLeft') dx = -step; else if (e.key === 'ArrowRight') dx = step;
        else if (e.key === 'ArrowUp') dy = -step; else if (e.key === 'ArrowDown') dy = step;
        else if (e.key === 'Enter' || e.key === ' ') { this.cb.onSelect && this.cb.onSelect(f.id); e.preventDefault(); return; }
        else return;
        e.preventDefault();
        const q = fromXY(cur.x + dx * this.offSign, cur.y + dy);
        this.cb.onMove && this.cb.onMove(f.id, q.theta, q.d, true, true);
      });
    }

    _snapped(p) {
      const here = toXY(p.theta, p.d);
      let best = null;
      for (const pos of POSITIONS) {
        if (pos.id === 'wk') continue;
        const s = spotFor(pos.id, this.ground, { keeperMode: this.model.keeperMode });
        const q = toXY(s.theta, s.d);
        const dd = Math.hypot(q.x - here.x, q.y - here.y);
        const tol = s.d < 10 ? 1.8 : 4.5;
        if (dd < tol && (!best || dd < best.dd)) best = { dd, theta: s.theta, d: s.d, name: pos.name };
      }
      return best;
    }

    _ghost(p) {
      const g = this.gGhost, k = this.k;
      g.innerHTML = '';
      const s = this.snap && this._snapped(p);
      const name = s ? s.name : CFS.describe(p.theta, p.d, this.ground, { keeperMode: this.model.keeperMode });
      if (s) {
        const sp = this.toScreen(s.theta, s.d);
        el('circle', { cx: sp.x, cy: sp.y, r: 2.6 * k, class: 'snap-ring' }, g);
      }
      const sp = this.toScreen(p.theta, p.d);
      const t = el('text', { x: sp.x, y: sp.y - 3.6 * k, 'font-size': 2.8 * k, 'text-anchor': 'middle', class: 'ghost-label' }, g);
      t.textContent = name + (CFS.insideRingPolar(p.theta, p.d) ? '' : ' · outside ring');
    }

    _drawHeat() {
      const g = this.gHeat;
      g.innerHTML = '';
      const st = this.model.stats;
      if (!this.layers.heatmap || !st) return;
      const maxRuns = Math.max(1, ...st.sectors.map((s) => s.runs));
      st.sectors.forEach((sec, i) => {
        if (!sec.runs && !sec.outs) return;
        const a0 = -180 + i * 15, a1 = a0 + 15;
        const inner = 6;
        const pts = [];
        for (let a = a0; a <= a1 + 0.01; a += 3) pts.push(this.toScreen(a, boundaryDist(a, this.ground)));
        const i1 = this.toScreen(a1, inner), i0 = this.toScreen(a0, inner);
        const sx = this.toScreen(0, 0);
        void sx;
        const d = `M ${i0.x} ${i0.y} ` + pts.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ') + ` L ${i1.x} ${i1.y} Z`;
        const t = sec.runs / maxRuns;
        el('path', { d, fill: `rgba(255, ${Math.round(210 - 180 * t)}, 40, ${0.04 + 0.42 * t * t})`, stroke: 'none' }, g);
        if (sec.runs / Math.max(1, st.runs) >= 0.04) {
          const mid = this.toScreen(a0 + 7.5, boundaryDist(a0 + 7.5, this.ground) * 0.5);
          el('text', { x: mid.x, y: mid.y, 'font-size': 2.4 * this.k, 'text-anchor': 'middle', class: 'heat-label' }, g).textContent = `${Math.round((100 * sec.runs) / Math.max(1, st.runs))}%`;
        }
      });
    }

    _drawWagon() {
      const g = this.gWagon;
      g.innerHTML = '';
      const st = this.model.stats;
      if (!this.layers.wagon || !st || !st.wagon) return;
      const o = this.xyToScreen(0, 0);
      for (const w of st.wagon) {
        const e = this.xyToScreen(w.x, w.y);
        const color = w.out ? 'var(--c-out)' : w.runs === 6 ? 'var(--c-six)' : w.runs === 4 ? 'var(--c-four)' : w.runs > 0 ? 'var(--c-runs)' : 'var(--c-dot)';
        el('line', { x1: o.x, y1: o.y, x2: e.x, y2: e.y, stroke: color, 'stroke-width': w.runs >= 4 || w.out ? 0.35 : 0.2, opacity: w.runs === 0 && !w.out ? 0.35 : 0.8, 'stroke-dasharray': w.aerial ? '1 0.6' : null }, g);
        if (w.out) el('circle', { cx: e.x, cy: e.y, r: 0.8, fill: 'var(--c-out)' }, g);
      }
    }

    /** Animate one simulated ball. */
    animateBall(ev, done) {
      const g = this.gBall;
      g.innerHTML = '';
      const k = this.k;
      const ball = el('circle', { r: 0.9 * Math.max(0.7, k), class: 'ball' }, g);
      const trail = el('path', { class: 'ball-trail', d: '' }, g);
      const start = this.xyToScreen(0, PITCH_LEN - 1);
      const bat = this.xyToScreen(0, 0.6);
      const end = ev.theta == null ? this.xyToScreen(0, -1.5) : this.xyToScreen(ev.x, ev.y);
      const land = ev.landed ? this.xyToScreen(ev.landed.x, ev.landed.y) : null;
      const t1 = 520; // delivery
      const dist = Math.hypot(end.x - bat.x, end.y - bat.y);
      const t2 = ev.theta == null ? 200 : Math.min(1700, 420 + dist * 16);
      const t0 = performance.now();
      const step = (now) => {
        const t = now - t0;
        let x, y;
        if (t < t1) {
          const u = t / t1;
          x = start.x + (bat.x - start.x) * u; y = start.y + (bat.y - start.y) * u;
        } else {
          const u = Math.min(1, (t - t1) / t2);
          const e = 1 - Math.pow(1 - u, 2);
          x = bat.x + (end.x - bat.x) * e; y = bat.y + (end.y - bat.y) * e;
          if (ev.aerial && land) {
            // fake height: scale the ball up mid-flight
            const h = Math.sin(Math.min(1, e) * Math.PI);
            ball.setAttribute('r', (0.9 + 1.1 * h) * Math.max(0.7, k));
          }
          trail.setAttribute('d', `M ${bat.x} ${bat.y} L ${x} ${y}`);
          if (u >= 1) {
            ball.setAttribute('cx', x); ball.setAttribute('cy', y);
            setTimeout(() => { g.innerHTML = ''; }, 1600);
            done && done();
            return;
          }
        }
        ball.setAttribute('cx', x); ball.setAttribute('cy', y);
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    /** Serialise current SVG to a PNG data URL. */
    toPNG(scale = 3) {
      return new Promise((resolve) => {
        const clone = this.svg.cloneNode(true);
        const vb = this.svg.getAttribute('viewBox').split(' ').map(Number);
        const css = getComputedStyle(document.documentElement);
        let src = new XMLSerializer().serializeToString(clone);
        // inline CSS variables used in fills
        src = src.replace(/var\((--[\w-]+)\)/g, (_, v) => css.getPropertyValue(v).trim() || '#888');
        const style = `<style>.token{fill:#1f6feb;stroke:#fff;stroke-width:.35}.keeper .token{fill:#e8590c}.out .token{fill:#0b7285}.token-num{fill:#fff;font-weight:700;font-family:sans-serif}.pos-label,.name-label{fill:#fff;font-family:sans-serif;paint-order:stroke;stroke:#000;stroke-width:.5}.side-label,.mini-label{fill:rgba(255,255,255,.7);font-family:sans-serif;font-weight:700}.batter{fill:#ffd43b}.bowler{fill:#c92a2a}.hit{fill:transparent}</style>`;
        src = src.replace(/(<svg[^>]*>)/, `$1${style}`);
        const img = new Image();
        const w = vb[2] * 10 * scale / 3, h = vb[3] * 10 * scale / 3;
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/png'));
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src.replace('<svg', `<svg width="${w}" height="${h}"`));
      });
    }
  }

  CFS.FieldView = FieldView;
})(typeof window !== 'undefined' ? window : globalThis);
