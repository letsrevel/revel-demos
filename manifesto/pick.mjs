import fs from 'node:fs';
import { listen } from './listen.mjs';
const S = JSON.parse(fs.readFileSync('script.json', 'utf8'));
const only = process.argv[2]?.split(',');
const out = fs.existsSync('audio/vo/picks.json') ? JSON.parse(fs.readFileSync('audio/vo/picks.json')) : {};
const run = async (l) => {
  const files = fs.readdirSync('audio/vo').filter(f => f.startsWith(l.id + '-t') && f.endsWith('.wav')).sort().map(f => 'audio/vo/' + f);
  for (let a = 0; a < 3; a++) try {
    const txt = await listen(files, `These are alternative takes of one voice-over line for a warm, honest brand film. Intended script: "${l.text}". Intended delivery: ${l.tag}.
For each clip give: exact verbatim transcript; whether it matches the script exactly (words dropped/added/garbled = mismatch); naturalness 1-10; delivery fit 1-10; any artifacts (clicks, metallic, odd breath, weird emphasis, mispronunciation) with detail.
Then choose the best take. Respond ONLY with JSON: {"takes":[{"file":"...","transcript":"...","exact":true,"natural":8,"fit":8,"issues":"..."}],"best":"<file name>","why":"..."}`);
    const j = JSON.parse(txt.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
    out[l.id] = j; process.stdout.write(`${l.id}:${j.best} `); return;
  } catch (e) { console.error(l.id, e.message.slice(0, 200)); }
};
const lines = S.lines.filter(l => !only || only.includes(l.id));
for (let i = 0; i < lines.length; i += 5) await Promise.all(lines.slice(i, i + 5).map(run));
fs.writeFileSync('audio/vo/picks.json', JSON.stringify(out, null, 1));
for (const [id, j] of Object.entries(out)) {
  console.log('\n' + id, '->', j.best);
  for (const t of j.takes) console.log('  ', t.file, t.exact ? 'OK ' : 'BAD', t.natural, t.fit, '|', t.transcript, '|', t.issues);
}
