// Render stills at given times, and optional contact sheet.
// node preview.mjs 1.5 5 10          -> /tmp-ish previews/frame-<t>.png
// node preview.mjs --sheet 0 20 1    -> contact sheet of 0..20 every 1s
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const OUT = process.env.PREVIEW_DIR || path.resolve('previews');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
let times = [], sheet = false, mb = +(process.env.MB || 1);
if (args[0] === '--sheet') { sheet = true; const [a, b, st] = args.slice(1).map(Number); for (let t = a; t <= b + 1e-6; t += st) times.push(+t.toFixed(3)); }
else times = args.map(Number);
const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-gpu-vsync'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('file://' + path.resolve('film/index.html') + '?capture=1');
await page.evaluate(() => window.ready);
const files = [];
for (const t of times) {
  const data = await page.evaluate(([t, mb]) => { renderAt(t, mb); return document.getElementById('c').toDataURL('image/png'); }, [t, mb]);
  const f = path.join(OUT, `f-${t.toFixed(2)}.png`);
  fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64')); files.push(f);
}
await browser.close();
if (sheet) {
  const cols = 5, list = files.map(f => `-i ${f}`).join(' ');
  const n = files.length, rows = Math.ceil(n / cols);
  const lay = files.map((_, i) => `${(i % cols) * 384}_${Math.floor(i / cols) * 216}`).join('|');
  const scaled = files.map((_, i) => `[${i}:v]scale=384:216,drawtext=text='${times[i]}':x=6:y=6:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.5[s${i}]`).join(';');
  const name = path.join(OUT, `sheet-${times[0]}-${times[times.length - 1]}.png`);
  execSync(`ffmpeg -loglevel error -y ${list} -filter_complex "${scaled};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${lay}:fill=black" -frames:v 1 ${name}`);
  console.log(name);
} else console.log(files.join('\n'));
