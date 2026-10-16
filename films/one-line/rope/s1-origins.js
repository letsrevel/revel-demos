// Rope choreography for s1-origins (0–19.2 s). Pure functions of film time.
//
//  0 – 7     one rope, tight macro -> long pull-back; draws a loop that gathers three people
//  7 – 13.09 the rope travels on through four small loops (book club, rope circle, picnic, gig);
//            the camera follows it station to station
//  13.09 –   light goes cold; fee tags clip onto the gig loop and cut it; the people become table rows
//
// Exposes window.S1 (geometry the DOM layer needs: station centres, tag anchors, table targets).
(function () {
  'use strict';
  const F = FILM, C = F.C, TAU = F.TAU;
  const { clamp, lerp, prog, E, spring } = F;

  // ---- colour helpers
  const hx = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const mix = (a, b, t) => { const A = hx(a), B = hx(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const GREY = '#8E9098';
  const PEOPLE = [C.purple, C.amber, C.peri, C.crimson, C.lavender, C.purple, C.amber, C.peri];

  // ---- timing anchors (film time)
  const EN = F.T.lang !== 'de';
  const sent = id => {                       // sentences of a line: word index range + times
    const ws = F.T.lines.find(l => l.id === id).words, out = []; let a = 0;
    ws.forEach((w, i) => { if (/[.!?]$/.test(w.w) || i === ws.length - 1) { out.push({ from: a, to: i, s: ws[a].s, e: w.e, ls: w.s }); a = i + 1; } });
    return out;
  };
  const SENT = { v02: sent('v02'), v03: sent('v03'), v04: sent('v04') };
  const w2 = F.T.lines.find(l => l.id === 'v02').words, w4 = F.T.lines.find(l => l.id === 'v04').words;
  const TOG = SENT.v02[1].ls;                // last word of v02 ("together." / "zusammenzukommen.")
  // beat times: English values are the hand-tuned ones; German derives from its word times
  const TM = (() => {
    if (EN) return {
      CL: [null, 7.8, 8.9, 10.1, 11.3], LS: [null, 6.96, 7.98, 9.18, 10.38], ARR: [null, 7.35, 8.4, 9.6, 10.8], DEP: [null, 7.95, 9.15, 10.35],
      LE: [null, 7.3, 8.38, 9.58, 10.78], TAIL: 12.3, TAG: [15.12, 15.62, 16.07], FLY0: 17.0, CHIP: 18.125,
      OUT: { v01: 4.0, v02: 6.98, lab: [8.3, 9.42, 10.5, 12.7], plat: 14.83, fees: 16.43 },
    };
    const S3 = SENT.v03, S4 = SENT.v04, CL = [null, S3[0].s + 0.6, S3[1].s + 0.6, S3[2].s + 0.6, S3[3].s + 0.6];
    const LS = [null, SENT.v02[1].e, CL[1] + 0.2, CL[2] + 0.28, CL[3] + 0.28];
    const T1 = w4[SENT.v04[1].from].s + 0.035;
    return {
      CL, LS, LE: CL.map(c => c && c - 0.5), ARR: [null, CL[1] - 0.45, CL[2] - 0.5, CL[3] - 0.5, CL[4] - 0.5],
      DEP: [null, LS[2] - 0.03, LS[3] - 0.03, LS[4] - 0.03], TAIL: CL[4] + 1.0,
      TAG: [T1, T1 + 0.5, w4[SENT.v04[1].to].s + 0.025], FLY0: w4[SENT.v04[2].from + 2].s - 0.005, CHIP: w4[w4.length - 1].s,
      OUT: { v01: 4.0, v02: SENT.v02[1].e + 0.02, lab: [S3[1].s - 0.2, S3[2].s - 0.2, S3[3].s - 0.2, 13.2], plat: S4[1].s - 0.255, fees: S4[2].s - 0.255 },
    };
  })();
  const COLD = 13.09;                        // drums enter
  const OUT0 = 19.0, OUT1 = 19.18;           // everything of ours goes before the hard cut
  const cold = t => E.inOutCubic(prog(COLD, COLD + 0.85, t));

  // ---- geometry
  const SHRINK = 0.14;
  const LOOPS = [
    { cx: 1440, cy: 520, R: 240 },           // the three people
    { cx: 2450, cy: 500, R: 205 },           // book club
    { cx: 3150, cy: 575, R: 205 },           // rope circle
    { cx: 3850, cy: 480, R: 205 },           // picnic
    { cx: 4550, cy: 560, R: 205 },           // gig
  ];
  const loopPts = (l, n = 64) => {
    const out = [];
    for (let k = 0; k <= n; k++) {
      const f = k / n, th = Math.PI / 2 - f * TAU, r = l.R * (1 - SHRINK * f);
      out.push([l.cx + r * Math.cos(th), l.cy + r * Math.sin(th), 8 + 14 * f]);
    }
    return out;
  };
  const entryOf = l => [l.cx, l.cy + l.R];
  const exitOf = l => [l.cx, l.cy + l.R * (1 - SHRINK)];
  function link(p0, p1, n = 30) {
    const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), m = d;
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = i / n, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out.push([h00 * p0[0] + h10 * m + h01 * p1[0] + h11 * m, h00 * p0[1] + h01 * p1[1], lerp(22, 8, u)]);
    }
    return out;
  }

  const approach = F.spline([[-200, 935], [200, 885], [620, 945], [980, 860], [1250, 790], [1440, 760]], 20).map(p => [p[0], p[1], 8]);
  const approachM = F.measure(approach);
  const chunks = [];            // { pts, M, llink, lloop, ltail }
  {
    const lp0 = loopPts(LOOPS[0]).slice(1);
    chunks.push({ pts: [...approach, ...lp0], llink: approachM.L });
  }
  for (let k = 1; k <= 4; k++) {
    const l = LOOPS[k], prevExit = exitOf(LOOPS[k - 1]);
    const lk = link(prevExit, entryOf(l));
    let pts = [...lk, ...loopPts(l)];
    if (k === 4) {
      const ex = exitOf(l);
      const tail = F.spline([ex, [ex[0] + 260, ex[1] + 14], [ex[0] + 640, ex[1] - 24], [ex[0] + 1050, ex[1] + 10]], 14).slice(1).map(p => [p[0], p[1], 8]);
      pts = [...pts, ...tail];
    }
    chunks.push({ pts, llink: F.measure(lk).L });
  }
  chunks.forEach(c => { c.M = F.measure(c.pts); });
  chunks.forEach((c, k) => {
    const lp = F.measure(loopPts(LOOPS[k])).L;
    c.lloop = lp; c.Ltot = c.M.L;
  });
  const totalL = chunks.reduce((a, c) => a + c.Ltot, 0);
  { let acc = 0; chunks.forEach(c => { c.f0 = acc / totalL; acc += c.Ltot; c.f1 = acc / totalL; }); }
  const colAt = f => mix(C.purple, C.crimson, clamp(f));

  // ---- draw schedule: [linkStart, linkEnd, loopEnd, (tailEnd)]
  const SCHED = [null, 1, 2, 3, 4].map((k, i) => k && (k === 4 ? [TM.LS[4], TM.LE[4], TM.CL[4], TM.TAIL] : [TM.LS[k], TM.LE[k], TM.CL[k]]));
  const A0 = 900, TIP0 = A0 + 300;           // macro focus (arc length on the approach) and where the tip starts
  function drawn(k, t) {                     // arc length drawn on chunk k
    const c = chunks[k];
    if (k === 0) {
      const La = approachM.L;
      if (t < 4.65) return lerp(TIP0, La, E.inOutSine(prog(0, 4.65, t)));
      return lerp(La, c.Ltot, E.inOutCubic(prog(4.65, TOG, t)));
    }
    const s = SCHED[k];
    if (t <= s[0]) return 0;
    if (t < s[1]) return c.llink * E.outCubic(prog(s[0], s[1], t));
    if (t < s[2]) return c.llink + c.lloop * E.inOutSine(prog(s[1], s[2], t));
    const base = c.llink + c.lloop;
    if (k === 4 && t >= s[2]) return lerp(base, c.Ltot, E.outCubic(prog(s[2], s[3], t)));
    return c.Ltot;
  }

  // ---- people
  const R_ST = 24;
  const ring = (n, r, a0 = 0) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * TAU + a0) * r, Math.sin(i / n * TAU + a0) * r]);
  const FORM = [
    [[-86, -40], [80, -58], [10, 84]],
    ring(8, 122, -Math.PI / 2 + 0.2),
    ring(7, 124, -0.5),
    [[-120, -62], [-18, -128], [104, -86], [128, 22], [58, 112], [-70, 118], [-132, 30]],
    [[0, -40], [-100, 40], [-36, 40], [36, 40], [100, 40], [-72, 104], [0, 110], [72, 104]],   // performer + crowd
  ];
  const CL = TM.CL;   // loop-close time per station: people and props appear here
  const BORN = [w2[SENT.v02[0].to].s - 0.25, CL[1] - 0.04, CL[2] - 0.04, CL[3] - 0.04, CL[4] - 0.04];
  const BCOL = [
    [PEOPLE[0], PEOPLE[1], PEOPLE[2]],
    PEOPLE, [PEOPLE[1], PEOPLE[2], PEOPLE[0], PEOPLE[3], PEOPLE[4], PEOPLE[5], PEOPLE[2]],
    [PEOPLE[2], PEOPLE[0], PEOPLE[1], PEOPLE[4], PEOPLE[3], PEOPLE[5], PEOPLE[7]],
    [C.crimson, PEOPLE[0], PEOPLE[1], PEOPLE[2], PEOPLE[4], PEOPLE[5], PEOPLE[6], PEOPLE[7]],
  ];

  // ---- camera
  const HOME = { x: 960, y: 540, zoom: 1 };
  const ZS = 1.1, OFF = 290;
  const stPose = (k, z = ZS) => ({ x: LOOPS[k].cx - OFF / z, y: LOOPS[k].cy - 55, zoom: z });
  const P3 = { x: 4772, y: 405, zoom: 0.9 };
  const soft = p => lerp(p, E.inOutSine(p), 0.8);
  const KEYS = [
    { t: 6.9, c: HOME, e: E.inOutCubic },
    { t: TM.ARR[1], c: stPose(1), e: E.inOutCubic },
    { t: TM.DEP[1], c: stPose(1), e: E.inOutCubic },
    { t: TM.ARR[2], c: stPose(2), e: E.inOutCubic },
    { t: TM.DEP[2], c: stPose(2), e: E.inOutCubic },
    { t: TM.ARR[3], c: stPose(3), e: E.inOutCubic },
    { t: TM.DEP[3], c: stPose(3), e: E.inOutCubic },
    { t: TM.ARR[4], c: stPose(4), e: E.inOutSine },
    { t: COLD, c: stPose(4, 1.2), e: E.inOutCubic },
    { t: 14.5, c: P3, e: E.inOutSine },
    { t: 19.2, c: { x: P3.x + 24, y: P3.y - 6, zoom: 0.94 } },
  ];
  const mp = (() => { const p = F.pointAt(approachM, A0); return p; })();
  const TIGHT = { x: mp.x, y: mp.y, zoom: 3.6 };
  function cam(t) {
    if (t < 6.9) {
      const p = prog(0, 6.9, t), e = lerp(1 - Math.pow(1 - p, 2.4), E.inOutCubic(p), 0.45);
      return { x: lerp(TIGHT.x, HOME.x, e), y: lerp(TIGHT.y, HOME.y, e), zoom: Math.exp(lerp(Math.log(TIGHT.zoom), 0, e)), rot: 0 };
    }
    let i = 0;
    while (i < KEYS.length - 2 && t >= KEYS[i + 1].t) i++;
    const a = KEYS[i], b = KEYS[i + 1], e = (a.e || E.inOutSine)(prog(a.t, b.t, t));
    return { x: lerp(a.c.x, b.c.x, e), y: lerp(a.c.y, b.c.y, e), zoom: Math.exp(lerp(Math.log(a.c.zoom), Math.log(b.c.zoom), e)), rot: 0 };
  }
  const toWorld = (t, sx, sy) => { const c = cam(t); return [c.x + (sx - 960) / c.zoom, c.y + (sy - 540) / c.zoom]; };

  // ---- fee tags: anchors on the gig chunk, cut times
  const G = chunks[4];
  const CUT_S = [G.llink - 190, G.llink + 0.5 * G.lloop, G.llink + 0.8 * G.lloop];
  const TAG_T = TM.TAG;
  const CUT_T = TAG_T.map(x => x + 0.14);
  const TAGS = CUT_S.map((s, i) => { const p = F.pointAt(G.M, s); return { x: p.x, y: p.y, ang: p.ang, dir: ['down', 'up', 'left'][i], t: TAG_T[i] }; });
  const cutD = (i, t) => 20 * E.outExpo(prog(CUT_T[i], CUT_T[i] + 0.45, t));

  // ---- the table
  const TBL = { x: 1030, y: 230, w: 760, pad: 28, head: 56, row: 54 };
  const rowCY = j => TBL.y + TBL.pad + TBL.head + j * TBL.row + TBL.row / 2;
  const rowCX = TBL.x - 6;
  const FLY0 = TM.FLY0, FLY_STEP = 0.11, FLY_DUR = 0.55;
  const flyStart = j => FLY0 + j * FLY_STEP;

  const strand = (pts, k, a, b, alpha, c0) => ({
    pts, w: k === 0 ? 20 : 18, from: a, to: b, smooth: true, alpha,
    colA: mix(colAt(chunks[k].f0 + (chunks[k].f1 - chunks[k].f0) * a), GREY, 0.82 * c0),
    colB: mix(colAt(chunks[k].f0 + (chunks[k].f1 - chunks[k].f0) * b), GREY, 0.82 * c0),
  });

  function frame(t) {
    const c0 = cold(t), fa = 1 - prog(OUT0, OUT1, t);
    const strands = [], beads = [];
    for (let k = 0; k < 5; k++) {
      const c = chunks[k], s = drawn(k, t);
      if (s < 2) continue;
      const to = Math.min(1, s / c.Ltot);
      if (k === 4 && t >= CUT_T[0]) {
        // cut into pieces with gaps; pieces recoil along the rope
        const f = CUT_S.map(x => x / c.Ltot), tt = 18 / c.Ltot;
        const dirs = CUT_S.map(x => F.pointAt(c.M, x).ang);
        const ranges = [[0, f[0] - tt], [f[0] + tt, f[1] - tt], [f[1] + tt, f[2] - tt], [f[2] + tt, to]];
        const live = CUT_T.map(x => t >= x);
        const lastLive = live.lastIndexOf(true);
        for (let j = 0; j <= lastLive + 1; j++) {
          let sx = 0, sy = 0;
          for (let i = 0; i < 3; i++) {
            if (!live[i]) continue;
            const d = cutD(i, t) * (i < j ? 1 : -1);
            sx += Math.cos(dirs[i]) * d; sy += Math.sin(dirs[i]) * d;
          }
          const pts = c.pts.map(p => [p[0] + sx, p[1] + sy, p[2]]);
          const a = ranges[j][0], b = j === lastLive + 1 ? to : ranges[j][1];
          if (b > a) strands.push(strand(pts, k, a, b, fa, c0));
          // frayed, splayed ends facing each cut
          const ends = [];
          if (j > 0 && live[j - 1]) ends.push([a, -1, j - 1]);
          if (j <= lastLive) ends.push([b, 1, j]);
          ends.forEach(([fr, sg, ci]) => {
            const q = F.pointAt(c.M, fr * c.Ltot), g = prog(CUT_T[ci], CUT_T[ci] + 0.4, t);
            if (g <= 0) return;
            const ex = q.x + sx, ey = q.y + sy, an = dirs[ci] + (sg < 0 ? Math.PI : 0);
            [[-0.5, 17], [-0.12, 25], [0.28, 19], [0.6, 14]].forEach(([sp, ln], n) => {
              const gg = 0.3 + 0.7 * g, aa = an + sp * gg, L = ln * gg;
              const mx = ex + Math.cos(an + sp * gg * 0.4) * L * 0.5, my = ey + Math.sin(an + sp * gg * 0.4) * L * 0.5;
              strands.push({ pts: [[ex, ey, 14], [mx, my, 14], [ex + Math.cos(aa) * L, ey + Math.sin(aa) * L, 14]], w: 4.5, from: 0, to: 1, smooth: true, alpha: fa,
                colA: mix(colAt(chunks[k].f0 + (chunks[k].f1 - chunks[k].f0) * fr), GREY, 0.82 * c0), colB: mix(colAt(chunks[k].f0 + (chunks[k].f1 - chunks[k].f0) * fr), GREY, 0.82 * c0) });
            });
          });
        }
      } else {
        strands.push(strand(c.pts, k, 0, to, fa, c0));
      }
    }

    // people
    const grey = col => mix(col, GREY, 0.8 * c0);
    for (let k = 0; k < 5; k++) {
      const l = LOOPS[k], offs = FORM[k];
      offs.forEach((o, j) => {
        const born = BORN[k] + j * (k === 0 ? 0.12 : 0.07);
        const sp = spring(t - born, 2.2, 0.45);
        if (sp <= 0.01) return;
        const rr = (k === 0 ? 30 : R_ST) * Math.max(0, sp);
        let x = l.cx + o[0] + F.noise1(t * 0.55 + j * 7, 3) * 4, y = l.cy + o[1] + F.noise1(t * 0.5 + j * 5, 9) * 4;
        let alpha = fa, col = grey(BCOL[k][j]), r2 = rr;
        if (k === 4) {
          // gig crowd -> table rows
          const st = flyStart(j), p = prog(st, st + FLY_DUR, t);
          if (p > 0) {
            const e = E.inOutCubic(p), tw = toWorld(t, rowCX, rowCY(j));
            x = lerp(x, tw[0], e); y = lerp(y, tw[1], e);
            r2 = rr * (1 - 0.62 * e);
            col = mix(col, GREY, e);
            alpha *= 1 - prog(0.82, 1, p);
          }
        }
        if (alpha <= 0.01 || r2 < 0.5) return;
        beads.push({ x, y, z: r2, r: r2, color: col, alpha, glow: 0 });
      });
    }
    const f = { strands, beads };
    if (t >= COLD - 0.02) f.env = { surface: 'concrete', surfaceMix: c0 };
    return f;
  }

  FILM.rope.section({ id: 's1-origins', from: 0, to: 19.2, frame, camera: cam });

  window.S1 = {
    LOOPS, FORM, BORN, BCOL, TAGS, CUT_T, TAG_T, TBL, rowCY, rowCX, flyStart, FLY_DUR,
    cold, mix, GREY, PEOPLE, TOG, COLD, OUT0, OUT1, toWorld, cam,
    stationT: CL, CL, TM, SENT, EN,
  };
})();
