// Engine: pure functions of time. Nothing here keeps state between frames,
// so any frame can be rendered in any order (parallel capture, motion blur).
'use strict';

const W = 1920, H = 1080;

const C = {
  purple: '#8C3CDD', crimson: '#E6332A', lavender: '#AB82DB', peri: '#9AB2FF',
  amber: '#F9B233', ink: '#0D1E1C', paper: '#F1ECFA', paper2: '#E7DEF6',
  night: '#160B24', plum: '#2A1340', white: '#FFFFFF',
  concrete: '#C9CAD0', concreteDark: '#8E9098', steel: '#5D6069',
};

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const prog = (a, b, x) => clamp((x - a) / (b - a));
const TAU = Math.PI * 2;

const E = {
  lin: t => t,
  inQuad: t => t * t,
  outQuad: t => 1 - (1 - t) * (1 - t),
  inCubic: t => t * t * t,
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  inOutQuint: t => t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2,
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inExpo: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  inOutExpo: t => t <= 0 ? 0 : t >= 1 ? 1 : t < .5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
};

// Damped spring step response: 0 -> 1 with overshoot. dt in seconds since start.
function spring(dt, freq = 2.2, damp = 0.5) {
  if (dt <= 0) return 0;
  const w = TAU * freq, z = damp, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * dt) * (Math.cos(wd * dt) + (z * w / wd) * Math.sin(wd * dt));
}

// Seeded PRNG + value noise
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function hash(n) { n = (n << 13) ^ n; return 1 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824; }
function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57), hash(i + 1 + seed * 57), u);
}

// ---------- colour ----------
function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}
function rgba(h, a) { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; }

// ---------- paths ----------
// Catmull-Rom through control points -> dense polyline
function spline(ctrl, perSeg = 24, closed = false) {
  const P = closed ? [ctrl[ctrl.length - 1], ...ctrl, ctrl[0], ctrl[1]] : [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let j = 0; j < perSeg; j++) {
      const t = j / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        .5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? [...P[P.length - 2]] : [...ctrl[ctrl.length - 1]]);
  return out;
}
function measure(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, cum, L: cum[cum.length - 1] };
}
function pointAt(path, s) {
  const { pts, cum, L } = path; s = clamp(s, 0, L);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1, f = (s - cum[lo]) / seg;
  const a = pts[lo], b = pts[hi];
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return { x: lerp(a[0], b[0], f), y: lerp(a[1], b[1], f), ang };
}
// Resample a polyline to even spacing (step px)
function resample(path, step) {
  const out = [];
  for (let s = 0; s <= path.L; s += step) { const p = pointAt(path, s); out.push([p.x, p.y]); }
  const e = pointAt(path, path.L); out.push([e.x, e.y]);
  return measure(out);
}
// Sample an SVG path string into points (uses the browser's geometry engine)
function svgPathPoints(d, step = 4, transform = null) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d); svg.appendChild(p); document.body.appendChild(svg);
  const L = p.getTotalLength(), out = [];
  for (let s = 0; s <= L; s += step) { const q = p.getPointAtLength(s); out.push(transform ? transform(q.x, q.y) : [q.x, q.y]); }
  svg.remove();
  return out;
}

// ---------- the rope ----------
// A twisted cord: soft shadow, body in a gradient, diagonal "lay" of the strands,
// and a specular highlight. from/to are fractions of total length.
function drawRope(ctx, path, o = {}) {
  const w = o.w ?? 16, from = clamp(o.from ?? 0), to = clamp(o.to ?? 1);
  const colA = o.colA ?? C.purple, colB = o.colB ?? C.crimson, alpha = o.alpha ?? 1;
  const colorAt = o.colorAt ?? (u => mix(colA, colB, u));
  if (to <= from || alpha <= 0) return;
  const { pts, cum, L } = path; const s0 = from * L, s1 = to * L;
  let i0 = 0; while (i0 < cum.length - 1 && cum[i0 + 1] < s0) i0++;
  let i1 = i0; while (i1 < cum.length - 1 && cum[i1] < s1) i1++;
  const seg = [];
  const a0 = pointAt(path, s0); seg.push([a0.x, a0.y, s0]);
  for (let i = i0 + 1; i < i1; i++) seg.push([pts[i][0], pts[i][1], cum[i]]);
  const a1 = pointAt(path, s1); seg.push([a1.x, a1.y, s1]);
  if (seg.length < 2) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const strokeAll = (lw, style, dx = 0, dy = 0) => {
    ctx.beginPath(); ctx.moveTo(seg[0][0] + dx, seg[0][1] + dy);
    for (let k = 1; k < seg.length; k++) ctx.lineTo(seg[k][0] + dx, seg[k][1] + dy);
    ctx.lineWidth = lw; ctx.strokeStyle = style; ctx.stroke();
  };
  // shadow
  if (o.shadow !== false) {
    ctx.save(); ctx.filter = `blur(${w * 0.55}px)`;
    strokeAll(w * 1.05, o.shadowColor ?? 'rgba(40,10,60,0.28)', w * 0.25, w * 0.55);
    ctx.restore();
  }
  // body: chunks with per-chunk colour along the whole rope length
  const chunk = Math.max(6, Math.floor(seg.length / 60));
  for (let k = 0; k < seg.length - 1; k += chunk) {
    const e = Math.min(seg.length - 1, k + chunk);
    ctx.beginPath(); ctx.moveTo(seg[k][0], seg[k][1]);
    for (let m = k + 1; m <= e; m++) ctx.lineTo(seg[m][0], seg[m][1]);
    ctx.lineWidth = w; ctx.strokeStyle = colorAt(seg[k][2] / L); ctx.stroke();
  }
  // lay of the strands
  if (o.lay !== false && w >= 5) {
    const step = w * 0.62; const phase = (o.phase ?? 0) * step;
    ctx.lineWidth = Math.max(1, w * 0.14);
    const start = Math.ceil((s0 - phase) / step) * step + phase;
    ctx.beginPath();
    for (let s = start; s < s1 - w * 0.3; s += step) {
      const p = pointAt(path, s), c = Math.cos(p.ang), sn = Math.sin(p.ang);
      const nx = -sn, ny = c, a = w * 0.44, b = w * 0.3;
      ctx.moveTo(p.x + nx * a - c * b, p.y + ny * a - sn * b);
      ctx.lineTo(p.x - nx * a + c * b, p.y - ny * a + sn * b);
    }
    ctx.strokeStyle = 'rgba(20,0,30,0.26)'; ctx.stroke();
    ctx.beginPath();
    for (let s = start + w * 0.16; s < s1 - w * 0.3; s += step) {
      const p = pointAt(path, s), c = Math.cos(p.ang), sn = Math.sin(p.ang);
      const nx = -sn, ny = c, a = w * 0.3, b = w * 0.2;
      ctx.moveTo(p.x + nx * a - c * b, p.y + ny * a - sn * b);
      ctx.lineTo(p.x - nx * a * 0.2 + c * b * 0.2, p.y - ny * a * 0.2 + sn * b * 0.2);
    }
    ctx.lineWidth = Math.max(1, w * 0.09); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
  }
  // highlight along the upper side
  const off = w * 0.2;
  ctx.beginPath();
  for (let k = 0; k < seg.length; k++) {
    const a = seg[Math.max(0, k - 1)], b = seg[Math.min(seg.length - 1, k + 1)];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const x = seg[k][0] + Math.sin(ang) * off, y = seg[k][1] - Math.cos(ang) * off;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.lineWidth = Math.max(1, w * 0.16); ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.stroke();
  // whipped end at the tip
  if (o.tip !== false && to < 0.999 || o.tipAlways) {
    const p = pointAt(path, s1 - w * 0.2), c = Math.cos(p.ang), sn = Math.sin(p.ang);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang);
    ctx.fillStyle = 'rgba(20,0,30,0.30)'; ctx.fillRect(-w * 0.9, -w * 0.52, w * 0.28, w * 1.04);
    ctx.restore();
  }
  ctx.restore();
}

// ---------- text ----------
const FONT = {
  display: "'Bricolage Grotesque'",
  serif: "'Instrument Serif'",
  ui: "'Nata Sans'",
  mono: "'JetBrains Mono'",
};
function setFont(ctx, { family = FONT.display, size = 100, weight = 700, style = 'normal', stretch = 'normal', tracking = 0 } = {}) {
  ctx.font = `${style} ${weight} ${size}px ${family}`;
  ctx.fontStretch = stretch;
  ctx.letterSpacing = `${tracking}px`;
}
function text(ctx, str, x, y, o = {}) {
  setFont(ctx, o);
  ctx.textAlign = o.align ?? 'left'; ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillStyle = o.color ?? C.ink;
  ctx.save(); ctx.globalAlpha *= (o.alpha ?? 1);
  ctx.fillText(str, x, y);
  ctx.restore();
  return ctx.measureText(str).width;
}
function measureText(ctx, str, o = {}) { setFont(ctx, o); return ctx.measureText(str).width; }

// Word-by-word mask reveal. items: [{w, s}] (word, start time). Lays out lines
// within maxWidth. Each word rises from behind its own line mask.
function revealWords(ctx, t, items, x, y, o = {}) {
  const size = o.size ?? 120, lh = o.lineHeight ?? size * 1.0, maxW = o.maxWidth ?? 1600;
  const dur = o.dur ?? 0.55, color = o.color ?? C.ink;
  setFont(ctx, o);
  const space = ctx.measureText(' ').width;
  const lines = [[]]; let lw = 0;
  for (const it of items) {
    const ww = ctx.measureText(it.w).width;
    if (lw > 0 && lw + space + ww > maxW || it.br) { lines.push([]); lw = 0; }
    lines[lines.length - 1].push({ ...it, ww, x: lw }); lw += (lw > 0 ? space : 0) + ww;
    if (lines[lines.length - 1].length > 1) lines[lines.length - 1][lines[lines.length - 1].length - 1].x = lw - ww;
  }
  const out = o.out; // {s, dur} optional exit
  lines.forEach((ln, li) => {
    const lineW = ln.length ? ln[ln.length - 1].x + ln[ln.length - 1].ww : 0;
    const ox = o.align === 'center' ? x - lineW / 2 : o.align === 'right' ? x - lineW : x;
    const by = y + li * lh;
    for (const wd of ln) {
      let p = E.outQuint(prog(wd.s, wd.s + dur, t));
      if (o.spring) p = spring(t - wd.s, o.spring.f ?? 2, o.spring.d ?? 0.6);
      if (p <= 0) continue;
      let q = 1;
      if (out) q = 1 - E.inCubic(prog(out.s + (o.outStagger ?? 0) * li, out.s + out.dur + (o.outStagger ?? 0) * li, t));
      if (q <= 0) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(ox + wd.x - size, by - size * 1.05, wd.ww + size * 2, size * 1.35); ctx.clip();
      const dy = (1 - p) * size * 1.05 + (1 - q) * -size * 1.05;
      ctx.fillStyle = wd.color ?? color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.globalAlpha *= clamp(p * 1.4) * (o.alpha ?? 1);
      setFont(ctx, { ...o, ...(wd.font || {}) });
      ctx.fillText(wd.w, ox + wd.x, by + dy);
      ctx.restore();
    }
  });
  return lines.length;
}

// Words of a cue line as reveal items, with optional per-word overrides.
function cueWords(id, over = {}) {
  const l = window.CUES.lines.find(l => l.id === id);
  return l.words.map((w, i) => ({ w: w.w.replace(/^-/, ''), s: w.s, ...(over[i] || {}) }));
}
function cue(id) { return window.CUES.lines.find(l => l.id === id); }
function wordT(id, idx) { return cue(id).words[idx].s; }

// ---------- UI primitives (styled after the Revel web app) ----------
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function card(ctx, x, y, w, h, o = {}) {
  ctx.save();
  ctx.shadowColor = o.shadow ?? 'rgba(45,15,80,0.18)'; ctx.shadowBlur = o.blur ?? 60; ctx.shadowOffsetY = o.dy ?? 24;
  rr(ctx, x, y, w, h, o.r ?? 28); ctx.fillStyle = o.fill ?? '#fff'; ctx.fill();
  ctx.restore();
  if (o.stroke) { ctx.save(); rr(ctx, x, y, w, h, o.r ?? 28); ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw ?? 2; ctx.stroke(); ctx.restore(); }
}
function pill(ctx, x, y, label, o = {}) {
  const size = o.size ?? 26; setFont(ctx, { family: FONT.ui, size, weight: o.weight ?? 600 });
  const w = ctx.measureText(label).width + size * 1.3 + (o.icon ? size * 1.1 : 0), h = size * 1.75;
  const X = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  rr(ctx, X, y, w, h, h / 2); ctx.fillStyle = o.fill ?? rgba(C.purple, .12); ctx.fill();
  if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = 2; ctx.stroke(); }
  if (o.icon) o.icon(ctx, X + size * 0.65 + size * 0.45, y + h / 2, size * 0.9, o.color ?? C.purple);
  ctx.fillStyle = o.color ?? C.purple; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(label, X + size * 0.65 + (o.icon ? size * 1.1 : 0), y + h / 2 + 1);
  return { x: X, y, w, h };
}
function button(ctx, x, y, w, h, label, o = {}) {
  rr(ctx, x, y, w, h, o.r ?? h / 2); ctx.fillStyle = o.fill ?? C.purple; ctx.fill();
  if (o.icon) o.icon(ctx, x + w / 2 - (o.iconGap ?? 0), y + h / 2, h * 0.42, o.color ?? '#fff');
  setFont(ctx, { family: FONT.ui, size: o.size ?? h * 0.36, weight: 700 });
  ctx.fillStyle = o.color ?? '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2 + (o.icon ? (o.iconGap ?? 0) * 0 + h * 0.3 : 0), y + h / 2 + 1);
}

// Icons (drawn centred at x,y within size s)
const ICON = {
  lock(ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = s * 0.14; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - s * 0.12, s * 0.24, Math.PI, 0); ctx.lineTo(x + s * 0.24, y + s * 0.02); ctx.moveTo(x - s * 0.24, y - s * 0.12); ctx.lineTo(x - s * 0.24, y + s * 0.02); ctx.stroke();
    rr(ctx, x - s * 0.36, y - s * 0.02, s * 0.72, s * 0.5, s * 0.1); ctx.fill(); ctx.restore();
  },
  check(ctx, x, y, s, col, p = 1) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const a = [x - s * 0.34, y + s * 0.02], b = [x - s * 0.08, y + s * 0.28], c = [x + s * 0.38, y - s * 0.3];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]); let d = p * (l1 + l2);
    ctx.beginPath(); ctx.moveTo(...a);
    if (d <= l1) ctx.lineTo(lerp(a[0], b[0], d / l1), lerp(a[1], b[1], d / l1));
    else { ctx.lineTo(...b); ctx.lineTo(lerp(b[0], c[0], (d - l1) / l2), lerp(b[1], c[1], (d - l1) / l2)); }
    ctx.stroke(); ctx.restore();
  },
  heart(ctx, x, y, s, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x, y + s * 0.38);
    ctx.bezierCurveTo(x - s * 0.62, y - s * 0.02, x - s * 0.36, y - s * 0.52, x, y - s * 0.2);
    ctx.bezierCurveTo(x + s * 0.36, y - s * 0.52, x + s * 0.62, y - s * 0.02, x, y + s * 0.38);
    ctx.fill(); ctx.restore();
  },
  pin(ctx, x, y, s, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - s * 0.1, s * 0.3, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(x, y + s * 0.42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - s * 0.1, s * 0.11, 0, TAU); ctx.fill(); ctx.restore();
  },
  cal(ctx, x, y, s, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = s * 0.11; rr(ctx, x - s * 0.38, y - s * 0.3, s * 0.76, s * 0.66, s * 0.1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.38, y - s * 0.08); ctx.lineTo(x + s * 0.38, y - s * 0.08); ctx.stroke();
    ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - s * 0.18, y - s * 0.42); ctx.lineTo(x - s * 0.18, y - s * 0.24); ctx.moveTo(x + s * 0.18, y - s * 0.42); ctx.lineTo(x + s * 0.18, y - s * 0.24); ctx.stroke(); ctx.restore();
  },
  person(ctx, x, y, s, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y - s * 0.18, s * 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + s * 0.34, s * 0.36, s * 0.26, 0, Math.PI, 0); ctx.fill(); ctx.restore();
  },
  spark(ctx, x, y, s, col) {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? s * 0.14 : s * 0.46; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a - Math.PI / 2) * r, y + Math.sin(a - Math.PI / 2) * r); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  },
};

// Soft glow blob (for light leaks / warmth)
function glow(ctx, x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function fillBg(ctx, col) { ctx.fillStyle = col; ctx.fillRect(-50, -50, W + 100, H + 100); }

Object.assign(window, {
  W, H, C, clamp, lerp, prog, TAU, E, spring, rng, noise1, hash, mix, rgba, hex2rgb,
  spline, measure, pointAt, resample, svgPathPoints, drawRope, FONT, setFont, text, measureText,
  revealWords, cueWords, cue, wordT, rr, card, pill, button, ICON, glow, fillBg,
});

// Sound-design cues registered by the scenes (time, kind, gain, extra).
window.SFX = [];
window.sfx = (t, kind, gain = 1, extra = {}) => window.SFX.push({ t: +t.toFixed(3), kind, gain, ...extra });

// Round off corners: resample evenly, then Gaussian-smooth the points
// (endpoints pinned). radius ≈ the corner radius in px.
function smoothPath(path, radius = 40, step = 3) {
  const r = resample(path, step), P = r.pts, n = P.length;
  const k = Math.max(1, Math.round(radius / step)), sig = k / 2;
  const wts = []; for (let j = -k; j <= k; j++) wts.push(Math.exp(-(j * j) / (2 * sig * sig)));
  const out = P.map((p, i) => {
    if (i === 0 || i === n - 1) return p;
    let sx = 0, sy = 0, sw = 0;
    for (let j = -k; j <= k; j++) { const q = P[Math.min(n - 1, Math.max(0, i + j))], w = wts[j + k]; sx += q[0] * w; sy += q[1] * w; sw += w; }
    return [sx / sw, sy / sw];
  });
  return measure(out);
}
window.smoothPath = smoothPath;
