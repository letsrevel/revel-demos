// Scene 3: the drop — what Revel does differently. Hard cuts on the beat.
'use strict';
{
  const M = CUES.music.marks, P = CUES.music.period, O = CUES.music.offset;
  const beat = k => O + k * P;

  // ---- the R mark as vector paths (outer contour + heart), from logo.svg
  const RD = window.RPATH;
  const HEART_D = 'M3455 7531 ' + RD.slice(RD.indexOf('m178 -1423') + 'm178 -1423'.length);
  const R_PATH = new Path2D(RD), HEART_PATH = new Path2D(HEART_D);
  // logo-space transform (1024 box) and the R's visual centre / heart centre
  function toLogo(ctx) { ctx.translate(266, 232); ctx.scale(0.605, 0.605); ctx.translate(0, 926); ctx.scale(0.1, -0.1); }
  const R_CENTER = [512, 510], R_H = 610, HEART_C = [511, 400];
  // draw the R with height h centred at (cx, cy)
  function drawR(ctx, cx, cy, h, fill) {
    ctx.save(); ctx.translate(cx, cy); const s = h / R_H; ctx.scale(s, s); ctx.translate(-R_CENTER[0], -R_CENTER[1]);
    toLogo(ctx); ctx.fillStyle = fill; ctx.fill(R_PATH, 'evenodd'); ctx.restore();
  }
  window.drawR = drawR; window.R_GEOM = { toLogo, R_CENTER, R_H, HEART_C, R_PATH, HEART_PATH, HEART_D };

  function brandGradient(ctx, a = 1) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, C.purple); g.addColorStop(1, C.crimson);
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.fillRect(-W, -H, W * 3, H * 3); ctx.restore();
  }
  window.brandGradient = brandGradient;

  // ---------------------------------------------------------------- sting
  const T0 = M.drop, ZOOM0 = 26.42, ZOOM1 = 27.02;
  const ringPath = (() => { const p = []; for (let k = 0; k <= 200; k++) { const u = -Math.PI / 2 + k / 200 * (TAU + 0.5); p.push([Math.cos(u) * 330, Math.sin(u) * 330]); } return measure(p); })();

  function sting(ctx, t) {
    const z = 1 + 70 * E.inExpo(prog(ZOOM0, ZOOM1, t));
    const sc = 0.45 + 0.55 * spring(t - T0, 2.3, 0.42);
    const h = 400 * sc;
    const cx = W / 2, cy = H / 2;
    // screen position of the heart centre (zoom origin)
    const hs = h / R_H; const hx = cx + (HEART_C[0] - R_CENTER[0]) * hs, hy = cy + (HEART_C[1] - R_CENTER[1]) * hs;
    ctx.save();
    ctx.translate(hx, hy); ctx.scale(z, z); ctx.translate(-hx, -hy);
    // everything except the heart window
    ctx.save();
    if (t >= ZOOM0) {
      const base = ctx.getTransform();
      ctx.save(); ctx.translate(cx, cy); ctx.scale(hs, hs); ctx.translate(-R_CENTER[0], -R_CENTER[1]); toLogo(ctx);
      const m = base.inverse().multiply(ctx.getTransform()); ctx.restore();
      const hp = new Path2D(); hp.addPath(HEART_PATH, m);
      const clipP = new Path2D(); clipP.rect(-W * 2, -H * 2, W * 5, H * 5); clipP.addPath(hp);
      ctx.clip(clipP, 'evenodd');
    }
    brandGradient(ctx);
    // big soft light behind the mark
    glow(ctx, cx, cy, 700, '#FFFFFF', 0.18);
    // rope ring around the mark
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((t - T0) * 0.6); ctx.scale(sc, sc);
    drawRope(ctx, ringPath, { w: 20, to: E.outQuart(prog(T0, T0 + 0.6, t)), colorAt: u => mix('#FFFFFF', C.paper2, u), shadowColor: 'rgba(60,0,40,0.35)' });
    ctx.restore();
    drawR(ctx, cx, cy, h, '#FFFFFF');
    ctx.restore();
    // shock ring on the downbeat
    const sr = prog(M.dropBar, M.dropBar + 0.6, t);
    if (sr > 0 && sr < 1) { ctx.save(); ctx.globalAlpha = (1 - sr) * 0.7; ctx.strokeStyle = '#fff'; ctx.lineWidth = 6 * (1 - sr) + 1; ctx.beginPath(); ctx.arc(cx, cy, 380 + E.outCubic(sr) * 700, 0, TAU); ctx.stroke(); ctx.restore(); }
    ctx.restore();
    // flash on the hit
    const fl = 1 - prog(T0, T0 + 0.3, t);
    if (fl > 0) { ctx.save(); ctx.globalAlpha = fl * 0.75; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  // ---------------------------------------------------------------- open source
  const CUT1 = beat(56), CUT2 = beat(62), CUT3 = beat(68), CUT4 = beat(71), CUT5 = beat(73);
  sfx(T0, 'boom', 0.9); sfx(ZOOM0, 'whoosh', 0.8, { dur: ZOOM1 - ZOOM0 });
  [CUT1, CUT2].forEach(c => sfx(c, 'swish', 0.5));
  sfx(CUT3, 'slam', 0.9); sfx(CUT4, 'slam', 0.9); sfx(CUT5, 'slam', 0.7);
  { const w8 = cue('v08').words; sfx(w8[3].s + 0.1, 'coinTravel', 0.5, { dur: w8[6].s + 0.1 - w8[3].s }); sfx(w8[6].s + 0.2, 'ding', 0.6); }
  { const w7 = cue('v07').words; sfx(w7[6].s, 'pop', 0.5); }
  function openSource(ctx, t) {
    fillBg(ctx, C.ink);
    // real source code drifting upward
    ctx.save();
    const lh = 34, scroll = (t - 26) * 26;
    setFont(ctx, { family: FONT.mono, size: 22, weight: 400 });
    ctx.fillStyle = rgba(C.lavender, 0.16); ctx.textBaseline = 'alphabetic';
    const code = window.CODE;
    for (let i = 0; i < 40; i++) {
      const y = i * lh - (scroll % lh) + 40; const idx = (i + Math.floor(scroll / lh)) % code.length;
      ctx.fillText(code[idx], 820, y);
    }
    // soft fade on the left so type stays clean
    const g = ctx.createLinearGradient(700, 0, 1100, 0); g.addColorStop(0, C.ink); g.addColorStop(1, rgba(C.ink, 0));
    ctx.fillStyle = g; ctx.fillRect(700, 0, 400, H);
    ctx.restore();
    glow(ctx, 300, 900, 700, C.purple, 0.22);
    const w6 = cue('v06').words;
    const clampS = (s, i) => Math.max(s, ZOOM1 - 0.12 + i * 0.07);
    const head = [{ w: "It's", s: clampS(w6[0].s, 0) }, { w: 'open', s: clampS(w6[1].s, 1) }, { w: 'source.', s: clampS(w6[2].s, 2) }];
    revealWords(ctx, t, head, 140, 400, { size: 200, weight: 800, color: C.paper, tracking: -6, dur: 0.5 });
    // verbs, on the words, in a row
    const verbs = [['Read it.', w6[4].s, C.peri], ['Run it.', w6[6].s, C.lavender], ['Make it better.', w6[9].s, C.amber]];
    let vx = 146;
    verbs.forEach(([v, s, col]) => {
      const items = v.split(' ').map((w, k) => ({ w, s: s - 0.08 + k * 0.05 }));
      revealWords(ctx, t, items, vx, 640, { size: 112, weight: 800, color: col, tracking: -3, dur: 0.45 });
      vx += measureText(ctx, v, { size: 112, weight: 800, tracking: -3 }) + 64;
    });
    // the licence, up from "source." until the cut (≈3 s on screen)
    const ms = Math.max(w6[2].s, ZOOM1) + 0.45, pa = E.outBack(prog(ms, ms + 0.5, t), 2);
    if (pa > 0) {
      ctx.save(); ctx.globalAlpha = clamp(pa * 1.5); ctx.translate(146, 770); ctx.scale(pa, pa);
      var r = pill(ctx, 0, 0, 'MIT License', { size: 50, weight: 800, fill: C.paper, color: C.ink });
      ctx.restore();
      text(ctx, 'Free to use, change and share.', 146 + r.w + 36, 770 + r.h / 2 + 12, { family: FONT.ui, size: 34, weight: 600, color: rgba(C.paper, 0.75), alpha: prog(ms + 0.35, ms + 0.8, t) });
    }
  }

  // ---------------------------------------------------------------- no fee on top
  function noFee(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#F7F3FD'); g.addColorStop(1, C.paper2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    glow(ctx, 1400, 500, 700, '#FFFFFF', 0.7);
    const w7 = cue('v07').words;
    const a = w7.slice(0, 5).map((w, i) => ({ w: w.w, s: Math.max(w.s, CUT1 + 0.05 + i * 0.05) })); a[3].br = true;
    revealWords(ctx, t, a, 140, 330, { size: 108, weight: 800, color: C.ink, lineHeight: 110, tracking: -3 });
    const b = w7.slice(5).map(w => ({ w: w.w, s: w.s })); b[2].br = true;
    revealWords(ctx, t, b, 140, 640, { size: 172, weight: 800, color: C.purple, lineHeight: 160, tracking: -5 });
    // ticket (Revel style)
    const inn = E.outQuint(prog(CUT1, CUT1 + 0.6, t));
    const x = 1060 + (1 - inn) * 160, y = 200, w = 680, h = 640;
    ctx.save(); ctx.globalAlpha = inn;
    card(ctx, x, y, w, h, { r: 32 });
    // header band with the brand gradient
    ctx.save(); rr(ctx, x, y, w, 190, [32, 32, 0, 0]); ctx.clip();
    const hg = ctx.createLinearGradient(x, y, x + w, y + 190); hg.addColorStop(0, C.purple); hg.addColorStop(1, C.crimson);
    ctx.fillStyle = hg; ctx.fillRect(x, y, w, 190);
    // bold stage-light shapes in the band
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x + 470, y); ctx.lineTo(x + 520, y); ctx.lineTo(x + 640, y + 190); ctx.lineTo(x + 360, y + 190); ctx.closePath(); ctx.fill();
    ctx.restore();
    text(ctx, 'Basement Sessions — Live & Loud', x + 44, y + 88, { family: FONT.ui, size: 36, weight: 800, color: '#fff' });
    text(ctx, 'The Velvet Cellar', x + 44, y + 138, { family: FONT.ui, size: 28, weight: 600, color: 'rgba(255,255,255,0.85)' });
    ctx.fillStyle = '#E3DAF2'; for (let k = 0; k < 17; k++) { ctx.beginPath(); ctx.arc(x + 28 + k * 39, y + 218, 5, 0, TAU); ctx.fill(); }
    text(ctx, 'General admission', x + 44, y + 300, { family: FONT.ui, size: 34, weight: 700, color: C.ink });
    text(ctx, '€18.00', x + w - 44, y + 300, { family: FONT.ui, size: 34, weight: 700, color: C.ink, align: 'right' });
    const fa = prog(w7[5].s, w7[5].s + 0.3, t);
    text(ctx, 'Fees', x + 44, y + 380, { family: FONT.ui, size: 32, weight: 500, color: '#6B5F80' });
    text(ctx, '€0.00', x + w - 44, y + 380, { family: FONT.ui, size: 32, weight: 700, color: fa > 0 ? mix('#6B5F80', C.purple, fa) : '#6B5F80', align: 'right' });
    ctx.fillStyle = '#E3DAF2'; ctx.fillRect(x + 44, y + 430, w - 88, 3);
    text(ctx, 'Total', x + 44, y + 510, { family: FONT.ui, size: 44, weight: 800, color: C.ink });
    text(ctx, '€18.00', x + w - 44, y + 510, { family: FONT.ui, size: 44, weight: 800, color: C.ink, align: 'right' });
    const ca = prog(w7[8].s, w7[8].s + 0.5, t);
    if (ca > 0) { ctx.save(); ctx.globalAlpha = clamp(ca * 2); ctx.fillStyle = rgba(C.purple, 0.12); ctx.beginPath(); ctx.arc(x + w - 60, y + 590, 30, 0, TAU); ctx.fill(); ICON.check(ctx, x + w - 60, y + 590, 36, C.purple, E.outCubic(ca)); ctx.restore(); }
    ctx.restore();
    // "No fees added" tag beside the fee row
    const ta = E.outBack(prog(w7[6].s, w7[6].s + 0.45, t), 2);
    if (ta > 0) { ctx.save(); ctx.globalAlpha = clamp(ta * 2); ctx.translate(x + 210, y + 350); ctx.scale(ta, ta);
      pill(ctx, 0, 0, 'No fees added', { size: 28, fill: rgba(C.purple, 0.12), color: C.purple }); ctx.restore(); }
  }

  // ---------------------------------------------------------------- straight to the organizer
  function straight(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#EEF1FF'); g.addColorStop(1, '#DCE3FF');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const w8 = cue('v08').words;
    const items = w8.map((w, i) => ({ w: w.w, s: Math.max(w.s, CUT2 + 0.05 + i * 0.04) })); items[4].br = true;
    revealWords(ctx, t, items, 140, 250, { size: 104, weight: 800, color: C.ink, lineHeight: 108, tracking: -3 });
    const A = [360, 690], B = [1560, 690];
    const path = measure(spline([A, [760, 730], [1160, 730], B], 40));
    const rp = E.inOutCubic(prog(w8[2].s - 0.1, w8[3].s + 0.35, t));
    // buyer
    const ba = spring(t - CUT2 - 0.1, 2, 0.5);
    ctx.save(); ctx.translate(A[0], A[1]); ctx.scale(ba, ba);
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(40,40,120,0.2)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; ctx.beginPath(); ctx.arc(0, 0, 90, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
    ICON.person(ctx, 0, 4, 100, C.peri); ctx.restore();
    text(ctx, 'Buyer', A[0], A[1] + 150, { family: FONT.ui, size: 32, weight: 700, color: '#4B5580', align: 'center', alpha: clamp(ba) });
    // organizer
    const oa = spring(t - CUT2 - 0.25, 2, 0.5);
    ctx.save(); ctx.translate(B[0], B[1]); ctx.scale(oa, oa);
    const og = ctx.createLinearGradient(0, -110, 0, 110); og.addColorStop(0, C.purple); og.addColorStop(1, C.crimson);
    ctx.fillStyle = og; ctx.shadowColor = 'rgba(80,20,80,0.3)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18; ctx.beginPath(); ctx.arc(0, 0, 110, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
    text(ctx, 'VC', 0, 22, { family: FONT.display, size: 70, weight: 800, color: '#fff', align: 'center' });
    ctx.restore();
    text(ctx, 'The Velvet Cellar', B[0], B[1] + 170, { family: FONT.ui, size: 32, weight: 700, color: '#4B5580', align: 'center', alpha: clamp(oa) });
    // rope between them
    ctx.save(); ctx.beginPath(); ctx.rect(A[0] + 88, 0, B[0] - A[0] - 196, H); ctx.clip();
    drawRope(ctx, path, { w: 18, to: rp });
    ctx.restore();
    // the payment travels along the line
    const cp = E.inOutCubic(prog(w8[3].s + 0.1, w8[6].s + 0.2, t));
    if (cp > 0 && cp < 1) {
      const p = pointAt(path, lerp(110, path.L - 130, cp));
      ctx.save(); ctx.translate(p.x, p.y - 4);
      ctx.fillStyle = C.amber; ctx.shadowColor = 'rgba(120,70,0,0.35)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8;
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
      text(ctx, '€', 0, 17, { family: FONT.display, size: 50, weight: 800, color: '#fff', align: 'center' });
      ctx.restore();
    }
    const arr = prog(w8[6].s + 0.2, w8[6].s + 0.9, t);
    if (arr > 0 && arr < 1) { ctx.save(); ctx.globalAlpha = 1 - arr; ctx.strokeStyle = C.amber; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(B[0], B[1], 115 + arr * 90, 0, TAU); ctx.stroke(); ctx.restore(); }
    text(ctx, 'Paid straight into their own Stripe account. Revel never holds it.', 140, 960, { family: FONT.ui, size: 32, weight: 600, color: '#4B5580', alpha: prog(w8[6].s + 0.3, w8[6].s + 0.8, t) });
  }

  // ---------------------------------------------------------------- slams
  function slam(ctx, t, s, str, bg, col, size = 300) {
    fillBg(ctx, bg);
    const p = spring(t - s, 2.2, 0.55);
    ctx.save(); ctx.translate(W / 2, H / 2 + 30); const sc = 1.25 - 0.25 * p; ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(p * 3);
    text(ctx, str, 0, size * 0.34, { size, weight: 800, color: col, align: 'center', tracking: -size * 0.035 });
    ctx.restore();
  }
  function neverSold(ctx, t) {
    fillBg(ctx, C.purple);
    glow(ctx, 1500, 200, 900, C.crimson, 0.35);
    const w9 = cue('v09').words; // No ads. No trackers. And your data is never, ever sold.
    const a = [{ w: 'Your', s: CUT5 + 0.04 }, { w: 'data', s: w9[6].s }, { w: 'is', s: w9[7].s }];
    revealWords(ctx, t, a, 140, 400, { size: 150, weight: 800, color: 'rgba(255,255,255,0.72)', tracking: -4 });
    const b = [{ w: 'never,', s: w9[8].s }, { w: 'ever', s: w9[9].s - 0.05 }, { w: 'sold.', s: w9[10].s }];
    revealWords(ctx, t, b, 140, 600, { size: 200, weight: 800, color: '#fff', tracking: -6 });
    const f = [['Hosted in the EU.', 42.4], ['Export or delete your data any time.', 42.75]];
    f.forEach(([s, st], i) => text(ctx, s, 150, 790 + i * 56, { family: FONT.ui, size: 36, weight: 600, color: C.paper, alpha: prog(st, st + 0.35, t) }));
    // dusk into the next scene
    const d = E.inOutSine(prog(43.2, M.breakdown, t));
    if (d > 0) { ctx.save(); ctx.globalAlpha = d; ctx.fillStyle = C.night; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  window.SCENES.push({
    from: M.drop, to: M.breakdown,
    draw(ctx, t) {
      if (t < ZOOM1) { if (t >= ZOOM0) openSource(ctx, t); sting(ctx, t); return; }
      if (t < CUT1) return openSource(ctx, t);
      if (t < CUT2) return noFee(ctx, t);
      if (t < CUT3) return straight(ctx, t);
      if (t < CUT4) return slam(ctx, t, CUT3, 'No ads.', C.crimson, '#fff', 330);
      if (t < CUT5) return slam(ctx, t, CUT4, 'No trackers.', C.ink, C.paper, 290);
      neverSold(ctx, t);
    },
  });
}
