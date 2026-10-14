// Rope choreography for s5-everything (71.4–95.0 s).
//   71.4–71.6  the seam: 24 beads on a circle (960,540) r300, bead 0 at the top, clockwise
//   71.6–72.2  the ring settles into a compact anchor on the left third
//   72.0–82.9  anchor breathes and pulses on every montage beat (six panels, DOM layer)
//   82.9–83.3  held breath (near-stillness, one slow inhale)
//   83.2–83.9  the ring glides to the R's place; its beads melt into the rope
//   83.6–84.3  the closed circle flows into the R outline; the heart draws on
//   84.2–85.4  the R fills with the gradient (DOM layer), the rope dissolves into it
(function () {
  const F = FILM, TAU = F.TAU;
  const N = 24, T0 = 71.4, T1 = 95.0;
  const PC = [F.C.purple, F.C.crimson, F.C.amber, F.C.peri, F.C.lavender]; // same order as s4's ring — the seam must not pop
  const M = F.T.montage, END = F.T.montageEnd;
  const BEAT = F.T.musicBeat || 0.5454;

  // anchor (left third) and ring geometry
  const AX = 340, AY = 540, AR = 168;
  // lockup geometry (must match compositions/s5-everything.html)
  const LS = 0.36, LCX = 960, LTOP = 190;
  // the R in the official Gradient.svg: x same as lockup, y = lockup y + 170
  const R_D = 'M1478.33,1279.67c-12.63-86.17-61.03-167.86-113.34-235.62v-1.72c5.99-4.12,13.65-10.59,18.94-15.96,104.8-106.34,130.42-282.68,43.51-407.91-89.29-128.67-264.9-163.13-411.99-168.79-135.71-5.22-296.99,3.58-393.92,111.19-104,115.47-88.53,257.18-93.97,401.65-4.98,132.17-26.58,313.8,24.24,436.99,51.01,123.68,194.79,194.37,315.81,117.17,92.45-58.98,114.64-172.23,105.83-275.04-2.75-32.05-7.69-63.81-14.42-95.18,17.33,9.51,47.39,17.7,90.18.19-8.47,84.8-5.07,206.06,22.7,272.14,27.28,64.93,115.51,127.73,185.97,132.22,152.23,9.7,240.98-131.21,220.46-271.33Z'
    + 'M1046,964.64c-37.7,31.83-72.22,31.79-109.24-2.16-61.5-56.39-116.52-215.16-84.54-293.94,20-49.26,88.33-53.89,111.99-5.57,18.13,37.04,34.79,111.03,34.79,111.03,11.57-40.35,18.17-116.78,59.17-137.27,45.78-22.89,83.72,5.48,90.19,52.64,11.21,81.79-38.94,221.74-102.36,275.27Z';
  const tf = (x, y) => [LCX + (x - 1000) * LS, LTOP + (y - 448) * LS];

  let outer = null, heart = null, circ = null, cx0 = 0, cy0 = 0, RC = 0;
  const NO = 240, NH = 120;
  function equal(pts, n) {
    const m = F.measure(pts), out = [];
    for (let k = 0; k < n; k++) { const p = F.pointAt(m, m.L * k / n); out.push([p.x, p.y]); }
    return out;
  }
  function init() {
    if (outer) return;
    const parts = R_D.split(/(?=M)/);
    outer = equal(F.svgPathPoints(parts[0], 3, tf), NO);
    heart = equal(F.svgPathPoints(parts[1], 3, tf), NH);
    let sx = 0, sy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of outer) { sx += p[0]; sy += p[1]; minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
    cx0 = (minx + maxx) / 2; cy0 = (miny + maxy) / 2; RC = Math.max(maxx - minx, maxy - miny) * 0.5 * 0.98;
    // circle whose point k pairs with outer[k]: same winding, same start angle
    let area = 0;
    for (let i = 0; i < NO; i++) { const a = outer[i], b = outer[(i + 1) % NO]; area += a[0] * b[1] - b[0] * a[1]; }
    const dir = area > 0 ? 1 : -1;               // y-down screen space: positive area = clockwise on screen
    const a0 = Math.atan2(outer[0][1] - cy0, outer[0][0] - cx0);
    circ = [];
    for (let k = 0; k < NO; k++) { const a = a0 + dir * TAU * k / NO; circ.push([Math.cos(a), Math.sin(a)]); }
  }

  const ringBeads = (cx, cy, r, rot, br, t, alpha) => {
    const out = [];
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + i / N * TAU + rot;
      let pulse = 0;
      for (const m of M) { const d = t - m - i * 0.014; if (d > 0 && d < 1.2) pulse = Math.max(pulse, Math.exp(-d * 5.5) * Math.cos(d * 9)); }
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z: 22, r: br * (1 + 0.55 * pulse), color: PC[i % PC.length], alpha, glow: Math.max(0, pulse) * 0.6 });
    }
    return out;
  };
  const circleStrand = (cx, cy, r, w, alpha) => {
    const pts = [];
    for (let k = 0; k < 96; k++) { const a = -Math.PI / 2 + k / 96 * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]); }
    return { pts, closed: true, smooth: true, w, from: 0, to: 1, colA: F.C.purple, colB: F.C.crimson, alpha };
  };

  F.rope.section({
    id: 's5-everything', from: T0, to: T1,
    frame(t) {
      init();
      // ---- seam + anchor phase (until the glide)
      const GL0 = 83.2, GL1 = 83.9;
      if (t < GL0) {
        // settle: 71.6 → circle r300 centre → anchor
        const m = t < 71.6 ? 0 : Math.min(1.12, F.spring(t - 71.6, 1.5, 0.72));
        const cx = F.lerp(960, AX, m), cy = F.lerp(540, AY, m), r = F.lerp(300, AR, m), br = F.lerp(27, 16, Math.min(1, m));
        const breathe = t < 72.2 ? 1 : 1 + 0.028 * Math.sin((t - 72.2) * TAU / (BEAT * 4));
        // held breath at the drop: one slow inhale
        const hb = F.prog(END - 0.05, END + 0.5, t) * (1 - F.prog(END + 0.5, 83.2, t));
        const inhale = 1 + 0.07 * Math.sin(F.clamp(hb) * Math.PI);
        const rr = r * breathe * inhale;
        const rot = t < 71.6 ? 0 : (t - 71.6) * 0.22 * Math.min(1, (t - 71.6) / 0.6);
        const sw = F.lerp(17, 12, Math.min(1, m)); // s4 hands over a 17 px ring
        return { strands: [circleStrand(cx, cy, rr, sw, 1)], beads: ringBeads(cx, cy, rr, rot, br * inhale, t, 1) };
      }
      // ---- glide + morph into the R
      const g = F.E.inOutQuint(F.prog(GL0, GL1, t));
      const gx = F.lerp(AX, cx0, g), gy = F.lerp(AY, cy0, g), gr = F.lerp(AR * 1.0, RC, g);
      const beadA = 1 - F.E.inCubic(F.prog(83.25, 83.85, t));
      const mo = F.E.inOutCubic(F.prog(83.6, 84.35, t));
      const fade = 1 - F.E.inOutSine(F.prog(84.7, 85.45, t));
      const out = { strands: [], beads: [] };
      if (beadA > 0.01) out.beads = ringBeads(gx, gy, gr, (83.2 - 71.6) * 0.22 * 0, 16 * beadA, t, beadA);
      const pts = circ.map((c, k) => [F.lerp(gx + c[0] * gr, outer[k][0], mo), F.lerp(gy + c[1] * gr, outer[k][1], mo), 0]);
      pts.push(pts[0].slice());
      const w = F.lerp(12, 11, mo);
      if (fade > 0.002) {
        out.strands.push({ pts, closed: false, smooth: true, w, from: 0, to: 1, colA: F.C.purple, colB: F.C.crimson, alpha: fade });
        const hd = F.E.inOutCubic(F.prog(83.95, 84.5, t));
        if (hd > 0.001) out.strands.push({ pts: heart.map(p => [p[0], p[1], 0]).concat([[heart[0][0], heart[0][1], 0]]), closed: false, smooth: true, w: 9, from: 0, to: hd, colA: F.C.crimson, colB: F.C.purple, alpha: fade });
      }
      return out;
    },
  });
})();
