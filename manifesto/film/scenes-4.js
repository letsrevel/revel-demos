// Scenes 5–6: the room, everything else, and the mark.
'use strict';
{
  const M = CUES.music.marks, P = CUES.music.period, O = CUES.music.offset;
  const beat = k => O + k * P;
  const w16 = cue('v16').words;
  const PANELS = CUES.lines.filter(l => l.id.startsWith('v17')).map(l => l.panel);

  function warmBg(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#FBF6FF'); g.addColorStop(1, '#F1E6F6');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    glow(ctx, W / 2, H / 2, 900, C.amber, 0.16);
    glow(ctx, W * 0.1, H * 0.1, 700, C.lavender, 0.2);
  }
  const PC = [C.purple, C.amber, C.peri, C.crimson, C.lavender];
  function dot(ctx, x, y, r, col, a = 1) {
    if (r <= 0.5) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.shadowColor = 'rgba(60,20,80,0.25)'; ctx.shadowBlur = r; ctx.shadowOffsetY = r * 0.35;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.globalAlpha *= a * 0.35; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.34, 0, TAU); ctx.fill(); ctx.restore();
  }

  // ---------------------------------------------------------------- 5a: the room
  const ROOM0 = M.climax, CUTM = PANELS[0];
  const N = 24, RR = 350;
  function heartPt(u) { return [16 * Math.pow(Math.sin(u), 3), -(13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u))]; }
  function room(ctx, t) {
    warmBg(ctx, t);
    const cx = W / 2, cy = H / 2 + 10;
    const m = E.inOutCubic(prog(ROOM0 + 0.42, ROOM0 + 1.1, t));
    const rot = (t - ROOM0) * 0.07;
    const pts = [];
    for (let k = 0; k <= 320; k++) {
      const u = k / 320 * TAU;
      const [hx, hy] = heartPt(u); const hs = 17.5;
      const a = -Math.PI / 2 + u + rot * m;
      pts.push([cx + lerp(hx * hs, Math.cos(a) * RR, m), cy + lerp(hy * hs + 30, Math.sin(a) * RR, m)]);
    }
    const drawn = E.outQuart(prog(ROOM0 - 0.05, ROOM0 + 0.55, t));
    drawRope(ctx, measure(pts), { w: 22, to: drawn, tipAlways: drawn < 1 });
    // warm bloom from the flash
    const bl = 1 - prog(ROOM0, ROOM0 + 0.9, t);
    if (bl > 0) glow(ctx, cx, cy, 900, C.amber, 0.5 * bl);
    // twenty-four people, one per spot, on the ring
    for (let i = 0; i < N; i++) {
      const s = ROOM0 + 1.0 + i * 0.055;
      const r = 26 * spring(t - s, 2.2, 0.45);
      const a = -Math.PI / 2 + i / N * TAU + rot;
      dot(ctx, cx + Math.cos(a) * RR, cy + Math.sin(a) * RR, r, PC[i % PC.length]);
    }
    // words inside the circle
    const a1 = w16.slice(0, 8).map(w => ({ w: w.w, s: w.s })); a1[4].br = true;
    revealWords(ctx, t, a1, cx, cy - 70, { size: 58, weight: 800, color: C.ink, align: 'center', lineHeight: 66, tracking: -1.5 });
    const a2 = w16.slice(8).map(w => ({ w: w.w, s: w.s })); a2[3].br = true;
    revealWords(ctx, t, a2, cx, cy + 96, { size: 58, weight: 800, color: C.purple, align: 'center', lineHeight: 66, tracking: -1.5 });
    // leaving: push in
    const out = E.inCubic(prog(CUTM - 0.5, CUTM, t));
    if (out > 0) { ctx.save(); ctx.globalAlpha = out * 0.3; ctx.fillStyle = C.amber; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  // ---------------------------------------------------------------- 5b: word-synced montage
  const MT = PANELS; // Potlucks, Member pricing, Pay what you can, Waitlists, Check-in, Languages — beat-aligned
  const MONT_END = CUES.music.montageEnd;
  function panelWord(ctx, t, s, str, col, size = 150) {
    const items = str.split(' ').map((w, k) => ({ w, s: s + 0.02 + k * 0.05 }));
    revealWords(ctx, t, items, 140, 560, { size, weight: 800, color: col, tracking: -4, maxWidth: 820, lineHeight: size * 0.98, dur: 0.35 });
  }
  function potluck(ctx, t, s) {
    fillBg(ctx, C.amber); panelWord(ctx, t, s, 'Potlucks.', C.ink);
    const x = 1000, y = 250, w = 760;
    const inn = E.outQuint(prog(s, s + 0.4, t));
    ctx.save(); ctx.translate((1 - inn) * 200, 0);
    card(ctx, x, y, w, 560, { r: 30, shadow: 'rgba(120,60,0,0.3)' });
    text(ctx, 'Who brings what', x + 44, y + 76, { family: FONT.ui, size: 36, weight: 800, color: C.ink });
    const items = [['Sourdough loaf', 'Tobias'], ['Lemon cake', 'Mira'], ['Oat milk', null]];
    items.forEach(([it, who], i) => {
      const yy = y + 150 + i * 120;
      ctx.fillStyle = '#F6F0E6'; rr(ctx, x + 36, yy - 44, w - 72, 96, 20); ctx.fill();
      text(ctx, it, x + 70, yy + 12, { family: FONT.ui, size: 32, weight: 700, color: C.ink });
      if (who) text(ctx, who, x + w - 70, yy + 12, { family: FONT.ui, size: 28, weight: 600, color: '#8A6A2A', align: 'right' });
      else {
        const pr = prog(s + 0.8, s + 0.95, t);
        if (pr < 1) button(ctx, x + w - 290, yy - 28, 230, 64, "I'll bring this", { fill: C.purple, size: 24 });
        else { pill(ctx, x + w - 70, yy - 20, 'You', { size: 26, align: 'right', fill: rgba(C.purple, 0.14), color: C.purple }); }
      }
    });
    ctx.restore();
  }
  function memberPricing(ctx, t, s) {
    fillBg(ctx, C.lavender); panelWord(ctx, t, s, 'Member pricing.', '#fff');
    const tiers = [['General admission', '€18', false], ['Members', '€12', true]];
    tiers.forEach(([n, p, mem], i) => {
      const inn = E.outBack(prog(s + i * 0.1, s + 0.45 + i * 0.1, t));
      const x = 1030 + i * 400, y = 330 - (mem ? 30 * E.outCubic(prog(s + 0.4, s + 0.7, t)) : 0);
      ctx.save(); ctx.translate(x + 170, y + 200); ctx.scale(inn, inn); ctx.translate(-x - 170, -y - 200);
      card(ctx, x, y, 340, 400, { r: 30, shadow: 'rgba(60,20,90,0.3)', fill: mem ? C.purple : '#fff' });
      text(ctx, n, x + 36, y + 70, { family: FONT.ui, size: 30, weight: 700, color: mem ? '#fff' : C.ink });
      text(ctx, p, x + 36, y + 230, { family: FONT.display, size: 130, weight: 800, color: mem ? '#fff' : C.ink, tracking: -4 });
      if (mem) pill(ctx, x + 36, y + 300, 'Members only', { size: 24, fill: 'rgba(255,255,255,0.18)', color: '#fff' });
      ctx.restore();
    });
  }
  function pwyc(ctx, t, s) {
    fillBg(ctx, C.peri); panelWord(ctx, t, s, 'Pay what you can.', C.ink, 140);
    const x = 1040, y = 540, w = 700;
    const v = lerp(5, 14, E.inOutCubic(prog(s + 0.25, s + 1.6, t)));
    const f = (v - 5) / 20;
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; rr(ctx, x, y - 8, w, 16, 8); ctx.fill();
    ctx.fillStyle = C.purple; rr(ctx, x, y - 8, w * f, 16, 8); ctx.fill();
    ctx.save(); ctx.shadowColor = 'rgba(30,30,80,0.3)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w * f, y, 34, 0, TAU); ctx.fill(); ctx.restore();
    text(ctx, '€' + Math.round(v), x + w * f, y - 70, { family: FONT.display, size: 96, weight: 800, color: C.ink, align: 'center' });
    text(ctx, 'min €5', x, y + 80, { family: FONT.ui, size: 28, weight: 700, color: '#2E3A70' });
    text(ctx, 'max €25', x + w, y + 80, { family: FONT.ui, size: 28, weight: 700, color: '#2E3A70', align: 'right' });
  }
  function waitlist(ctx, t, s) {
    fillBg(ctx, C.paper); panelWord(ctx, t, s, 'Waitlists.', C.ink);
    const x = 1000, y = 300, w = 760;
    const inn = E.outQuint(prog(s, s + 0.4, t));
    ctx.save(); ctx.translate((1 - inn) * 200, 0);
    card(ctx, x, y, w, 420, { r: 30 });
    ICON.spark(ctx, x + 80, y + 90, 50, C.amber);
    text(ctx, 'A spot opened up for you', x + 130, y + 104, { family: FONT.ui, size: 38, weight: 800, color: C.ink });
    text(ctx, 'It is yours if you want it. Claim it within 24 hours.', x + 60, y + 180, { family: FONT.ui, size: 27, weight: 500, color: '#5E5270' });
    const tl = 1 - prog(s, s + 1.2, t) * 0.08;
    ctx.fillStyle = '#EFE8F7'; rr(ctx, x + 60, y + 230, w - 120, 14, 7); ctx.fill();
    ctx.fillStyle = C.amber; rr(ctx, x + 60, y + 230, (w - 120) * tl, 14, 7); ctx.fill();
    button(ctx, x + 60, y + 290, 260, 70, 'Claim spot', { size: 27 });
    ctx.restore();
  }
  const QR = (() => { const r = rng(4242), g = []; for (let i = 0; i < 25; i++) { g.push([]); for (let j = 0; j < 25; j++) g[i].push(r() > 0.5); } return g; })();
  function checkin(ctx, t, s) {
    fillBg(ctx, C.ink); panelWord(ctx, t, s, 'Check-in at the door.', C.paper, 130);
    const x = 1130, y = 230, sz = 560, n = 25, c = sz / n;
    card(ctx, x - 40, y - 40, sz + 80, sz + 80, { r: 36, shadow: 'rgba(0,0,0,0.4)' });
    const rev = prog(s + 0.02, s + 0.45, t);
    ctx.fillStyle = C.ink;
    const finder = (i, j) => [[0, 0], [0, 18], [18, 0]].some(([a, b]) => i >= a && i < a + 7 && j >= b && j < b + 7);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const inF = finder(i, j);
      let on = QR[i][j];
      if (inF) { const [a, b] = [[0, 0], [0, 18], [18, 0]].find(([a, b]) => i >= a && i < a + 7 && j >= b && j < b + 7); const di = i - a, dj = j - b; on = di === 0 || di === 6 || dj === 0 || dj === 6 || (di >= 2 && di <= 4 && dj >= 2 && dj <= 4); }
      const d = hash(i * 31 + j * 17) * 0.5 + 0.5;
      if (on && d < rev * 1.3) ctx.fillRect(x + j * c, y + i * c, c + 0.5, c + 0.5);
    }
    const ok = spring(t - (s + 0.55), 2.2, 0.5);
    if (t > s + 0.55) {
      ctx.save(); ctx.translate(x + sz / 2, y + sz / 2); ctx.scale(ok, ok);
      ctx.fillStyle = '#1F9D6A'; ctx.beginPath(); ctx.arc(0, 0, 130, 0, TAU); ctx.fill();
      ICON.check(ctx, 0, 0, 150, '#fff', clamp((t - s - 0.6) * 4));
      ctx.restore();
      text(ctx, 'Checked in', x + sz / 2, y + sz + 110, { family: FONT.ui, size: 36, weight: 800, color: C.paper, align: 'center', alpha: clamp((t - s - 0.6) * 4) });
    }
  }
  function languages(ctx, t, s) {
    fillBg(ctx, C.crimson); panelWord(ctx, t, s, 'In six languages.', '#fff', 140);
    const words = ['Welcome', 'Willkommen', 'Benvenuti', 'Bienvenue', 'Bienvenidos', 'Bem-vindos'];
    const i = Math.min(words.length - 1, Math.floor(Math.max(0, t - s - 0.05) / 0.26));
    const p = spring(t - (s + 0.05 + i * 0.26), 3, 0.6);
    ctx.save(); ctx.translate(1400, 560); ctx.scale(0.85 + 0.15 * p, 0.85 + 0.15 * p);
    text(ctx, words[i], 0, 40, { family: FONT.serif, style: 'italic', size: 150, color: '#fff', align: 'center', alpha: clamp(p * 2) });
    ctx.restore();
  }
  function montage(ctx, t) {
    const fns = [potluck, memberPricing, pwyc, waitlist, checkin, languages];
    let i = 0; while (i < MT.length - 1 && t >= MT[i + 1]) i++;
    fns[i](ctx, t, MT[i]);
  }

  // ---------------------------------------------------------------- 5c: everything else (bento, on the beat)
  const TILES = [
    ['Apple & Google Wallet passes', 'purple'], ['Memberships and tiers', 'white'], ['Invitation links', 'white'], ['Seat maps', 'amber'],
    ['Recurring events', 'white'], ['Updates by email and Telegram', 'peri'], ['Dietary needs, kept private', 'white'], ['Safer-space tools', 'crimson'],
    ['Two-factor login', 'white'], ['Built to WCAG 2.1 AA', 'lavender'], ['Hosted in the EU', 'white'], ['Self-host for about €20 a month', 'ink'],
  ];
  // the grid fills on half-beats from the climax-2 downbeat
  const tileT = i => MONT_END + i * P / 2;
  const IMPLODE0 = 99.62, IMPLODE1 = M.logo - 0.05;
  sfx(ROOM0, 'boom', 0.8); sfx(ROOM0, 'ropeDraw', 0.4, { dur: 0.6 });
  for (let i = 0; i < N; i++) if (i % 2 === 0) sfx(ROOM0 + 1.0 + i * 0.055, 'blip', 0.22, { note: [74, 76, 78, 81, 83, 86][(i / 2) % 6] });
  MT.forEach(m => sfx(m, 'swish', 0.55));
  sfx(MT[0] + 0.87, 'click', 0.5); sfx(MT[4] + 0.55, 'ding', 0.5);
  TILES.forEach((_, i) => sfx(tileT(i), 'blip', 0.4, { note: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88][i] }));
  sfx(IMPLODE0, 'suck', 0.7, { dur: IMPLODE1 - IMPLODE0 });
  sfx(M.logo, 'ropeDraw', 0.5, { dur: 1.5 }); sfx(M.logo + 1.25, 'softpop', 0.5);
  sfx(M.outro, 'boom', 0.45); sfx(M.outro, 'chime', 0.5);
  function bento(ctx, t) {
    fillBg(ctx, C.paper);
    glow(ctx, W / 2, H / 2, 1000, '#FFFFFF', 0.6);
    const cols = 4, rows = 3, gap = 26, mx = 90, my = 90;
    const tw = (W - mx * 2 - gap * (cols - 1)) / cols, th = (H - my * 2 - gap * (rows - 1)) / rows;
    const imp = E.inExpo(prog(IMPLODE0, IMPLODE1, t));
    const drift = E.inOutSine(prog(tileT(0), IMPLODE0, t));
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1.06 - drift * 0.06, 1.06 - drift * 0.06); ctx.translate(-W / 2, -H / 2);
    TILES.forEach(([label, tone], i) => {
      const s = tileT(i); if (t < s) return;
      const p = spring(t - s, 2.4, 0.55);
      const c = i % cols, r = Math.floor(i / cols);
      let x = mx + c * (tw + gap), y = my + r * (th + gap);
      // implode to centre
      x = lerp(x, W / 2 - tw / 2, imp); y = lerp(y, H / 2 - th / 2, imp);
      const fills = { purple: C.purple, white: '#fff', amber: C.amber, peri: C.peri, crimson: C.crimson, lavender: C.lavender, ink: C.ink };
      const dark = ['purple', 'crimson', 'ink'].includes(tone);
      ctx.save(); ctx.translate(x + tw / 2, y + th / 2); const sc = (0.6 + 0.4 * p) * (1 - imp * 0.9); ctx.scale(sc, sc); ctx.globalAlpha = clamp(p * 2) * (1 - imp);
      card(ctx, -tw / 2, -th / 2, tw, th, { r: 30, fill: fills[tone], shadow: 'rgba(60,20,90,0.16)', blur: 40, dy: 14 });
      const lines = [];
      setFont(ctx, { family: FONT.display, size: 44, weight: 800, tracking: -1 });
      let cur = ''; for (const w of label.split(' ')) { const tt = cur ? cur + ' ' + w : w; if (ctx.measureText(tt).width > tw - 70 && cur) { lines.push(cur); cur = w; } else cur = tt; } lines.push(cur);
      lines.forEach((l, k) => text(ctx, l, -tw / 2 + 36, th / 2 - 36 - (lines.length - 1 - k) * 50, { family: FONT.display, size: 44, weight: 800, tracking: -1, color: dark ? '#fff' : C.ink }));
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.9)' : C.purple; ctx.beginPath(); ctx.arc(-tw / 2 + 50, -th / 2 + 50, 13, 0, TAU); ctx.fill();
      ctx.restore();
    });
    ctx.restore();
    const fl = prog(IMPLODE1 - 0.15, IMPLODE1 + 0.05, t);
    if (fl > 0) { ctx.save(); ctx.globalAlpha = fl; ctx.fillStyle = C.paper; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  window.SCENES.push({
    from: M.climax, to: M.logo,
    draw(ctx, t) {
      if (t < CUTM) return room(ctx, t);
      if (t < MONT_END) return montage(ctx, t);
      bento(ctx, t);
    },
  });

  // ---------------------------------------------------------------- 6: the mark
  const L0 = M.logo;
  const w19 = cue('v19').words, w20 = cue('v20').words;
  let outer, heart, wmInk;
  function rGeomScreen(cx, cy, h) {
    const { R_CENTER, R_H } = window.R_GEOM; const s = h / R_H;
    return (x, y) => { const X = 266 + 0.605 * 0.1 * x, Y = 232 + 0.605 * (926 - 0.1 * y); return [cx + (X - R_CENTER[0]) * s, cy + (Y - R_CENTER[1]) * s]; };
  }
  function fillRGradient(ctx, cx, cy, h, a = 1) {
    const { toLogo, R_CENTER, R_H, R_PATH } = window.R_GEOM;
    ctx.save(); ctx.globalAlpha *= a; const base = ctx.getTransform();
    ctx.translate(cx, cy); const s = h / R_H; ctx.scale(s, s); ctx.translate(-R_CENTER[0], -R_CENTER[1]); toLogo(ctx);
    ctx.clip(R_PATH, 'evenodd');
    ctx.setTransform(base);
    const g = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); g.addColorStop(0, C.purple); g.addColorStop(1, C.crimson);
    ctx.fillStyle = g; ctx.fillRect(cx - h, cy - h, h * 2, h * 2);
    ctx.restore();
  }
  function logoLayout(t) {
    const mv = E.inOutCubic(prog(w20[0].s - 0.5, w20[0].s + 0.3, t));
    return { cy: lerp(390, 300, mv), h: lerp(390, 310, mv), tagY: lerp(730, 772, mv), tagSize: lerp(60, 46, mv), mv };
  }
  window.SCENES.push({
    from: L0, to: CUES.duration + 1,
    async init() {
      const L = logoLayout(L0);
      const tf = rGeomScreen(W / 2, L.cy, L.h);
      const raw = svgPathPoints(window.RPATH, 3, null);
      // split subpaths at the jump between them
      let cut = 1; for (let i = 1; i < raw.length; i++) if (Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]) > 200) { cut = i; break; }
      outer = measure(raw.slice(0, cut).map(([x, y]) => tf(x, y)));
      heart = measure(raw.slice(cut).map(([x, y]) => tf(x, y)));
      const img = new Image(); img.src = window.WORDMARK; await img.decode();
      wmInk = document.createElement('canvas'); wmInk.width = img.width; wmInk.height = img.height;
      const g = wmInk.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = C.ink; g.fillRect(0, 0, img.width, img.height);
    },
    draw(ctx, t) {
      fillBg(ctx, C.paper);
      glow(ctx, W / 2, 380, 900, '#FFFFFF', 0.7);
      glow(ctx, W / 2, 1100, 900, C.lavender, 0.18);
      const L = logoLayout(t);
      // the pulse on the downbeat where the music drops out
      const pulse = 1 + 0.045 * Math.sin(clamp((t - M.outro) / 0.5) * Math.PI) * (t > M.outro ? 1 : 0);
      ctx.save(); ctx.translate(W / 2, L.cy); ctx.scale(L.h / 390 * pulse, L.h / 390 * pulse); ctx.translate(-W / 2, -390);
      // rope traces the R, then the heart
      const po = E.inOutCubic(prog(L0, L0 + 1.25, t)), ph = E.inOutCubic(prog(L0 + 0.9, L0 + 1.55, t));
      const fill = E.outCubic(prog(L0 + 1.2, L0 + 1.9, t));
      const ropeA = 1 - E.inCubic(prog(L0 + 1.7, L0 + 2.4, t));
      if (fill > 0) fillRGradient(ctx, W / 2, 390, 390, fill);
      if (ropeA > 0) {
        drawRope(ctx, outer, { w: 14, to: po, alpha: ropeA, shadow: fill < 0.5 });
        drawRope(ctx, heart, { w: 12, to: ph, alpha: ropeA, shadow: fill < 0.5 });
      }
      ctx.restore();
      // tagline, verbatim
      // "open" + "-source" are two tokens from the aligner; join them for display
      const disp = [{ w: 'The', s: w19[0].s }, { w: 'free,', s: w19[1].s }, { w: 'open-source', s: w19[2].s }, { w: 'event', s: w19[4].s }, { w: 'platform', s: w19[5].s },
        { w: 'for', s: w19[6].s, br: true }, { w: 'communities,', s: w19[7].s }, { w: 'clubs', s: w19[8].s }, { w: 'and', s: w19[9].s }, { w: 'independent', s: w19[10].s }, { w: 'venues.', s: w19[11].s }];
      revealWords(ctx, t, disp, W / 2, L.tagY, { size: L.tagSize, weight: 700, color: C.ink, align: 'center', lineHeight: L.tagSize * 1.22, tracking: -1, dur: 0.6 });
      // wordmark
      const wp = E.inOutCubic(prog(w20[0].s, w20[1].s + 0.5, t));
      if (wp > 0 && wmInk) {
        const ww = 560, wh = ww * wmInk.height / wmInk.width, wx = W / 2 - ww / 2, wy = 510;
        ctx.save(); ctx.beginPath(); ctx.rect(wx - 10, wy - 20, (ww + 20) * wp, wh + 40); ctx.clip();
        ctx.globalAlpha = clamp(wp * 3); ctx.drawImage(wmInk, wx, wy, ww, wh); ctx.restore();
      }
      text(ctx, 'letsrevel.io', W / 2, 960, { family: FONT.ui, size: 36, weight: 800, color: C.purple, align: 'center', alpha: E.outCubic(prog(M.outro + 0.5, M.outro + 1.3, t)) });
    },
  });
}
