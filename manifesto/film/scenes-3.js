// Scene 4: the questionnaire gate — "Intro to Shibari — Rope & Trust".
'use strict';
{
  const M = CUES.music.marks, P = CUES.music.period, O = CUES.music.offset;
  const beat = k => O + k * P;
  const S = M.breakdown, END = M.climax;

  // ---- key times
  const wAt = (ws, word) => ws.find(w => w.w.toLowerCase().startsWith(word)).s;
  const w10 = cue('v10').words, w11 = cue('v11').words, w12 = cue('v12').words, w13 = cue('v13').words;
  const w14 = cue('v14').words, w15 = cue('v15').words;
  const T = {
    door0: S + 0.1, door1: 51.2,
    cardIn: w11[5].s,                    // "Vienna"
    push0: 51.95, cut1: beat(96),        // into the application
    q1: wAt(w13, 'experience') - 0.15, q2: wAt(w13, 'consent') - 0.15, q3: wAt(w13, 'why') - 0.2,
    cut2: beat(124),                     // organizer view
    open: 70.35, read0: 70.9, read1: 73.2, approve: beat(136),
    cut3: beat(139),                     // back to the attendee
    unlock: w15[1].s, click: w15[2].s - 0.35, ticket: w15[2].s, cinch: M.climaxPickup,
  };
  T.pick1 = T.q1 + 1.25; T.pick2 = T.q2 + 1.1;
  T.type0 = T.q3 + 0.75; T.type1 = T.type0 + 2.6; T.submit = T.type1 + 0.5;
  window.GATE_T = T;
  sfx(T.door0, 'ropeDraw', 0.3, { dur: T.door1 - T.door0 });
  sfx(T.cardIn, 'softpop', 0.5); sfx(T.push0, 'whoosh', 0.4, { dur: T.cut1 - T.push0 });
  [57.4, T.pick1, T.pick2, T.type0 - 0.1, T.submit, T.open - 0.05, T.click].forEach(c => sfx(c, 'click', 0.7));
  [T.q1, T.q2, T.q3].forEach(c => sfx(c, 'swish', 0.3));
  [T.pick1, T.pick2, T.type1].forEach((c, i) => sfx(c + 0.05, 'ropeTighten', 0.6));
  sfx(T.type0, 'typing', 0.45, { dur: T.type1 - T.type0, chars: 96 });
  sfx(T.submit + 0.4, 'whoosh', 0.35, { dur: 0.5 });
  sfx(T.cut2, 'swish', 0.4); sfx(T.approve, 'click', 0.7); sfx(T.approve + 0.02, 'chime', 0.8);
  sfx(T.cut3, 'swish', 0.4); sfx(T.unlock, 'unlock', 0.7); sfx(T.ticket, 'softpop', 0.8);
  sfx(T.cinch - 1.4, 'riser', 0.5, { dur: END - (T.cinch - 1.4) }); sfx(T.cinch, 'ropeTighten', 1.0);

  // ---------------------------------------------------------------- backgrounds
  function nightBg(ctx, t, warm = 0) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1A0D2B'); g.addColorStop(1, '#2A1238');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    glow(ctx, 1450 + noise1(t * 0.2, 4) * 30, 980, 1000, C.amber, 0.13 + warm * 0.2);
    glow(ctx, 250, 150, 900, C.purple, 0.22);
    // drifting dust in the lamp light
    const r = rng(77);
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const x0 = r() * W, y0 = r() * H, sp = 6 + r() * 14, ph = r() * 100;
      const x = (x0 + noise1(t * 0.1 + ph, i) * 80), y = ((y0 - t * sp) % H + H) % H;
      const a = 0.08 + 0.18 * r() * (0.5 + 0.5 * Math.sin(t * 0.7 + ph));
      ctx.fillStyle = rgba(C.amber, a); ctx.beginPath(); ctx.arc(x, y, 1 + r() * 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- doorway
  const DOOR = { x0: 1130, x1: 1710, cx: 1420, ay: 450, rx: 290, ry: 330, bot: 990 };
  let doorPath;
  function buildDoor() {
    const { x0, x1, cx, ay, rx, ry, bot } = DOOR;
    const pts = spline([[-80, 1045], [400, 1020], [800, 1035], [x0 - 150, bot + 18]], 26);
    const up = []; for (let k = 0; k <= 40; k++) up.push([x0, lerp(bot, ay, k / 40)]);
    const arch = []; for (let k = 0; k <= 80; k++) { const u = Math.PI + k / 80 * Math.PI; arch.push([cx + Math.cos(u) * rx, ay + Math.sin(u) * ry]); }
    const down = []; for (let k = 0; k <= 40; k++) down.push([x1, lerp(ay, bot, k / 40)]);
    const tail = spline([[x1 + 150, bot + 18], [1880, 1040], [2010, 1035]], 20);
    // generous rounding where the floor line turns up into the door and back down
    doorPath = smoothPath(measure([...pts, ...up, ...arch, ...down, ...tail]), 70);
  }
  function doorway(ctx, t, a = 1) {
    const p = E.inOutSine(prog(T.door0, T.door1, t));
    // warm room light inside the arch
    const la = E.inOutSine(prog(46.5, 51, t)) * a;
    if (la > 0) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(DOOR.x0, DOOR.bot); ctx.lineTo(DOOR.x0, DOOR.ay);
      ctx.ellipse(DOOR.cx, DOOR.ay, DOOR.rx, DOOR.ry, 0, Math.PI, 0); ctx.lineTo(DOOR.x1, DOOR.bot); ctx.closePath(); ctx.clip();
      const g = ctx.createLinearGradient(0, 170, 0, 990); g.addColorStop(0, rgba(C.amber, 0.10 * la)); g.addColorStop(1, rgba(C.amber, 0.42 * la));
      ctx.fillStyle = g; ctx.fillRect(DOOR.x0, 100, DOOR.x1 - DOOR.x0, 900);
      ctx.restore();
      glow(ctx, DOOR.cx, 990, 520, C.amber, 0.3 * la);
    }
    drawRope(ctx, doorPath, { w: 20, to: p, alpha: a, colorAt: u => mix(C.crimson, C.lavender, u), shadowColor: 'rgba(0,0,0,0.5)' });
  }

  // ---------------------------------------------------------------- the knot
  // A trefoil that tightens (k: 0 loose → 1 cinched). Tails run off the top and bottom.
  function knotPath(k, cx, cy) {
    const s = lerp(62, 40, k), lobe = lerp(2.25, 2.0, k);
    const P = u => [cx + (Math.sin(u) + lobe * Math.sin(2 * u)) * s, cy + (Math.cos(u) - lobe * Math.cos(2 * u)) * s];
    const Tn = u => { const dx = Math.cos(u) + 2 * lobe * Math.cos(2 * u), dy = -Math.sin(u) + 2 * lobe * Math.sin(2 * u), l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
    const core = [], z = [];
    const u0 = 0.55, u1 = TAU - 0.55;
    for (let i = 0; i <= 260; i++) { const u = lerp(u0, u1, i / 260); core.push(P(u)); z.push(-Math.sin(3 * u)); }
    // tails leave along the knot's own tangent, then sweep gently off-screen
    const a = core[0], ta = Tn(u0), b = core[core.length - 1], tb = Tn(u1), hl = 110;
    const top = spline([[cx - 60 + k * 20, -140], [cx - 130, cy - 300 + k * 40], [a[0] - ta[0] * hl, a[1] - ta[1] * hl], a], 30).slice(0, -1);
    const bot = spline([b, [b[0] + tb[0] * hl, b[1] + tb[1] * hl], [cx + 150, cy + 250 - k * 30], [cx + 60 - k * 20, H + 140]], 30).slice(1);
    const pts = [...top, ...core, ...bot], zz = [...top.map(() => 0), ...z, ...bot.map(() => 0)];
    // light smoothing in index space (keeps the over/under flags aligned with the points)
    const sm = pts.map((p, i) => {
      if (i < 2 || i > pts.length - 3) return p;
      let x = 0, y = 0, W = 0; for (let j = -4; j <= 4; j++) { const q = pts[Math.min(pts.length - 1, Math.max(0, i + j))], w = Math.exp(-j * j / 8); x += q[0] * w; y += q[1] * w; W += w; }
      return [x / W, y / W];
    });
    return { path: measure(sm), z: zz };
  }
  const knotCol = u => mix(C.crimson, C.purple, 0.5 + 0.5 * Math.sin(u * TAU * 0.9 + 0.6));
  function drawKnot(ctx, t, k, cx, cy, o = {}) {
    const { path, z } = knotPath(k, cx, cy);
    const w = o.w ?? 22, step = w * 0.62, ph = t * 0.2 * step;
    const opts = { w, colorAt: knotCol, shadowColor: 'rgba(0,0,0,0.55)', alpha: o.alpha ?? 1, tip: false, phase: t * 0.2 };
    drawRope(ctx, path, opts);
    // redraw the strands that cross over, with the same colour and strand lay as underneath
    let i0 = -1;
    const flush = (i1) => {
      if (i0 < 0 || i1 - i0 < 5) { i0 = -1; return; }
      const sub = measure(path.pts.slice(i0, i1)), S0 = path.cum[i0], S1 = path.cum[i1 - 1];
      drawRope(ctx, sub, { ...opts, colorAt: u => knotCol(lerp(S0, S1, u) / path.L), phase: ((((ph - S0) % step) + step) % step) / step, shadowColor: 'rgba(0,0,0,0.42)' });
      i0 = -1;
    };
    for (let i = 0; i < path.pts.length; i++) { if (z[i] > 0.0) { if (i0 < 0) i0 = i; } else flush(i); }
    flush(path.pts.length);
  }
  const knotK = t => clamp(0.12 + 0.24 * E.outBack(prog(T.pick1, T.pick1 + 0.6, t)) + 0.24 * E.outBack(prog(T.pick2, T.pick2 + 0.6, t))
    + 0.22 * E.outBack(prog(T.type1, T.type1 + 0.6, t)) + 0.18 * E.outBack(prog(T.cinch, T.cinch + 0.45, t), 3), 0, 1.08);

  // ---------------------------------------------------------------- UI bits
  function cursor(ctx, x, y, press = 0) {
    ctx.save(); ctx.translate(x, y); const s = 1 - press * 0.15; ctx.scale(s, s);
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 38); ctx.lineTo(10, 29); ctx.lineTo(17, 45); ctx.lineTo(24, 42); ctx.lineTo(17, 26); ctx.lineTo(30, 26); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }
  function clickRipple(ctx, x, y, t, t0) {
    const p = prog(t0, t0 + 0.5, t); if (p <= 0 || p >= 1) return;
    ctx.save(); ctx.globalAlpha = (1 - p) * 0.5; ctx.strokeStyle = C.purple; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 10 + p * 50, 0, TAU); ctx.stroke(); ctx.restore();
  }
  // cursor path helper: list of [time, x, y]
  function cursorAt(keys, t) {
    if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const p = E.inOutCubic(prog(keys[i - 1][0], keys[i][0], t));
      return [lerp(keys[i - 1][1], keys[i][1], p), lerp(keys[i - 1][2], keys[i][2], p)];
    }
    return [keys[keys.length - 1][1], keys[keys.length - 1][2]];
  }
  function wrapLines(ctx, str, maxW, font) {
    setFont(ctx, font); const words = str.split(' '), lines = []; let cur = '';
    for (const w of words) { const test = cur ? cur + ' ' + w : w; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; }
    if (cur) lines.push(cur); return lines;
  }
  function paragraph(ctx, str, x, y, maxW, font, lh, color, alpha = 1) {
    const lines = wrapLines(ctx, str, maxW, font);
    lines.forEach((l, i) => text(ctx, l, x, y + i * lh, { ...font, color, alpha }));
    return lines.length;
  }

  // Event card (attendee view)
  function eventCard(ctx, t, x, y, sc, state) {
    const w = 440, h = 660;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    card(ctx, -w / 2, -h / 2, w, h, { r: 28, shadow: 'rgba(0,0,0,0.5)', blur: 80, dy: 30 });
    // cover
    ctx.save(); rr(ctx, -w / 2, -h / 2, w, 230, [28, 28, 0, 0]); ctx.clip();
    const cg = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 + 230); cg.addColorStop(0, '#3A1650'); cg.addColorStop(1, '#6A1F4E');
    ctx.fillStyle = cg; ctx.fillRect(-w / 2, -h / 2, w, 230);
    glow(ctx, 60, -h / 2 + 200, 260, C.amber, 0.35);
    ctx.save(); ctx.translate(-20, -h / 2 + 118); ctx.scale(0.75, 0.75); drawKnotSmall(ctx, t); ctx.restore();
    ctx.restore();
    const L = -w / 2 + 32;
    text(ctx, 'Intro to Shibari —', L, -h / 2 + 290, { family: FONT.ui, size: 33, weight: 800, color: C.ink });
    text(ctx, 'Rope & Trust', L, -h / 2 + 330, { family: FONT.ui, size: 33, weight: 800, color: C.ink });
    text(ctx, 'Shibari Circle Vienna', L, -h / 2 + 372, { family: FONT.ui, size: 23, weight: 600, color: C.purple });
    ICON.pin(ctx, L + 12, -h / 2 + 414, 26, '#7A6B8F');
    text(ctx, 'Vienna', L + 34, -h / 2 + 422, { family: FONT.ui, size: 22, weight: 500, color: '#5E5270' });
    ICON.cal(ctx, L + 160, -h / 2 + 414, 24, '#7A6B8F');
    text(ctx, 'Thursday, 7 pm', L + 184, -h / 2 + 422, { family: FONT.ui, size: 22, weight: 500, color: '#5E5270' });
    text(ctx, '24 spots · Free', L, -h / 2 + 462, { family: FONT.ui, size: 22, weight: 600, color: '#5E5270' });
    // state: 'locked' | 'approved' | 'open' | 'ticket'
    const by = h / 2 - 96, bw = w - 64;
    if (state.mode === 'locked' || state.mode === 'approved') {
      pill(ctx, L, by - 58, state.mode === 'approved' ? 'Application approved' : 'Questionnaire required', {
        size: 20, fill: state.mode === 'approved' ? rgba('#1F9D6A', 0.12) : rgba(C.purple, 0.1), color: state.mode === 'approved' ? '#177A52' : C.purple,
      });
    }
    const unlock = state.unlock ?? 0;
    const bf = mix('#CFC4E0', C.purple, unlock);
    rr(ctx, L, by, bw, 64, 32); ctx.fillStyle = bf; ctx.fill();
    if (state.press) { ctx.save(); ctx.globalAlpha = state.press * 0.25; ctx.fillStyle = '#000'; rr(ctx, L, by, bw, 64, 32); ctx.fill(); ctx.restore(); }
    // lock → open lock
    ctx.save(); ctx.translate(L + bw / 2 - 80, by + 32);
    const lc = '#fff'; ctx.strokeStyle = lc; ctx.fillStyle = lc; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    const lift = unlock * 9, swing = unlock * 0.0;
    ctx.beginPath(); ctx.arc(0, -5 - lift, 7, Math.PI, 0); ctx.lineTo(7, -1 - lift + (unlock > 0.5 ? -4 : 0)); ctx.moveTo(-7, -5 - lift); ctx.lineTo(-7, 0); ctx.stroke();
    rr(ctx, -11, -2, 22, 16, 3); ctx.fill(); ctx.restore();
    text(ctx, 'Get ticket', L + bw / 2 + 12, by + 42, { family: FONT.ui, size: 26, weight: 800, color: '#fff', align: 'center' });
    ctx.restore();
  }
  // small decorative knot for the event cover
  const smallKnot = (() => { const p = []; for (let k = 0; k <= 200; k++) { const u = k / 200 * TAU; p.push([(Math.sin(u) + 2 * Math.sin(2 * u)) * 30, (Math.cos(u) - 2 * Math.cos(2 * u)) * 30]); } return measure(p); })();
  function drawKnotSmall(ctx, t) { drawRope(ctx, smallKnot, { w: 13, colorAt: u => mix(C.amber, C.crimson, u), shadowColor: 'rgba(0,0,0,0.45)', tip: false }); }

  // ---------------------------------------------------------------- 4a: the door (S → cut1)
  function partDoor(ctx, t) {
    nightBg(ctx, t);
    const push = E.inCubic(prog(T.push0, T.cut1, t));
    ctx.save();
    if (push > 0) { ctx.translate(DOOR.cx, 560); ctx.scale(1 + push * 0.9, 1 + push * 0.9); ctx.translate(-DOOR.cx, -560); }
    doorway(ctx, t);
    // event card appears in the doorway
    const ca = spring(t - T.cardIn, 1.4, 0.7);
    if (t > T.cardIn) {
      ctx.save(); ctx.globalAlpha = clamp((t - T.cardIn) * 2.5);
      eventCard(ctx, t, DOOR.cx, 600 + (1 - ca) * 60, 0.92 + 0.08 * ca, { mode: 'locked' });
      ctx.restore();
    }
    ctx.restore();
    // words, in a softer voice
    const items10 = w10.map(w => ({ w: w.w, s: w.s }));
    revealWords(ctx, t, items10, 150, 420, { family: FONT.serif, style: 'italic', weight: 400, size: 104, color: C.paper, maxWidth: 900, lineHeight: 104, dur: 0.9, out: { s: T.push0 + 0.1, dur: 0.4 } });
    const items11 = w11.map(w => ({ w: w.w, s: w.s }));
    revealWords(ctx, t, items11, 152, 700, { family: FONT.serif, weight: 400, size: 56, color: C.lavender, maxWidth: 820, lineHeight: 64, dur: 0.9, out: { s: T.push0, dur: 0.4 } });
    const fade = E.inCubic(prog(T.cut1 - 0.2, T.cut1, t));
    if (fade > 0) { ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = '#1A0D2B'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  // ---------------------------------------------------------------- 4b: the application (cut1 → cut2)
  const QX = 700, QW = 1080, QY = 560;
  const ANSWER = "Complete beginner. I'd love to learn to tie with care, and to be someone people feel safe with.";
  function qCard(ctx, t, idx, y, o) {
    // o: {alpha, blur, scale}
    ctx.save(); ctx.globalAlpha = o.alpha;
    if (o.blur > 0.3) ctx.filter = `blur(${o.blur}px)`;
    ctx.translate(QX + QW / 2, y); ctx.scale(o.scale, o.scale); ctx.translate(-QW / 2, 0);
    const pad = 56;
    if (idx === 0) {
      const h = 380; card(ctx, 0, -h / 2, QW, h, { r: 30, shadow: 'rgba(0,0,0,0.5)', blur: 70 });
      text(ctx, 'Workshop Application', pad, -h / 2 + 86, { family: FONT.ui, size: 46, weight: 800, color: C.ink });
      paragraph(ctx, 'We keep these evenings small and balanced. Tell us a little about yourself and we will come back to you within a couple of days.', pad, -h / 2 + 146, QW - pad * 2, { family: FONT.ui, size: 28, weight: 500 }, 40, '#5E5270');
      text(ctx, '3 questions · Reviewed by the organizers', pad, -h / 2 + 290, { family: FONT.ui, size: 24, weight: 600, color: C.purple });
      const bp = prog(57.35, 57.55, t) * (1 - prog(57.55, 57.8, t));
      button(ctx, QW - pad - 220, -h / 2 + 250, 220, 64, 'Start', { fill: mix(C.purple, '#5A1FA0', bp) });
    }
    if (idx === 1) {
      const h = 330; card(ctx, 0, -h / 2, QW, h, { r: 30, shadow: 'rgba(0,0,0,0.5)', blur: 70 });
      text(ctx, 'Question 1 of 3', pad, -h / 2 + 64, { family: FONT.ui, size: 22, weight: 700, color: C.purple });
      text(ctx, 'How much rope experience do you have?', pad, -h / 2 + 124, { family: FONT.ui, size: 42, weight: 800, color: C.ink });
      const opts = ['None yet', 'A little', 'Quite a lot'];
      let ox = pad;
      opts.forEach((op, i) => {
        const sel = i === 0 ? E.outCubic(prog(T.pick1, T.pick1 + 0.2, t)) : 0;
        setFont(ctx, { family: FONT.ui, size: 30, weight: 700 }); const tw = ctx.measureText(op).width;
        const bw = tw + 110, by = -h / 2 + 184;
        rr(ctx, ox, by, bw, 76, 38); ctx.fillStyle = mix('#F4EFFB', C.purple, sel); ctx.fill();
        ctx.strokeStyle = sel ? C.purple : '#DCD2EA'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(ox + 40, by + 38, 13, 0, TAU); ctx.strokeStyle = sel > 0.5 ? '#fff' : '#B7A8CF'; ctx.lineWidth = 3; ctx.stroke();
        if (sel > 0) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox + 40, by + 38, 7 * sel, 0, TAU); ctx.fill(); }
        text(ctx, op, ox + 66, by + 49, { family: FONT.ui, size: 30, weight: 700, color: sel > 0.5 ? '#fff' : C.ink });
        ox += bw + 22;
      });
    }
    if (idx === 2) {
      const h = 330; card(ctx, 0, -h / 2, QW, h, { r: 30, shadow: 'rgba(0,0,0,0.5)', blur: 70 });
      text(ctx, 'Question 2 of 3', pad, -h / 2 + 64, { family: FONT.ui, size: 22, weight: 700, color: C.purple });
      text(ctx, 'Have you read our house rules on', pad, -h / 2 + 124, { family: FONT.ui, size: 42, weight: 800, color: C.ink });
      text(ctx, 'consent and aftercare?', pad, -h / 2 + 176, { family: FONT.ui, size: 42, weight: 800, color: C.ink });
      const sel = E.outCubic(prog(T.pick2, T.pick2 + 0.2, t));
      const by = -h / 2 + 222;
      rr(ctx, pad, by, 46, 46, 10); ctx.fillStyle = mix('#F4EFFB', C.purple, sel); ctx.fill(); ctx.strokeStyle = sel ? C.purple : '#B7A8CF'; ctx.lineWidth = 3; ctx.stroke();
      if (sel > 0) ICON.check(ctx, pad + 23, by + 23, 34, '#fff', sel);
      text(ctx, 'Yes, I have read them', pad + 70, by + 34, { family: FONT.ui, size: 30, weight: 600, color: C.ink });
    }
    if (idx === 3) {
      const h = 470; card(ctx, 0, -h / 2, QW, h, { r: 30, shadow: 'rgba(0,0,0,0.5)', blur: 70 });
      text(ctx, 'Question 3 of 3', pad, -h / 2 + 64, { family: FONT.ui, size: 22, weight: 700, color: C.purple });
      text(ctx, 'Tell us about your experience with rope', pad, -h / 2 + 122, { family: FONT.ui, size: 40, weight: 800, color: C.ink });
      text(ctx, 'and what you hope to learn.', pad, -h / 2 + 172, { family: FONT.ui, size: 40, weight: 800, color: C.ink });
      text(ctx, 'There is no wrong answer — complete beginners are exactly who this evening is for.', pad, -h / 2 + 216, { family: FONT.ui, size: 23, weight: 500, style: 'italic', color: '#7A6B8F' });
      // textarea
      const ty = -h / 2 + 244, th = 150;
      rr(ctx, pad, ty, QW - pad * 2, th, 18); ctx.fillStyle = '#FAF8FD'; ctx.fill(); ctx.strokeStyle = t > T.type0 ? C.purple : '#DCD2EA'; ctx.lineWidth = 2.5; ctx.stroke();
      const n = Math.floor(ANSWER.length * prog(T.type0, T.type1, t));
      const typed = ANSWER.slice(0, n);
      const lines = wrapLines(ctx, typed || ' ', QW - pad * 2 - 56, { family: FONT.ui, size: 29, weight: 500 });
      lines.forEach((l, i) => text(ctx, l, pad + 28, ty + 52 + i * 42, { family: FONT.ui, size: 29, weight: 500, color: C.ink }));
      if (t > T.type0 - 0.3 && t < T.submit && Math.floor(t * 2.2) % 2 === 0 || (t > T.type0 && t < T.type1)) {
        const last = lines[lines.length - 1] || ''; setFont(ctx, { family: FONT.ui, size: 29, weight: 500 });
        const cx = pad + 28 + ctx.measureText(typed ? last : '').width + 3;
        ctx.fillStyle = C.purple; ctx.fillRect(cx, ty + 26 + (lines.length - 1) * 42, 3, 34);
      }
      const bp = prog(T.submit, T.submit + 0.12, t) * (1 - prog(T.submit + 0.12, T.submit + 0.35, t));
      button(ctx, QW - pad - 330, h / 2 - 90, 330, 64, 'Submit application', { fill: mix(C.purple, '#5A1FA0', bp), size: 25 });
    }
    ctx.restore();
  }
  function partApply(ctx, t) {
    nightBg(ctx, t);
    // knot on the left
    const ka = E.outCubic(prog(T.cut1, T.cut1 + 0.8, t));
    drawKnot(ctx, t, knotK(t), 330, 560, { alpha: ka });
    // header
    const ha = E.outCubic(prog(T.cut1 + 0.1, T.cut1 + 0.6, t));
    text(ctx, 'Intro to Shibari — Rope & Trust', QX, 120, { family: FONT.ui, size: 26, weight: 700, color: rgba(C.paper, 0.75), alpha: ha });
    // carousel of cards: each new card arrives from below, the previous rises and recedes
    const arrivals = [T.cut1 + 0.05, T.q1, T.q2, T.q3];
    const pos = i => {
      // how many cards have arrived after card i
      let y = 0, sc = 1, a = 1, b = 0;
      const inP = E.outQuint(prog(arrivals[i], arrivals[i] + 0.7, t));
      y += (1 - inP) * 700; a *= clamp(inP * 1.6);
      for (let j = i + 1; j < arrivals.length; j++) {
        const q = E.inOutCubic(prog(arrivals[j], arrivals[j] + 0.7, t));
        y -= q * (j === i + 1 ? 470 : 200); sc -= q * 0.08; a -= q * (j === i + 1 ? 0.62 : 0.38); b += q * 5;
      }
      return { y: QY + y, scale: sc, alpha: clamp(a), blur: b };
    };
    // submission: last card lifts off
    const sub = E.inCubic(prog(T.submit + 0.3, T.cut2, t));
    for (let i = 0; i < 4; i++) {
      if (t < arrivals[i]) continue;
      const p = pos(i); if (p.alpha <= 0.01) continue;
      if (i === 3 && sub > 0) { p.y -= sub * 900; p.alpha *= 1 - sub; }
      qCard(ctx, t, i, p.y, p);
    }
    // cursor
    const keys = [[T.cut1, 1500, 1000], [57.0, QX + QW - 170, QY + 92], [57.6, QX + QW - 170, QY + 100],
      [T.q1 + 0.4, QX + 400, QY + 180], [T.pick1 - 0.05, QX + 150, QY + 58], [T.q2 + 0.3, QX + 300, QY + 200], [T.pick2 - 0.05, QX + 80, QY + 80],
      [T.q3 + 0.4, QX + 700, QY + 260], [T.type0 - 0.1, QX + 500, QY + 60], [T.type1, QX + 520, QY + 60], [T.submit - 0.05, QX + QW - 220, QY + 180]];
    const [cx, cy] = cursorAt(keys, t);
    const clicks = [57.4, T.pick1, T.pick2, T.type0 - 0.1, T.submit];
    let press = 0; for (const c of clicks) press = Math.max(press, prog(c - 0.06, c, t) * (1 - prog(c + 0.05, c + 0.2, t)));
    for (const c of clicks) clickRipple(ctx, cx, cy, t, c);
    if (t < T.submit + 0.4) cursor(ctx, cx, cy, press);
    // submitted
    const sa = E.outBack(prog(T.submit + 0.5, T.submit + 0.9, t));
    if (sa > 0) { ctx.save(); ctx.globalAlpha = clamp(sa); ctx.translate(QX + QW / 2, QY); ctx.scale(sa, sa);
      pill(ctx, 0, -30, 'Submitted — under review', { size: 30, align: 'center', fill: rgba(C.paper, 0.14), color: C.paper, stroke: rgba(C.paper, 0.3) }); ctx.restore(); }
  }

  // ---------------------------------------------------------------- 4c: the organizer reviews (cut2 → cut3)
  const people = [
    ['NB', 'Noa Beckmann', 'just now', C.crimson],
    ['MK', 'Mira K.', '2 hours ago', C.purple],
    ['TR', 'Tobias R.', 'yesterday', C.peri],
    ['YS', 'Yuki S.', 'yesterday', C.amber],
  ];
  function avatar(ctx, x, y, r, ini, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    text(ctx, ini, x, y + r * 0.36, { family: FONT.ui, size: r * 0.9, weight: 800, color: '#fff', align: 'center' });
  }
  function partReview(ctx, t) {
    nightBg(ctx, t);
    const PX = 700, PW = 1080;
    const inn = E.outQuint(prog(T.cut2, T.cut2 + 0.6, t));
    // left captions (human review, no automation)
    const w = w14; // Then a real person reads every answer, and makes the call.
    revealWords(ctx, t, [{ w: 'A', s: w[1].s }, { w: 'real', s: w[2].s }, { w: 'person', s: w[3].s, br: true }, { w: 'reads', s: w[4].s }, { w: 'every', s: w[5].s, br: true }, { w: 'answer.', s: w[6].s }],
      110, 330, { family: FONT.serif, style: 'italic', size: 80, color: C.paper, lineHeight: 86, maxWidth: 560, dur: 0.8 });
    revealWords(ctx, t, [{ w: 'And', s: w[7].s }, { w: 'makes', s: w[8].s }, { w: 'the', s: w[9].s, br: true }, { w: 'call.', s: w[10].s }],
      110, 690, { family: FONT.serif, style: 'italic', size: 80, color: C.amber, lineHeight: 86, maxWidth: 560, dur: 0.8 });
    // panel
    ctx.save(); ctx.translate(0, (1 - inn) * 80); ctx.globalAlpha = inn;
    const open = E.inOutCubic(prog(T.open, T.open + 0.6, t));
    const PH = lerp(560, 800, open), PY = lerp(260, 140, open);
    card(ctx, PX, PY, PW, PH, { r: 30, shadow: 'rgba(0,0,0,0.55)', blur: 80 });
    text(ctx, 'Submissions', PX + 50, PY + 78, { family: FONT.ui, size: 40, weight: 800, color: C.ink });
    text(ctx, 'Workshop Application · Intro to Shibari — Rope & Trust', PX + 50, PY + 120, { family: FONT.ui, size: 24, weight: 600, color: '#7A6B8F' });
    // list (collapses as Noa's submission opens)
    people.forEach(([ini, name, when, col], i) => {
      const ry = PY + 160 + i * 96 + (i > 0 ? open * 700 : 0);
      const ra = i > 0 ? 1 - open : 1;
      if (ra <= 0.02 || ry > PY + PH - 60) return;
      ctx.save(); ctx.globalAlpha *= ra;
      if (i > 0) { ctx.fillStyle = '#EFE8F7'; ctx.fillRect(PX + 50, ry - 8, PW - 100, 2); }
      avatar(ctx, PX + 90, ry + 40, 30, ini, col);
      text(ctx, name, PX + 140, ry + 38, { family: FONT.ui, size: 30, weight: 700, color: C.ink });
      text(ctx, when, PX + 140, ry + 70, { family: FONT.ui, size: 22, weight: 500, color: '#8A7C9F' });
      // status
      const approved = i === 0 && t > T.approve;
      const st = approved ? 'Approved' : 'Pending review';
      pill(ctx, PX + PW - 50, ry + 14, st, { size: 22, align: 'right', fill: approved ? rgba('#1F9D6A', 0.14) : rgba(C.amber, 0.22), color: approved ? '#177A52' : '#8A5A00' });
      ctx.restore();
    });
    // Noa's answers, opened
    if (open > 0) {
      ctx.save(); ctx.globalAlpha *= open;
      const L = PX + 50, top = PY + 270;
      const rows = [['How much rope experience do you have?', 'None yet'], ['Have you read our house rules on consent and aftercare?', 'Yes, I have read them']];
      rows.forEach(([q, a], i) => {
        text(ctx, q, L, top + i * 92, { family: FONT.ui, size: 24, weight: 600, color: '#7A6B8F' });
        text(ctx, a, L, top + i * 92 + 38, { family: FONT.ui, size: 30, weight: 700, color: C.ink });
      });
      text(ctx, 'Tell us about your experience with rope and what you hope to learn.', L, top + 190, { family: FONT.ui, size: 24, weight: 600, color: '#7A6B8F' });
      const lines = wrapLines(ctx, ANSWER, PW - 120, { family: FONT.ui, size: 32, weight: 600 });
      const rp = prog(T.read0, T.read1, t);
      lines.forEach((l, i) => {
        const ly = top + 238 + i * 48;
        setFont(ctx, { family: FONT.ui, size: 32, weight: 600 }); const lw = ctx.measureText(l).width;
        const seg = clamp(rp * lines.length - i);
        if (seg > 0) { ctx.fillStyle = rgba(C.amber, 0.35); ctx.fillRect(L - 4, ly - 30, lw * E.inOutSine(seg) + 8, 40); }
        text(ctx, l, L, ly, { family: FONT.ui, size: 32, weight: 600, color: C.ink });
      });
      // reviewer
      const ra = E.outBack(prog(T.open + 0.3, T.open + 0.7, t));
      if (ra > 0) { ctx.save(); ctx.globalAlpha *= clamp(ra); avatar(ctx, L + 24, PY + PH - 72, 26, 'R', C.purple);
        text(ctx, 'Ren is reviewing', L + 64, PY + PH - 62, { family: FONT.ui, size: 26, weight: 700, color: C.ink }); ctx.restore(); }
      // buttons
      const ap = prog(T.approve - 0.08, T.approve, t) * (1 - prog(T.approve + 0.05, T.approve + 0.25, t));
      button(ctx, PX + PW - 260 - 50, PY + PH - 110, 260, 70, t > T.approve ? 'Approved' : 'Approve', { fill: t > T.approve ? '#1F9D6A' : mix(C.purple, '#5A1FA0', ap), size: 28 });
      rr(ctx, PX + PW - 260 - 50 - 200, PY + PH - 110, 180, 70, 35); ctx.strokeStyle = '#DCD2EA'; ctx.lineWidth = 2.5; ctx.stroke();
      text(ctx, 'Decline', PX + PW - 50 - 260 - 110, PY + PH - 64, { family: FONT.ui, size: 28, weight: 700, color: '#6B5F80', align: 'center' });
    }
    ctx.restore();
    // cursor
    const keys = [[T.cut2, 1500, 1020], [T.open - 0.35, PX + 300, 300], [T.open - 0.05, PX + 300, 300], [T.read1 - 0.2, 1180, 840], [T.approve - 0.1, PX + PW - 180, 140 + 800 - 75]];
    const [cx, cy] = cursorAt(keys, t);
    let press = 0; for (const c of [T.open - 0.05, T.approve]) press = Math.max(press, prog(c - 0.06, c, t) * (1 - prog(c + 0.05, c + 0.2, t)));
    clickRipple(ctx, cx, cy, t, T.open - 0.05); clickRipple(ctx, cx, cy, t, T.approve);
    cursor(ctx, cx, cy, press);
    // approval glow
    const g = prog(T.approve, T.approve + 1.2, t);
    if (g > 0 && g < 1) glow(ctx, PX + PW - 180, 870, 500, C.amber, 0.35 * (1 - g));
  }

  // ---------------------------------------------------------------- 4d: you're in (cut3 → END)
  function partIn(ctx, t) {
    const warm = E.inCubic(prog(T.cinch - 0.4, END, t));
    nightBg(ctx, t, warm);
    drawKnot(ctx, t, knotK(t), 330, 560);
    // warm glow from the knot on the cinch
    const kg = prog(T.cinch, END, t);
    if (kg > 0) glow(ctx, 330, 560, 300 + 700 * E.inCubic(kg), C.amber, 0.25 + 0.5 * kg);
    const mode = t > T.unlock ? 'approved' : 'locked';
    const unlock = E.inOutCubic(prog(T.unlock, T.unlock + 0.4, t));
    const press = prog(T.click - 0.06, T.click, t) * (1 - prog(T.click + 0.05, T.click + 0.25, t));
    const ca = spring(t - T.cut3, 1.6, 0.7);
    const cardOut = E.inCubic(prog(T.ticket + 0.1, T.ticket + 0.5, t));
    ctx.save(); ctx.globalAlpha = 1 - cardOut * 0.85;
    eventCard(ctx, t, 1250, 560 + (1 - ca) * 40, 1.15 - cardOut * 0.08, { mode, unlock, press });
    ctx.restore();
    // ticket pops forward
    const tp = spring(t - T.ticket, 2.2, 0.5);
    if (t > T.ticket) {
      ctx.save(); ctx.translate(1250, 560); ctx.rotate((1 - tp) * -0.12); ctx.scale(0.6 + 0.4 * tp, 0.6 + 0.4 * tp); ctx.globalAlpha = clamp(tp * 2);
      const tw = 620, th = 300;
      card(ctx, -tw / 2, -th / 2, tw, th, { r: 26, shadow: 'rgba(0,0,0,0.55)', blur: 80 });
      ctx.save(); rr(ctx, -tw / 2, -th / 2, 170, th, [26, 0, 0, 26]); ctx.clip();
      const tg = ctx.createLinearGradient(0, -th / 2, 0, th / 2); tg.addColorStop(0, C.purple); tg.addColorStop(1, C.crimson); ctx.fillStyle = tg; ctx.fillRect(-tw / 2, -th / 2, 170, th);
      ctx.restore();
      ICON.heart(ctx, -tw / 2 + 85, 0, 80, '#fff');
      text(ctx, 'Workshop Spot', -tw / 2 + 210, -50, { family: FONT.ui, size: 40, weight: 800, color: C.ink });
      text(ctx, 'Intro to Shibari — Rope & Trust', -tw / 2 + 210, -6, { family: FONT.ui, size: 24, weight: 600, color: '#6B5F80' });
      pill(ctx, -tw / 2 + 210, 36, "You're going", { size: 26, fill: rgba('#1F9D6A', 0.14), color: '#177A52' });
      ctx.restore();
    }
    // cursor
    const keys = [[T.cut3, 1700, 1000], [T.click - 0.1, 1260, 560 + 1.15 * 250]];
    const [cx, cy] = cursorAt(keys, t);
    if (t < T.ticket + 0.2) { clickRipple(ctx, cx, cy, t, T.click); cursor(ctx, cx, cy, press); }
    // caption
    revealWords(ctx, t, [{ w: 'And', s: w15[0].s }, { w: 'then,', s: w15[1].s }, { w: "you're", s: w15[2].s, br: true }, { w: 'in.', s: w15[3].s }], 560, 250,
      { family: FONT.serif, style: 'italic', size: 84, color: C.paper, lineHeight: 88, dur: 0.6, align: 'right' });
    // flash into the climax
    const fl = E.inExpo(prog(END - 0.3, END, t));
    if (fl > 0) { ctx.save(); ctx.globalAlpha = fl; ctx.fillStyle = '#FFF4DE'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  window.SCENES.push({
    from: S, to: END,
    init() { buildDoor(); },
    draw(ctx, t) {
      if (t < T.cut1) return partDoor(ctx, t);
      if (t < T.cut2) return partApply(ctx, t);
      if (t < T.cut3) return partReview(ctx, t);
      partIn(ctx, t);
    },
  });
}
