// Rope choreography for s2-different (film 19.0 – 39.671 s): the drop and the verse.
// Pure functions of film time. Also publishes window.S2 — the shared geometry the
// scene layer (compositions/s2-different.html) reads so DOM props ride the rope exactly.
//
// Env names this section asks the world for (see report): 'concrete' | 'gradient'
// (+ surfaceMix 0..1) | 'plum' | 'paper'.
(function () {
  const F = FILM, { clamp, lerp, prog, E, spring } = F, C = F.C;
  const FROM = 19.0, TO = 39.671, TAU = Math.PI * 2;
  const T = { cut: 19.2, drop: 21.817, c5: 22.3, c6: 26.728, c6b: 30.45, c7: 33.27, c7b: 35.46, end: 39.27 };
  const VERBS = [24.088, 24.728, 25.608];      // "read" "run" "make" — camera punches
  const SLAMS = [36.708, 37.108];              // "never," "ever"

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, u) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], clamp(u))).toString(16).padStart(2, '0')).join(''); };
  const decay = (dt, k) => dt < 0 ? 0 : Math.exp(-dt / k);

  // ------------------------------------------------------------ frame 4: pieces → one → ring
  const X0 = -60, X1 = 1980, N = 90, NP = 7;
  const lineY = (x, t, amp) => 540 + amp * Math.sin(x / 280 + 0.6 + t * 0.9);
  const lineAmp = t => 16 * (1 - E.inOutSine(prog(20.85, 21.6, t)));
  const OFF = [[-34, 64], [44, -84], [-22, 92], [30, -64], [-44, 74], [22, -92], [-30, 54]];
  const GREY = '#8E9098';
  const gradAt = u => mix(C.purple, C.crimson, u);
  const joinP = (i, t) => E.outCubic(prog(19.4 + 0.06 * i, 20.45 + 0.06 * i, t));

  function pieces(t) {
    const out = [], amp = lineAmp(t);
    const fade = 1 - prog(20.85, 21.1, t);
    if (fade <= 0) return out;
    for (let i = 0; i < NP; i++) {
      const j = joinP(i, t), inset = 0.02 * (1 - j);
      const a = i / NP + inset, b = (i + 1) / NP - inset, M = 16, pts = [];
      for (let m = 0; m <= M; m++) {
        const u = lerp(a, b, m / M), x = lerp(X0, X1, u);
        // each piece drifts home and untwists: tilt around its middle shrinks with j
        const tilt = (1 - j) * (i % 2 ? 0.55 : -0.55), mid = (a + b) / 2, dxm = (u - mid) * (X1 - X0);
        pts.push([x + OFF[i][0] * (1 - j) + dxm * (Math.cos(tilt) - 1), lineY(x, t, amp) + OFF[i][1] * (1 - j) + dxm * Math.sin(tilt), 0]);
      }
      out.push({ pts, w: 18, from: 0, to: 1, colA: mix(GREY, gradAt(a), j), colB: mix(GREY, gradAt(b), j), alpha: fade, smooth: false, phase: i * 0.7 });
    }
    return out;
  }
  function wholeLine(t, alpha) {
    const amp = lineAmp(t), pts = [];
    for (let k = 0; k < N; k++) { const x = lerp(X0, X1, k / (N - 1)); pts.push([x, lineY(x, t, amp), 0]); }
    return { pts, w: 18, from: 0, to: 1, colA: C.purple, colB: C.crimson, alpha, smooth: false };
  }
  const RING_R = 330, CLOSE0 = 21.15;
  // the line coils into the ring across the dip and CLOSES on the drop; the hit springs it tight
  function ring(t) {
    const e = E.inOutCubic(prog(CLOSE0, T.drop, t));
    const spin = (t - CLOSE0) * 0.5, sc = 1 + 0.1 * (1 - spring(t - T.drop, 2.6, 0.45));
    const amp = lineAmp(t), pts = [];
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1), lx = lerp(X0, X1, u), ly = lineY(lx, t, amp);
      const th = Math.PI + u * TAU + spin * e, cx = 960 + Math.cos(th) * RING_R * sc, cy = 540 + Math.sin(th) * RING_R * sc;
      pts.push([lerp(lx, cx, e), lerp(ly, cy, e), 22 * e]);
    }
    const w = prog(T.drop, T.drop + 0.12, t);
    return { pts, w: 20, from: 0, to: 1, colA: mix(C.purple, '#FFFFFF', w), colB: mix(C.crimson, C.paper, w), smooth: false };
  }

  // ------------------------------------------------------------ frame 5: the rope through the code
  const f5y = (x, t) => 880 + 60 * Math.sin(x / 260 + 0.5) + 18 * Math.sin(t * 1.1 + x / 180);
  function f5(t) {
    const pts = [];
    for (let k = 0; k < 100; k++) { const x = lerp(X0, X1, k / 99); pts.push([x, f5y(x, t), 14 + 16 * Math.sin(x / 210)]); }
    return { pts, w: 18, from: 0, to: E.outCubic(prog(T.c5, T.c5 + 0.8, t)), colA: C.lavender, colB: C.crimson, smooth: false };
  }

  // ------------------------------------------------------------ frame 6a: rope behind the ticket
  const f6ay = (x, t) => 800 + 44 * Math.sin(x / 330 + 1) + 10 * Math.sin(t + x / 200);
  function f6a(t) {
    const pts = [];
    for (let k = 0; k < 100; k++) { const x = lerp(X0, X1, k / 99); pts.push([x, f6ay(x, t), 8]); }
    return { pts, w: 18, from: 0, to: E.outCubic(prog(T.c6, T.c6 + 0.75, t)), colA: C.purple, colB: C.crimson, smooth: false };
  }

  // ------------------------------------------------------------ frame 6b: Buyer → The Velvet Cellar
  const BUYER = [330, 760], VC = [1800, 700];
  function f6bPath(t) {
    const pts = [];
    for (let k = 0; k < 90; k++) {
      const u = k / 89, x = lerp(BUYER[0], VC[0], u);
      pts.push([x, lerp(BUYER[1], VC[1], E.inOutSine(u)) + 34 * Math.sin(u * Math.PI * 2.2 + t * 1.0) * Math.sin(u * Math.PI), 10]);
    }
    return F.measure(pts);
  }
  function f6b(t) {
    const p = f6bPath(t);
    return { pts: p.pts, w: 18, from: 0, to: E.outCubic(prog(30.6, 31.3, t)), colA: C.purple, colB: C.crimson, smooth: false };
  }
  const COIN = { go: 31.4, arrive: 32.75 };

  // ------------------------------------------------------------ frame 7: tags on the rope, then exit right
  const f7y = (x, t) => 820 + 38 * Math.sin(x / 300 + t * 0.8) + 12 * Math.sin(x / 120 - t * 0.6);
  const f7slope = (x, t) => (f7y(x + 2, t) - f7y(x - 2, t)) / 4;
  function f7(t) {
    const pts = [];
    for (let k = 0; k < 100; k++) { const x = lerp(X0, X1, k / 99); pts.push([x, f7y(x, t), 12 + 10 * Math.sin(x / 240)]); }
    return { pts, w: 20, from: E.inOutCubic(prog(38.3, 39.25, t)), to: E.outExpo(prog(T.c7, T.c7 + 0.55, t)), colA: C.lavender, colB: C.crimson, smooth: false };
  }

  // ------------------------------------------------------------ env + camera
  function env(t) {
    if (t < T.cut) return {};
    if (t < T.drop) return { surface: 'concrete' };
    if (t < T.c5) return { surface: 'gradient', surfaceMix: prog(T.drop, T.drop + 0.08, t) };
    if (t < T.c6) return { surface: 'plum', keyIntensity: 0.6 };
    if (t < T.c7) return { surface: 'paper' };
    return { surface: 'plum', keyIntensity: 0.6 };
  }
  function camera(t) {
    if (t < T.cut) { const s1 = F.rope.all().find(s => s.id === 's1-origins'); return s1 && s1.camera ? s1.camera(Math.min(t, s1.to - 1e-3)) : { x: 960, y: 540, zoom: 1 }; }
    if (t < T.drop) return { x: 960, y: 540, zoom: 1 + 0.035 * E.inOutSine(prog(FROM, T.drop, t)) };
    if (t < T.c5) {
      const punch = 1 + 0.1 * (1 - E.outCubic(prog(T.drop, T.drop + 0.4, t)));
      return { x: 960, y: 540, zoom: punch * (1 + 4.2 * E.inCubic(prog(22.0, T.c5, t))) };
    }
    if (t < T.c6) {
      let bump = 0; for (const v of VERBS) bump += 0.04 * decay(t - v, 0.2);
      const p = prog(T.c5, T.c6, t);
      return { x: 900 + 140 * E.inOutSine(p), y: 540, zoom: 1.05 - 0.035 * p + bump };
    }
    if (t < T.c6b) return { x: 960, y: 540, zoom: 1 + 0.02 * prog(T.c6, T.c6b, t) };
    if (t < T.c7) {
      return {
        x: lerp(760, 1390, E.inOutCubic(prog(31.15, 32.85, t))), y: 540,
        zoom: lerp(1.14, 1.0, E.inOutCubic(prog(T.c6b, 32.9, t))),
      };
    }
    let bump = 0, sx = 0, sy = 0;
    for (const s of SLAMS) { const dt = t - s; bump += 0.05 * decay(dt, 0.22); if (dt > 0) { sx += 7 * Math.sin(dt * 70) * decay(dt, 0.1); sy += 5 * Math.cos(dt * 83) * decay(dt, 0.1); } }
    return { x: 960 + sx, y: 540 + sy, zoom: 1 + 0.012 * prog(T.c7, T.end, t) + bump };
  }

  function frame(t) {
    if (t < T.cut) return { strands: [], env: {} };   // s1 still owns the hard cut at 19.2
    let strands;
    if (t < CLOSE0) {
      const a = prog(20.85, 21.1, t);
      strands = pieces(t);
      if (a > 0) strands.push(wholeLine(t, a));
    }
    else if (t < T.c5) strands = [ring(t)];
    else if (t < T.c6) strands = [f5(t)];
    else if (t < T.c6b) strands = [f6a(t)];
    else if (t < T.c7) strands = [f6b(t)];
    else strands = [f7(t)];
    return { strands, env: env(t) };
  }

  FILM.rope.section({ id: 's2-different', from: FROM, to: TO, frame, camera });

  window.S2 = { T, VERBS, SLAMS, BUYER, VC, COIN, RING_R, f6bPath, f7y, f7slope, f5y, mix };
})();
