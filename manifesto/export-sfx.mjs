// Load the film once and dump the sound-design cues the scenes registered.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const b = await chromium.launch(); const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto('file://' + path.resolve('film/index.html') + '?capture=1');
await p.evaluate(() => window.ready);
const sfx = await p.evaluate(() => window.SFX.sort((a, b) => a.t - b.t));
fs.writeFileSync('sfx.json', JSON.stringify(sfx, null, 1));
console.log(sfx.length, 'cues;', [...new Set(sfx.map(s => s.kind))].join(' '));
await b.close();
