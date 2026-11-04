/*
 * Cricket Field Simulator — core utilities & geometry.
 *
 * COORDINATE SYSTEM (used everywhere in the engine)
 * -------------------------------------------------
 * Positions are stored RELATIVE TO THE BATTER on strike, in polar form:
 *   theta (deg): 0   = straight back past the bowler
 *                +90 = square on the OFF side, -90 = square on the LEG side
 *                ±180 = directly behind the stumps (wicket-keeper)
 *   d (m):       distance from the striker's stumps
 *
 * Because positions are batter-relative, switching between a right- and a
 * left-handed batter mirrors the field automatically (as a captain would).
 *
 * Cartesian batter frame: X = d·sin(theta) (off side +), Y = d·cos(theta)
 * (towards the bowler +). The striker's stumps are at (0,0), the bowler's
 * stumps at (0, PITCH_LEN) and the centre of the pitch at (0, PITCH_LEN/2).
 */
(function (root) {
  'use strict';
  const CFS = (root.CFS = root.CFS || {});

  const PITCH_LEN = 20.12; // metres, stumps to stumps
  const RING_RADIUS = 27.43; // 30 yards
  const CLOSE_RADIUS = 13.72; // 15 yards (traditional catching ring)
  const DEG = Math.PI / 180;

  // ---------- RNG (seeded, reproducible) ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const r = mulberry32(seed == null ? (Math.random() * 2 ** 32) >>> 0 : seed);
    const rng = () => r();
    rng.normal = (mu = 0, sd = 1) => {
      let u = 0, v = 0;
      while (u === 0) u = r();
      while (v === 0) v = r();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    rng.pick = (weights) => {
      // weights: object {key: w} or array of [key, w]
      const entries = Array.isArray(weights) ? weights : Object.entries(weights);
      let total = 0;
      for (const [, w] of entries) total += Math.max(0, w);
      if (total <= 0) return entries[0][0];
      let x = r() * total;
      for (const [k, w] of entries) {
        x -= Math.max(0, w);
        if (x <= 0) return k;
      }
      return entries[entries.length - 1][0];
    };
    rng.chance = (p) => r() < p;
    return rng;
  }

  // ---------- math ----------
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  function normAngle(t) {
    // to (-180, 180]
    let a = ((t + 180) % 360 + 360) % 360 - 180;
    return a === -180 ? 180 : a;
  }
  const angDiff = (a, b) => Math.abs(normAngle(a - b));

  function toXY(theta, d) {
    return { x: d * Math.sin(theta * DEG), y: d * Math.cos(theta * DEG) };
  }
  function fromXY(x, y) {
    return { theta: normAngle(Math.atan2(x, y) / DEG), d: Math.hypot(x, y) };
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- ground ----------
  /**
   * Ground model: elliptical boundary centred on the middle of the pitch.
   * a = half-width (square boundaries), b = half-length (straight boundaries).
   */
  function makeGround(size) {
    const presets = {
      small: { a: 62, b: 66, label: 'Small (≈60–65 m)' },
      medium: { a: 68, b: 72, label: 'Medium (≈65–70 m)' },
      large: { a: 76, b: 80, label: 'Large (≈75–80 m)' },
    };
    return Object.assign({ key: size }, presets[size] || presets.medium);
  }

  /** distance from the striker to the boundary rope along direction theta */
  function boundaryDist(theta, ground) {
    const u = Math.sin(theta * DEG), v = Math.cos(theta * DEG);
    const a = ground.a, b = ground.b, c = PITCH_LEN / 2;
    const A = (u * u) / (a * a) + (v * v) / (b * b);
    const B = (-2 * c * v) / (b * b);
    const C = (c * c) / (b * b) - 1;
    const disc = B * B - 4 * A * C;
    return (-B + Math.sqrt(disc)) / (2 * A);
  }

  /** inside the 30-yard fielding restriction ring (two semicircles + straights) */
  function insideRing(x, y) {
    if (y >= 0 && y <= PITCH_LEN) return Math.abs(x) <= RING_RADIUS;
    if (y < 0) return Math.hypot(x, y) <= RING_RADIUS;
    return Math.hypot(x, y - PITCH_LEN) <= RING_RADIUS;
  }
  function insideRingPolar(theta, d) {
    const p = toXY(theta, d);
    return insideRing(p.x, p.y);
  }

  // ---------- misc ----------
  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  function similarity(a, b) {
    if (!a.length && !b.length) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }
  const fmt = (x, dp = 1) => (Number.isFinite(x) ? x.toFixed(dp) : '—');
  const pct = (x, dp = 0) => (Number.isFinite(x) ? (x * 100).toFixed(dp) + '%' : '—');
  const titleCase = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

  Object.assign(CFS, {
    PITCH_LEN, RING_RADIUS, CLOSE_RADIUS, DEG,
    makeRng, clamp, lerp, normAngle, angDiff, toXY, fromXY, dist,
    makeGround, boundaryDist, insideRing, insideRingPolar,
    deepClone, levenshtein, similarity, fmt, pct, titleCase,
  });
})(typeof window !== 'undefined' ? window : globalThis);
