// Generate N takes of each narration line with Gemini TTS; convert to 48k WAV.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { speech } from './or.mjs';
const S = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const takes = +(process.argv[2] || 2);
const only = process.argv[3]?.split(',');
fs.mkdirSync('audio/vo', { recursive: true });
const jobs = [];
for (const l of S.lines) {
  if (only && !only.includes(l.id)) continue;
  for (let k = 1; k <= takes; k++) {
    const base = `audio/vo/${l.id}-t${k}`;
    if (fs.existsSync(base + '.wav')) continue;
    jobs.push(async () => {
      await speech({ model: S.model, input: `[${l.tag}] ${l.text}`, voice: S.voice, format: 'pcm', out: base + '.pcm' });
      execSync(`ffmpeg -loglevel error -y -f s16le -ar 24000 -ac 1 -i ${base}.pcm -ar 48000 ${base}.wav && rm ${base}.pcm`);
      process.stdout.write('.');
    });
  }
}
// small concurrency
const pool = 4; let i = 0;
await Promise.all(Array.from({ length: pool }, async () => { while (i < jobs.length) { const j = jobs[i++]; try { await j(); } catch (e) { console.error('\n', e.message); } } }));
console.log('\ndone', jobs.length);
