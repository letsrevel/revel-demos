// Compositor: scene list, motion blur, grain, vignette, and the capture API.
'use strict';
const Q = new URLSearchParams(location.search);
const SCALE = +(Q.get('scale') || 1);
const canvas = document.getElementById('c');
canvas.width = W * SCALE; canvas.height = H * SCALE;
const ctx = canvas.getContext('2d');
const off = document.createElement('canvas'); off.width = canvas.width; off.height = canvas.height;
const octx = off.getContext('2d');

// ---- film grain: a few pre-baked noise tiles, picked per frame deterministically
const GRAIN = [];
function bakeGrain() {
  for (let k = 0; k < 8; k++) {
    const g = document.createElement('canvas'); g.width = g.height = 512;
    const gx = g.getContext('2d'), img = gx.createImageData(512, 512), r = rng(1234 + k * 77);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor((r() + r() + r()) / 3 * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0); GRAIN.push(g);
  }
}

// grain strength over time (darker scenes carry more)
function grainAmount(t) {
  if (t >= 43.2 && t < 78.9) return 0.11;
  if (t >= 17.5 && t < 25.8) return 0.1;
  return 0.065;
}

function vignetteAmount(t) { return (t >= 43.2 && t < 78.9) || (t >= 26.5 && t < 31) ? 0.34 : 0.13; }

function drawScene(c, t) {
  c.save(); c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  c.fillStyle = C.paper; c.fillRect(0, 0, W, H);
  for (const s of window.SCENES) if (t >= s.from && t < s.to) { c.save(); s.draw(c, t); c.restore(); }
  c.restore();
}

function post(c, t) {
  const f = Math.round(t * 60);
  c.save();
  // vignette
  c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.05);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(30,6,50,${vignetteAmount(t)})`);
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  // grain
  c.setTransform(1, 0, 0, 1, 0, 0);
  const g = GRAIN[f % GRAIN.length], r = rng(f * 9973 + 7);
  const ox = Math.floor(r() * 512), oy = Math.floor(r() * 512);
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = grainAmount(t) * 1.6;
  const pat = c.createPattern(g, 'repeat'); pat.setTransform(new DOMMatrix([SCALE > 1.5 ? 1.5 : 1, 0, 0, SCALE > 1.5 ? 1.5 : 1, ox, oy]));
  c.fillStyle = pat; c.fillRect(0, 0, canvas.width, canvas.height);
  c.restore();
  // global fade from/to black
  const fin = 1 - E.outCubic(prog(0, 1.1, t));
  const fout = E.inOutSine(prog(CUES.duration - 1.6, CUES.duration - 0.1, t));
  const a = Math.max(fin, fout);
  if (a > 0) { c.save(); c.fillStyle = `rgba(8,4,14,${a})`; c.fillRect(0, 0, canvas.width, canvas.height); c.restore(); }
}

// Motion blur: average N sub-frames across a 180° shutter (1/120 s at 60 fps).
function renderAt(t, mb = +(Q.get('mb') || 1)) {
  if (mb <= 1) { drawScene(ctx, t); post(ctx, t); return; }
  const shutter = 0.5 / 60;
  for (let i = 0; i < mb; i++) {
    const ts = t + (i / (mb - 1) - 0.5) * shutter;
    drawScene(octx, ts);
    ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(off, 0, 0); ctx.globalAlpha = 1;
  }
  post(ctx, t);
}

window.renderAt = renderAt;
window.ready = (async () => {
  await document.fonts.load("700 100px 'Bricolage Grotesque'");
  await document.fonts.load("400 100px 'Instrument Serif'");
  await document.fonts.load("italic 400 100px 'Instrument Serif'");
  await document.fonts.load("600 40px 'Nata Sans'");
  await document.fonts.load("400 40px 'JetBrains Mono'");
  await document.fonts.ready;
  bakeGrain();
  for (const s of window.SCENES) if (s.init) await s.init();
  if (Q.has('t')) renderAt(+Q.get('t'));
  return true;
})();
// Live preview when opened without ?t
if (!Q.has('t') && !Q.has('capture')) {
  window.ready.then(() => { const t0 = performance.now() - (+(Q.get('from') || 0)) * 1000; const loop = () => { renderAt(((performance.now() - t0) / 1000) % CUES.duration); requestAnimationFrame(loop); }; loop(); });
}
