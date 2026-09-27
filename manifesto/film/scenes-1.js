// Scenes 1–2: where communities come from, and what the platforms do to them.
'use strict';
window.SCENES = window.SCENES || [];
const M = CUES.music.marks;

// ---------------------------------------------------------------------------
// Shared: the "people" — small discs in brand colours.
const PEOPLE_COLS = [C.purple, C.amber, C.peri, C.crimson, C.lavender, C.purple, C.amber, C.peri];
function person(ctx, x, y, r, col, a = 1) {
  if (r <= 0.5 || a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  ctx.shadowColor = 'rgba(40,10,60,0.22)'; ctx.shadowBlur = r * 0.9; ctx.shadowOffsetY = r * 0.35;
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.globalAlpha *= a * 0.35; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.34, 0, TAU); ctx.fill(); ctx.restore();
}

function paperBg(ctx, t, tint = 0) {
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#F7F3FD'); g.addColorStop(1, mix(C.paper, C.paper2, 0.6 + tint));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  glow(ctx, W * 0.18, H * 0.1, 900, '#FFFFFF', 0.55);
  glow(ctx, W * 0.9, H * 0.95, 800, C.lavender, 0.14);
}

// ---------------------------------------------------------------------------
// SCENE 1 — Origins (0 → 17.59)
{
  const CX = 1440, CY = 560, R = 250;
  let approach, loopStart;
  // Formations for the eight people (offsets from centre)
  const F = {
    few: [[-70, -34], [66, -56], [8, 70]],
    book: Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU - Math.PI / 2) * 160, Math.sin(i / 8 * TAU - Math.PI / 2) * 160]),
    rope: Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU + 0.2) * 182, Math.sin(i / 8 * TAU + 0.2) * 182]),
    picnic: [[-88, -70], [10, -92], [92, -48], [-100, 20], [-10, 0], [86, 44], [-50, 92], [48, 108]],
    gig: [[-150, 40], [-75, 40], [0, 40], [75, 40], [150, 40], [-112, 115], [-37, 115], [38, 115]],
  };
  const w3 = cue('v03').words; // A book club. A rope circle. A Sunday picnic. A basement gig.
  const T = { book: w3[0].s, rope: w3[3].s, picnic: w3[6].s, gig: w3[9].s };
  const order = [['few', cue('v02').words[2].s - 0.25], ['book', T.book], ['rope', T.rope], ['picnic', T.picnic], ['gig', T.gig]];
  { const tw2 = cue('v02').words; for (let i = 0; i < 3; i++) sfx(tw2[2].s - 0.25 + i * 0.12, 'blip', 0.5, { note: [62, 66, 69][i] });
    sfx(tw2[8].s + 0.4, 'close', 0.7); sfx(0.4, 'ropeDraw', 0.35, { dur: 4.2 }); sfx(6.9, 'ropeDraw', 0.3, { dur: 2.0 });
    [T.book, T.rope, T.picnic, T.gig].forEach((s, i) => sfx(s, 'swish', 0.4));
    for (let i = 3; i < 8; i++) sfx(T.book + (i - 3) * 0.07, 'blip', 0.35, { note: [71, 74, 76, 78, 81][i - 3] });
    sfx(16.85, 'tension', 0.6, { dur: M.platforms - 16.85 }); }

  function formationPos(i, t) {
    // position of person i at time t: spring from previous formation to current
    let cur = null, prev = null, t0 = 0;
    for (const [name, s] of order) if (t >= s) { prev = cur; cur = name; t0 = s; }
    if (!cur) return null;
    const P = (n) => F[n][i] ?? F[n][i % F[n].length];
    const to = P(cur);
    if (!prev || (cur !== 'few' && prev === 'few' && i >= 3)) {
      // new arrival: comes from the loop edge
      const ang = i * 0.9 + 1.2; const from = prev === 'few' && i >= 3 ? [Math.cos(ang) * R * 1.5, Math.sin(ang) * R * 1.5] : to;
      const p = spring(t - t0, 1.6, 0.62);
      return [lerp(from[0], to[0], p), lerp(from[1], to[1], p), clamp((t - t0) * 4)];
    }
    const from = P(prev), p = spring(t - t0, 1.5, 0.6);
    return [lerp(from[0], to[0], p), lerp(from[1], to[1], p), 1];
  }

  // glyphs at the centre of the circle
  function glyphBook(ctx, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = C.ink; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -30); ctx.bezierCurveTo(-24, -44, -52, -44, -70, -34); ctx.lineTo(-70, 38); ctx.bezierCurveTo(-52, 28, -24, 28, 0, 42); ctx.closePath();
    ctx.moveTo(0, -30); ctx.bezierCurveTo(24, -44, 52, -44, 70, -34); ctx.lineTo(70, 38); ctx.bezierCurveTo(52, 28, 24, 28, 0, 42); ctx.stroke();
    ctx.restore();
  }
  const trefoil = (() => { const p = []; for (let k = 0; k <= 240; k++) { const u = k / 240 * TAU; p.push([(Math.sin(u) + 2 * Math.sin(2 * u)) * 17, (Math.cos(u) - 2 * Math.cos(2 * u)) * 17]); } return measure(p); })();
  function glyphKnot(ctx, a, t) { ctx.save(); drawRope(ctx, trefoil, { w: 11, alpha: a, to: E.outCubic(prog(T.rope, T.rope + 0.8, t)), shadow: false, tip: false }); ctx.restore(); }
  function glyphBlanket(ctx, a) {
    ctx.save(); ctx.globalAlpha *= a; ctx.rotate(-0.12);
    const s = 300, n = 6, c = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? rgba(C.amber, 0.55) : rgba(C.amber, 0.22);
      ctx.fillRect(-s / 2 + i * c, -s / 2 + j * c + 8, c, c);
    }
    ctx.restore();
  }
  function glyphStage(ctx, a) {
    ctx.save(); ctx.globalAlpha *= a;
    const g = ctx.createLinearGradient(0, -210, 0, 60); g.addColorStop(0, rgba(C.amber, 0.5)); g.addColorStop(1, rgba(C.amber, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-14, -215); ctx.lineTo(14, -215); ctx.lineTo(120, -40); ctx.lineTo(-120, -40); ctx.closePath(); ctx.fill();
    ctx.fillStyle = C.ink; rr(ctx, -170, -58, 340, 22, 11); ctx.fill();
    person(ctx, 0, -86, 24, C.crimson);
    ctx.restore();
  }

  window.SCENES.push({
    from: 0, to: M.platforms,
    init() {
      const ctrlA = [[-80, 930], [220, 860], [520, 930], [820, 870], [1000, 720], [CX - R - 6, CY + 40]];
      const aPts = spline(ctrlA, 28);
      const loop = [];
      const a0 = Math.PI + 0.15;
      for (let k = 0; k <= 180; k++) { const u = a0 + k / 180 * (TAU - 0.24); loop.push([CX + Math.cos(u) * R, CY + Math.sin(u) * R]); }
      const raw = measure([...aPts, ...loop]);
      approach = smoothPath(raw, 60);
      loopStart = measure(aPts).L / raw.L;
    },
    draw(ctx, t) {
      paperBg(ctx, t);
      // tension at the end of the scene: the loop is tugged to the right
      const tug = E.inCubic(prog(16.85, M.platforms, t));
      ctx.save();
      if (tug > 0) { ctx.translate(CX, CY); ctx.scale(1 + tug * 0.18, 1 - tug * 0.06); ctx.rotate(tug * 0.05); ctx.translate(-CX + tug * 60, -CY); }
      // rope: approach 0.3→4.6, loop 6.9→8.9 (closing on "together")
      const tTog = cue('v02').words[8].s;
      const drawTo = t < 6.9 ? lerp(0, loopStart, E.inOutCubic(prog(0.3, 4.6, t)))
                             : lerp(loopStart, 1, E.inOutCubic(prog(6.9, tTog + 0.45, t)));
      // gentle breathing wobble
      const pts = approach.pts.map(([x, y], i) => [x + noise1(i * 0.02 + t * 0.35, 3) * 4, y + noise1(i * 0.02 + t * 0.3, 9) * 4]);
      // the loop's closing end tucks UNDER its own start, so the crossing reads cleanly
      const rope = measure(pts), under = loopStart + (1 - loopStart) * 0.88;
      if (drawTo > under) drawRope(ctx, rope, { w: 21, from: under, to: drawTo, phase: 0 });
      drawRope(ctx, rope, { w: 21, to: Math.min(drawTo, under), phase: 0, tip: drawTo <= under });
      // closing pulse
      const pulse = prog(tTog + 0.4, tTog + 1.4, t);
      if (pulse > 0 && pulse < 1) {
        ctx.save(); ctx.globalAlpha = (1 - pulse) * 0.35; ctx.strokeStyle = C.purple; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(CX, CY, R + 20 + pulse * 90, 0, TAU); ctx.stroke(); ctx.restore();
      }
      // centre glyphs (cross-dissolve with a little scale pop)
      ctx.save(); ctx.translate(CX, CY);
      const gl = [['book', glyphBook], ['rope', glyphKnot], ['picnic', glyphBlanket], ['gig', glyphStage]];
      gl.forEach(([k, fn], i) => {
        const s = T[k], e = i < 3 ? T[gl[i + 1][0]] : 99;
        const a = clamp(spring(t - s, 1.8, 0.7)) * (1 - E.inCubic(prog(e - 0.05, e + 0.25, t))) * (1 - tug);
        if (a <= 0.01) return;
        ctx.save(); const sc = 0.7 + 0.3 * spring(t - s, 1.8, 0.55); ctx.scale(sc, sc);
        if (k === 'picnic' || k === 'gig') fn(ctx, a); else fn(ctx, a, t); ctx.restore();
      });
      // people
      for (let i = 0; i < 8; i++) {
        const p = formationPos(i, t); if (!p) continue;
        if (t < T.book && i >= 3) continue;
        const born = i < 3 ? cue('v02').words[2].s - 0.25 + i * 0.12 : T.book + (i - 3) * 0.07;
        const r = 30 * spring(t - born, 2.2, 0.45);
        person(ctx, p[0], p[1], r, PEOPLE_COLS[i], p[2]);
      }
      ctx.restore();
      ctx.restore();

      // ---- type
      const X = 150;
      revealWords(ctx, t, cueWords('v01'), X, 420, { size: 92, weight: 700, maxWidth: 820, lineHeight: 100, out: { s: 4.75, dur: 0.4 }, dur: 0.6 });
      const w2 = cueWords('v02'); w2[3].br = true;
      revealWords(ctx, t, w2, X, 420, { size: 92, weight: 700, maxWidth: 820, lineHeight: 100, out: { s: 9.8, dur: 0.4 }, dur: 0.6 });
      // four communities, one at a time
      const names = [['A book club.', 'Paper Hearts Book Club'], ['A rope circle.', 'Shibari Circle Vienna'], ['A Sunday picnic.', 'Sunday Slow Picnic Club'], ['A basement gig.', 'The Velvet Cellar']];
      const starts = [T.book, T.rope, T.picnic, T.gig], ends = [T.rope, T.picnic, T.gig, 16.55];
      names.forEach(([head, org], i) => {
        const s = starts[i], e = ends[i];
        if (t < s - 0.1 || t > e + 0.5) return;
        const items = head.split(' ').map((w, k) => ({ w, s: s - 0.05 + k * 0.06 }));
        revealWords(ctx, t, items, X, 520, { size: 124, weight: 800, maxWidth: 1100, dur: 0.45, out: { s: e - 0.06, dur: 0.28 }, tracking: -3 });
        const a = prog(s + 0.25, s + 0.6, t) * (1 - prog(e - 0.1, e + 0.15, t));
        text(ctx, org, X + 4, 600, { family: FONT.ui, size: 34, weight: 600, color: C.purple, alpha: a });
      });
    },
  });
}

// ---------------------------------------------------------------------------
// SCENE 2 — The platforms (17.59 → 25.77)
{
  const S = M.platforms, END = M.drop;
  const w4 = cue('v04').words; // Then come the platforms. Fees on every ticket. Your people, turned into data.
  const tFees = w4[4].s, tPeople = w4[8].s;
  const fees = [['Service fee', 2.40], ['Booking fee', 1.50], ['Processing fee', 0.99], ['Handling fee', 2.51]];
  const feeT = fees.map((_, i) => tFees + 0.1 + i * CUES.music.period);
  const tGlitch = 23.28;
  feeT.forEach(ft => sfx(ft, 'stamp', 0.8));
  for (let i = 0; i < 8; i++) sfx(tPeople + 0.15 + i * 0.16, 'datatick', 0.5);
  sfx(tGlitch, 'glitch', 0.8, { dur: 0.5 });
  sfx(cue('v05').words[2].s - 0.1, 'riser', 0.8, { dur: END - (cue('v05').words[2].s - 0.1) });

  function concreteBg(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#D3D4D9'); g.addColorStop(1, '#B6B8BF');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const money = v => '€' + v.toFixed(2);

  function ticket(ctx, t) {
    const out = E.inExpo(prog(tPeople - 0.2, tPeople + 0.35, t));
    const inn = E.outQuint(prog(S, S + 0.5, t));
    const x = 1020 + (1 - inn) * 120 + out * 1100, y = 170;
    ctx.save(); ctx.translate(x, y); ctx.scale(1.28, 1.28); ctx.translate(-x, -y);
    const n = feeT.filter(ft => t >= ft).length;
    const hExtra = feeT.reduce((acc, ft) => acc + 58 * E.outQuint(prog(ft, ft + 0.25, t)), 0);
    const h = 330 + hExtra;
    ctx.save(); ctx.globalAlpha = inn;
    card(ctx, x, y, 640, h, { r: 18, fill: '#EDEEF1', shadow: 'rgba(30,30,40,0.25)' });
    // perforation
    ctx.fillStyle = '#C3C5CC'; for (let k = 0; k < 16; k++) { ctx.beginPath(); ctx.arc(x + 30 + k * 38, y + 150, 5, 0, TAU); ctx.fill(); }
    text(ctx, 'Your event', x + 44, y + 76, { family: FONT.ui, size: 42, weight: 700, color: '#3B3E47' });
    text(ctx, 'General admission', x + 44, y + 120, { family: FONT.ui, size: 28, weight: 500, color: '#7A7D86' });
    text(ctx, 'Ticket', x + 44, y + 214, { family: FONT.ui, size: 32, weight: 500, color: '#3B3E47' });
    text(ctx, money(20), x + 596, y + 214, { family: FONT.ui, size: 32, weight: 600, color: '#3B3E47', align: 'right' });
    let total = 20;
    fees.forEach(([name, v], i) => {
      const p = prog(feeT[i], feeT[i] + 0.22, t); if (p <= 0) return;
      total += v * E.outCubic(p);
      const yy = y + 214 + 58 * (i + 1);
      const st = E.outBack(p, 2.4); // stamp in
      ctx.save(); ctx.translate(x + 320, yy - 10); ctx.scale(1.6 - 0.6 * st, 1.6 - 0.6 * st); ctx.rotate((1 - p) * -0.08); ctx.translate(-(x + 320), -(yy - 10));
      ctx.globalAlpha *= clamp(p * 3);
      text(ctx, '+ ' + name, x + 44, yy, { family: FONT.ui, size: 30, weight: 600, color: C.crimson });
      text(ctx, '+' + money(v), x + 596, yy, { family: FONT.ui, size: 30, weight: 700, color: C.crimson, align: 'right' });
      ctx.restore();
    });
    const ty = y + h - 40;
    ctx.fillStyle = '#C3C5CC'; ctx.fillRect(x + 44, ty - 52, 552, 2);
    text(ctx, 'Total', x + 44, ty, { family: FONT.ui, size: 36, weight: 800, color: '#2A2D35' });
    text(ctx, money(total), x + 596, ty, { family: FONT.ui, size: 36, weight: 800, color: n ? C.crimson : '#2A2D35', align: 'right' });
    ctx.restore(); ctx.restore();
  }

  // people → rows of data
  function harvest(ctx, t) {
    if (t < tPeople - 0.4) return;
    const rows = ['#48213  34  Vienna    rope, books      ▲ 214', '#48214  27  Graz      live music       ▲ 187', '#48215  41  Linz      picnics, wine    ▲ 302',
      '#48216  23  Vienna    photography      ▲ 95', '#48217  38  Salzburg  books, theatre   ▲ 266', '#48218  30  Vienna    rope, dance      ▲ 148',
      '#48219  45  Innsbruck  hiking         ▲ 71', '#48220  29  Vienna    gigs, vinyl      ▲ 233'];
    const tx = 980, ty = 300;
    const tIn = E.outQuint(prog(tPeople - 0.1, tPeople + 0.4, t));
    ctx.save(); ctx.globalAlpha = tIn;
    // table frame
    rr(ctx, tx - 30, ty - 70, 860, 560, 14); ctx.fillStyle = 'rgba(40,42,50,0.9)'; ctx.fill();
    text(ctx, 'id      age city      interests        score', tx, ty - 22, { family: FONT.mono, size: 22, weight: 600, color: '#9EA1AA' });
    ctx.restore();
    rows.forEach((row, i) => {
      const st = tPeople + 0.15 + i * 0.16;
      // the person flies from the left into the table
      const fly = E.inOutCubic(prog(st - 0.5, st, t));
      if (t < st - 0.5) {
        person(ctx, 180 + (i % 4) * 110, 700 + Math.floor(i / 4) * 110, 30, PEOPLE_COLS[i], tIn);
        return;
      }
      if (fly < 1) {
        const x0 = 180 + (i % 4) * 110, y0 = 700 + Math.floor(i / 4) * 110;
        const x1 = tx - 5, y1 = ty + 30 + i * 56;
        const col = mix(PEOPLE_COLS[i], '#8E9098', fly);
        ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 1;
        const r = 30 * (1 - fly * 0.7);
        ctx.fillRect(lerp(x0, x1, fly) - r, lerp(y0, y1, fly) - r, r * 2, r * 2 * (1 - fly * 0.5));
        ctx.restore();
      } else {
        const a = prog(st, st + 0.12, t);
        text(ctx, row, tx, ty + 42 + i * 56, { family: FONT.mono, size: 22, color: '#E3E4E8', alpha: a });
      }
    });
  }

  window.SCENES.push({
    from: S, to: END,
    draw(ctx, t) {
      concreteBg(ctx);
      // glitch-out: horizontal slices, then empty
      const g = prog(tGlitch, tGlitch + 0.5, t);
      const drawContent = () => {
        ticket(ctx, t);
        harvest(ctx, t);
        const X = 150;
        const h1 = w4.slice(0, 4).map((w, i) => ({ w: w.w, s: Math.max(w.s, S - 0.3 + i * 0.05) }));
        revealWords(ctx, t, h1, X, 330, { size: 100, weight: 800, maxWidth: 760, color: '#4A4D56', out: { s: tFees - 0.25, dur: 0.3 }, tracking: -2 });
        revealWords(ctx, t, w4.slice(4, 8).map(w => ({ w: w.w, s: w.s })), X, 330, { size: 100, weight: 800, maxWidth: 760, color: '#4A4D56', out: { s: tPeople - 0.25, dur: 0.3 }, tracking: -2 });
        const h3 = w4.slice(8).map(w => ({ w: w.w, s: w.s })); h3[2].br = true;
        revealWords(ctx, t, h3, X, 250, { size: 100, weight: 800, maxWidth: 760, color: '#4A4D56', tracking: -2 });
      };
      if (g <= 0) drawContent();
      else if (g < 1) {
        // slice displacement
        const r = rng(Math.floor(t * 30) + 5);
        const bands = 14;
        for (let b = 0; b < bands; b++) {
          const y0 = b * H / bands, dx = (r() - 0.5) * 260 * g * (1 + g * 3);
          ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, H / bands + 1); ctx.clip(); ctx.translate(dx, 0);
          ctx.globalAlpha = 1 - E.inCubic(g); drawContent(); ctx.restore();
        }
      }
      // "Revel is different." over empty concrete; a fresh strand arrives beneath it
      const w5 = cueWords('v05');
      revealWords(ctx, t, w5, W / 2, 560, { size: 128, weight: 800, align: 'center', color: C.ink, tracking: -3, dur: 0.5 });
      const strand = measure(spline([[-60, 690], [500, 668], [1000, 700], [1500, 676], [1990, 690]], 30));
      const sp = E.inExpo(prog(cue('v05').words[2].s - 0.1, END - 0.02, t));
      if (sp > 0) drawRope(ctx, strand, { w: 14, to: sp });
      // camera shake on each fee stamp
    },
  });
}
