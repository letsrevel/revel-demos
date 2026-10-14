// Rope choreography for s4-in (56.724 - 71.6 s): the build into the climax.
//   56.72  one straight rope y=540, camera {960,540,1,0} (s3 whipped into it)
//   56.72-57.1  camera whips on to the right, settles
//   57.1-58.6   rope sinks below the review card; a small knot (a loop) sits on it
//   62.7-64.4   the knot loosens and runs out
//   64.4-65.4   rope rises back to y=540 under the warm bloom, camera returns to 960
//   65.45  CLIMAX: rope gathers into a closed circle, 24 people spring onto it
//   71.4   exact hand-over to s5: 24 beads on circle (960,540) r=300, bead 0 at top, clockwise
// env (consumed by world.html when it supports it): { surface: 'plum'|'paper', warm: 0..1 }
(function () {
  const F = FILM, E = F.E, C = F.C, prog = F.prog, lerp = F.lerp;
  const FROM = 56.724, TO = 71.6;
  const WHIP_END = 57.1, SINK0 = 57.1, SINK1 = 58.7;
  const LOOSEN0 = 62.7, LOOSEN1 = 64.4;
  const RISE0 = 64.3, RISE1 = 65.4;
  const CLIMAX = 65.45, SEAM = 71.4;
  const N = 24, R = 300, CX = 960, CY = 540;
  const PAL = [C.purple, C.crimson, C.amber, C.peri, C.lavender];
  const KNOT_X = 940, LOW_Y = 962;
  const CAM_X = 1380; // after the whip the world sits 420 px further along; knot lands at screen x 520

  // ---- the straight rope (no knot: a gentle breathing wave, plus a ripple that runs through on "you're in")
  function line(t, yb) {
    const pts = [];
    const breath = E.inOutSine(prog(SINK0, SINK0 + 1.2, t));
    const rp = prog(63.9, 65.4, t), xc = -200 + 2600 * E.inOutSine(rp);
    const ramp = Math.sin(Math.PI * rp);
    for (let x = -200; x <= 2800; x += 40) {
      const d = (x - xc) / 240;
      const ripple = 16 * ramp * Math.exp(-d * d) * Math.sin((x - xc) / 55);
      pts.push([x, yb + 5 * Math.sin(x / 170 + t * 0.9) * breath + ripple, 0]);
    }
    return pts;
  }
  const LINE_N = 120;
  function plainLine(yb) { // 120 evenly spread points, used for the line -> ring morph
    const o = [];
    for (let k = 0; k < LINE_N; k++) o.push([lerp(-200, 2120, k / (LINE_N - 1)), yb, 0]);
    return o;
  }
  function ringAt(rot) { // bead positions
    const o = [];
    for (let i = 0; i < N; i++) { const a = -Math.PI / 2 + i / N * F.TAU + rot; o.push([CX + R * Math.cos(a), CY + R * Math.sin(a)]); }
    return o;
  }
  // ring rotation: a gentle clockwise-settling orbit that arrives at exactly 0 at the seam
  function rotAt(t) { const u = prog(CLIMAX, SEAM, t); return -0.62 * Math.pow(1 - u, 2.2); }

  function yBase(t) {
    const sink = E.outCubic(prog(SINK0, SINK1, t));
    const rise = E.inOutCubic(prog(RISE0, RISE1, t));
    return lerp(540, LOW_Y, sink) * (1 - rise) + 540 * rise;
  }

  F.rope.section({
    id: 's4-in', from: FROM, to: TO,
    camera(t) {
      const whip = E.outQuart(prog(FROM, WHIP_END, t));
      const back = E.inOutCubic(prog(64.5, CLIMAX, t));
      const x = lerp(960, CAM_X, whip) * (1 - back) + 960 * back;
      const u = prog(CLIMAX, SEAM, t);
      const zoom = 1 + 0.075 * Math.sin(Math.PI * Math.pow(u, 0.8));
      const rot = -0.04 * (1 - E.inOutSine(u)) * (t >= CLIMAX ? 1 : 0);
      return { x, y: 540, zoom: t >= CLIMAX ? zoom : 1, rot };
    },
    frame(t) {
      const env = t < CLIMAX
        ? (() => { const w = E.inCubic(prog(62.7, CLIMAX, t)); return { surface: 'plum', surfaceMix: 1, keyWarmth: 0.15 + 0.75 * w, keyIntensity: 1.0 + 0.35 * w, bloom: 0.2 + 0.5 * w }; })()
        : { surface: 'paper', surfaceMix: 1, keyWarmth: lerp(0.6, 0.25, prog(CLIMAX, CLIMAX + 2.5, t)), keyIntensity: 1.0, bloom: lerp(0.8, 0.25, prog(CLIMAX, CLIMAX + 2.0, t)) };
      const strands = [], beads = [];
      if (t < CLIMAX) {
        // before the climax: a straight rope that sinks, carries a loop, loosens it, rises
        const yb = yBase(t);
        const pts = line(t, yb);
        strands.push({ pts, w: 18, from: 0, to: 1, colA: C.purple, colB: C.crimson, smooth: true });
        return { strands, beads, env };
      }
      // climax: ONE continuous curve parametrised by arclength; curvature spreads outward from the
      // middle (which rises to the top of the ring) until each half has turned a half circle, so the
      // two ends arrive at the bottom and slide into each other.
      const g = E.inOutCubic(prog(CLIMAX + 0.25, CLIMAX + 1.2, t));
      const rot = rotAt(t) * g;
      const qp = E.inOutCubic(prog(CLIMAX, CLIMAX + 0.95, t));
      const WID = 0.55, q = qp * (1 + WID);
      const h = lerp(1160, Math.PI * R, E.inOutCubic(qp));
      const NS = 70, ds = h / NS, half = [];
      let x = 0, y = lerp(540, CY - R, E.outCubic(qp)), th = 0;
      half.push([0, y]);
      for (let k = 0; k < NS; k++) {
        const xn = (k + 0.5) / NS, c = E.inOutCubic(F.clamp((q - xn) / WID));
        th += c / R * ds; x += Math.cos(th) * ds; y += Math.sin(th) * ds; half.push([x, y]);
      }
      const rotp = (px, py) => { const dx = px - CX, dy = py - CY, c = Math.cos(rot), s = Math.sin(rot); return [CX + dx * c - dy * s, CY + dx * s + dy * c, 4 * qp]; };
      const pts = [];
      for (let k = NS; k >= 1; k--) pts.push(rotp(CX - half[k][0], half[k][1]));
      for (let k = 0; k <= NS; k++) pts.push(rotp(CX + half[k][0], half[k][1]));
      const done = qp >= 0.999;
      if (done) { pts.pop(); strands.push({ pts: pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1), w: 17, from: 0, to: 1, colA: C.purple, colB: C.crimson, closed: true, smooth: true }); }
      else strands.push({ pts, w: 17, from: 0, to: 1, colA: C.purple, colB: C.crimson, smooth: true });
      const ring = ringAt(rot);
      for (let i = 0; i < N; i++) {
        const t0 = CLIMAX + 0.06 + i * 0.0545; // one bead per tenth of a beat, clockwise from the top
        const k = F.spring(t - t0, 2.3, 0.42);
        const pop = Math.max(0, 1 - (t - t0) / 0.7);
        beads.push({ x: ring[i][0], y: ring[i][1], z: 22, r: 27 * Math.max(0, k), color: PAL[i % PAL.length], alpha: 1, glow: t >= t0 ? pop : 0 });
      }
      return { strands, beads, env };
    },
  });
})();
