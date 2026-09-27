// Deterministic frame-by-frame render: N browser workers each render a slice of
// the film and pipe PNG frames into their own lossless ffmpeg; the slices are
// then concatenated and muxed with the master audio.
//   node render.mjs --out ../videos/revel-one-line.mp4 [--scale 1] [--mb 4] [--workers 12] [--from 0 --to 121]
import { chromium } from 'playwright';
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const A = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith('--') && acc.push([v.slice(2), arr[i + 1]]), acc), []));
const cues = JSON.parse(fs.readFileSync('cues.json'));
const FPS = 60, SCALE = +(A.scale || 1), MB = +(A.mb || 4), WORKERS = +(A.workers || 12);
const from = +(A.from || 0), to = +(A.to || cues.duration);
const F0 = Math.round(from * FPS), F1 = Math.round(to * FPS);
const tmp = path.resolve('.render'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
const out = path.resolve(A.out || 'draft.mp4');
const audio = A.audio || 'audio/master.wav';
const crf = A.crf || '15';
console.log(`frames ${F0}..${F1} (${F1 - F0}) scale ${SCALE} mb ${MB} workers ${WORKERS}`);
const t0 = Date.now();
let done = 0;
async function worker(k, a, b) {
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.log(`[w${k}] pageerror`, e.message));
  await page.goto('file://' + path.resolve('film/index.html') + `?capture=1&scale=${SCALE}`);
  await page.evaluate(() => window.ready);
  const seg = path.join(tmp, `seg-${String(k).padStart(3, '0')}.mp4`);
  // each slice is encoded once, at final quality; slices are joined without re-encoding
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-tune', 'grain',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = a; f < b; f++) {
    const data = await page.evaluate(([t, mb]) => { renderAt(t, mb); return document.getElementById('c').toDataURL('image/png'); }, [f / FPS, MB]);
    const buf = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (++done % 300 === 0) { const el = (Date.now() - t0) / 1000; console.log(`${done}/${F1 - F0} frames, ${el.toFixed(0)}s, eta ${((F1 - F0 - done) * el / done).toFixed(0)}s`); }
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  await browser.close();
  return seg;
}
const per = Math.ceil((F1 - F0) / WORKERS);
const segs = await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k, F0 + k * per, Math.min(F1, F0 + (k + 1) * per))).filter(Boolean));
fs.writeFileSync(path.join(tmp, 'list.txt'), segs.map(s => `file '${s}'`).join('\n'));
const aArgs = fs.existsSync(audio) ? ['-ss', String(from), '-t', String(to - from), '-i', audio] : [];
execSync(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), ...aArgs,
  '-c:v', 'copy', '-movflags', '+faststart',
  ...(aArgs.length ? ['-c:a', 'aac', '-b:a', '320k', '-map', '0:v', '-map', '1:a'] : []), out].map(x => JSON.stringify(x)).join(' '), { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out, `in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
