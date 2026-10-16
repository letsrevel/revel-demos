// Shared runtime for "One Line": timing lookups, the voice-synced word reveal,
// the rope registry + camera (read by the 3D world AND by DOM layers that must
// move with it), and the small maths the rope choreography needs.
//
// Everything here is a pure function of film time. No clocks, no Math.random.
// Loaded once in index.html <head>, so every sub-composition sees window.FILM.
(function () {
  'use strict';
  const T = window.TIMING;
  const W = 1920, H = 1080, TAU = Math.PI * 2;

  // ---------------------------------------------------------------- maths
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (a, b, x) => clamp((x - a) / (b - a));
  const E = {
    lin: t => t,
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outQuart: t => 1 - Math.pow(1 - t, 4),
    outQuint: t => 1 - Math.pow(1 - t, 5),
    inOutQuint: t => t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
    outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
    inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  };
  // damped spring step response 0 → 1 (overshoots); dt = seconds since start
  function spring(dt, freq = 2.2, damp = 0.5) {
    if (dt <= 0) return 0;
    const w = TAU * freq, z = damp, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + (z * w / wd) * Math.sin(wd * dt));
  }
  // seeded PRNG + 1D value noise (deterministic)
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function hash(n) { n = (n << 13) ^ n; return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824; }
  function noise1(x, seed = 0) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return lerp(hash(i + seed * 57), hash(i + 1 + seed * 57), u);
  }

  // ---------------------------------------------------------------- paths
  // Catmull-Rom through control points ([x,y] or [x,y,z]) → dense polyline
  function spline(ctrl, perSeg = 16, closed = false) {
    const d = ctrl[0].length;
    const P = closed ? [ctrl[ctrl.length - 1], ...ctrl, ctrl[0], ctrl[1]] : [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
    const out = [];
    for (let i = 1; i < P.length - 2; i++) {
      const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
      for (let j = 0; j < perSeg; j++) {
        const t = j / perSeg, t2 = t * t, t3 = t2 * t, q = [];
        for (let k = 0; k < d; k++)
          q.push(.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
        out.push(q);
      }
    }
    out.push([...(closed ? P[P.length - 2] : ctrl[ctrl.length - 1])]);
    return out;
  }
  function measure(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)));
    }
    return { pts, cum, L: cum[cum.length - 1] };
  }
  function pointAt(path, s) {
    const { pts, cum, L } = path; s = clamp(s, 0, L);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
    const seg = cum[hi] - cum[lo] || 1, f = (s - cum[lo]) / seg, a = pts[lo], b = pts[hi];
    return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), z: lerp(a[2] || 0, b[2] || 0, f), ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  }
  function resample(path, step) {
    const out = [];
    for (let s = 0; s <= path.L; s += step) { const p = pointAt(path, s); out.push([p.x, p.y, p.z]); }
    const e = pointAt(path, path.L); out.push([e.x, e.y, e.z]);
    return measure(out);
  }
  // sample an SVG path string into points (browser geometry engine)
  function svgPathPoints(d, step = 4, transform = null) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d); svg.appendChild(p); document.body.appendChild(svg);
    const L = p.getTotalLength(), out = [];
    for (let s = 0; s <= L; s += step) { const q = p.getPointAtLength(s); out.push(transform ? transform(q.x, q.y) : [q.x, q.y]); }
    svg.remove();
    return out;
  }

  // ---------------------------------------------------------------- timing
  const lineById = Object.fromEntries(T.lines.map(l => [l.id, l]));
  const line = id => lineById[id];
  // spoken start of a word in a line: by index, or by (case-insensitive) text match
  function wordAt(id, which) {
    const l = line(id); if (!l || !l.words.length) return l ? l.start : 0;
    if (typeof which === 'number') return (l.words[which] || l.words[l.words.length - 1]).s;
    // ’ and ' are the same word: on-screen text uses the typographic apostrophe
    const norm = x => String(x).toLowerCase().replace(/’/g, "'").replace(/[^\p{L}\p{N}']/gu, '');
    const k = norm(which);
    const w = l.words.find(w => norm(w.w) === k);
    return w ? w.s : l.start;
  }

  // Voice-synced type. Splits `el`'s text into word spans and reveals each at the
  // moment he says it (frame.md "Words follow his voice"). `sceneStart` is the
  // layer's data-start, because sub-composition timelines run in local time.
  //   FILM.revealWords(tl, el, 'v06', 19.0, { from: 0, to: 2 })   // words 0..2 of v06
  // The element's text must be the line's words (any subset, in order). When the
  // count differs from the spoken words, times are spread by character offset.
  function revealWords(tl, el, id, sceneStart, o = {}) {
    const l = line(id);
    const text = el.textContent.trim().replace(/\s+/g, ' ');
    const toks = text.split(' ');
    el.textContent = '';
    // word gaps are margins, not text nodes: a flex container drops whitespace-only
    // text nodes, which glued words together ("isdifferent")
    const spans = toks.map((tok, i) => {
      const s = document.createElement('span');
      s.className = 'w'; s.textContent = tok; s.style.display = 'inline-block'; s.style.willChange = 'transform, opacity, filter';
      if (i < toks.length - 1) s.style.marginRight = (o.gap ?? 0.26) + 'em';
      el.appendChild(s);
      return s;
    });
    let times;
    const ws = (l && l.words) || [];
    const off = o.from || 0;
    if (ws.length && toks.length === Math.min(ws.length - off, (o.to ?? ws.length - 1) - off + 1)) {
      times = toks.map((_, i) => ws[off + i].s);
    } else if (ws.length) {
      // proportional fallback across the line's spoken span
      const a = ws[off] ? ws[off].s : l.start, b = ws[Math.min(ws.length - 1, o.to ?? ws.length - 1)].s;
      const total = text.length || 1; let c = 0;
      times = toks.map(tok => { const t0 = lerp(a, b, c / total); c += tok.length + 1; return t0; });
    } else {
      const a = l ? l.start : sceneStart; times = toks.map((_, i) => a + i * 0.22);
    }
    const dur = o.dur ?? 0.45, lead = o.lead ?? 0.04;
    spans.forEach((s, i) => {
      tl.fromTo(s, { opacity: 0, y: o.y ?? 14, filter: `blur(${o.blur ?? 10}px)` },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: dur, ease: o.ease || 'power3.out' }, Math.max(0, times[i] - lead - sceneStart));
    });
    return { spans, times };
  }

  // ---------------------------------------------------------------- rope + camera
  // Each rope/<section>.js calls FILM.rope.section({...}). The world layer asks
  // FILM.rope.at(t) every frame; DOM layers can ask FILM.camera(t) / FILM.toScreen.
  //
  // section({ id, from, to, frame(t) → { strands, beads }, camera?(t) → cam })
  //   strand: { pts: [[x,y,z?], …] world px (y down, z toward viewer),
  //             w: diameter px (18), from: 0..1, to: 0..1 (drawn fraction),
  //             colA: '#8C3CDD', colB: '#E6332A' (start → end colour), alpha: 1,
  //             smooth: true (Catmull-Rom the pts), closed: false, phase: 0 (strand twist offset) }
  //   bead:   { x, y, z, r, color, alpha, glow: 0..1 }      — the people
  //   cam:    { x, y, zoom, rot }  — world point at screen centre, zoom (1 = 1 world px per screen px), roll in rad
  const sections = [];
  const DEFAULT_CAM = { x: W / 2, y: H / 2, zoom: 1, rot: 0 };
  const rope = {
    section(def) { sections.push(def); sections.sort((a, b) => a.from - b.from); return def; },
    all: () => sections.slice(),
    active: t => sections.filter(s => t >= s.from && t < s.to),
    // env: optional partial override of the world's surface/light for this frame
    // (schema owned by compositions/world.html, documented there). Later sections win.
    at(t) {
      const out = { strands: [], beads: [], env: {} };
      for (const s of sections) if (t >= s.from && t < s.to) {
        const f = s.frame(t) || {};
        if (f.strands) out.strands.push(...f.strands);
        if (f.beads) out.beads.push(...f.beads);
        if (f.env) Object.assign(out.env, f.env);
      }
      return out;
    },
  };
  function camera(t) {
    for (let i = sections.length - 1; i >= 0; i--) {
      const s = sections[i];
      if (s.camera && t >= s.from && t < s.to) return Object.assign({}, DEFAULT_CAM, s.camera(t));
    }
    return Object.assign({}, DEFAULT_CAM);
  }
  // world px → screen px through the camera at time t
  function toScreen(t, x, y) {
    const c = camera(t), dx = (x - c.x) * c.zoom, dy = (y - c.y) * c.zoom;
    const cr = Math.cos(c.rot), sr = Math.sin(c.rot);
    return { x: W / 2 + dx * cr - dy * sr, y: H / 2 + dx * sr + dy * cr, scale: c.zoom };
  }
  // CSS transform that puts a 1920×1080 world-space DOM container under the camera
  function cameraCSS(t) {
    const c = camera(t);
    return `translate(${W / 2}px, ${H / 2}px) rotate(${c.rot}rad) scale(${c.zoom}) translate(${-c.x}px, ${-c.y}px)`;
  }
  // Make a DOM container (absolutely positioned at 0,0, 1920×1080, transform-origin 0 0)
  // follow the world camera for [from, to) of film time.
  function followCamera(tl, el, sceneStart, from, to) {
    el.style.transformOrigin = '0 0';
    const p = { t: from };
    tl.fromTo(p, { t: from }, { t: to, duration: to - from, ease: 'none',
      onUpdate: () => { el.style.transform = cameraCSS(p.t); } }, from - sceneStart);
  }

  window.FILM = {
    T, W, H, TAU, clamp, lerp, prog, E, spring, rng, noise1,
    spline, measure, pointAt, resample, svgPathPoints,
    line, wordAt, revealWords,
    rope, camera, toScreen, cameraCSS, followCamera,
    C: { purple: '#8C3CDD', crimson: '#E6332A', lavender: '#AB82DB', peri: '#9AB2FF', amber: '#F9B233',
      ink: '#0D1E1C', paper: '#F1ECFA', paper2: '#E7DEF6', night: '#160B24', plum: '#2A1340', white: '#FFFFFF',
      concrete: '#C9CAD0', concreteDark: '#8E9098', steel: '#5D6069' },
  };
})();
