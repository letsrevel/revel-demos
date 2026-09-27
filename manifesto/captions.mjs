// Subtitles (SRT + WebVTT) from the cue sheet: one caption per narration line,
// long lines split at sentence boundaries using word timings.
import fs from 'node:fs';
const cues = JSON.parse(fs.readFileSync('cues.json'));
const script = JSON.parse(fs.readFileSync('script.json'));
const caps = [];
for (const l of cues.lines) {
  const text = l.clip ? l.text : script.lines.find(s => s.id === l.id).text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  if (sentences.length === 1 || text.length < 48) { caps.push([l.start, l.end, text]); continue; }
  // map sentences onto word timings
  let wi = 0;
  sentences.forEach((snt, si) => {
    const n = snt.trim().split(/\s+/).length;
    const ws = l.words.slice(wi, wi + n); wi += n;
    if (!ws.length) return;
    const end = si === sentences.length - 1 ? l.end : (l.words[wi]?.s ?? l.end) - 0.05;
    caps.push([ws[0].s, end, snt.trim()]);
  });
}
caps.forEach((c, i) => { const nx = caps[i + 1]; c[1] = Math.min(c[1] + 0.25, nx ? nx[0] - 0.02 : c[1] + 0.25); });
const ts = (t, sep) => { const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t) % 60, ms = Math.round((t % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms).padStart(3, '0')}`; };
fs.writeFileSync('../videos/revel-one-line.srt', caps.map(([a, b, x], i) => `${i + 1}\n${ts(a, ',')} --> ${ts(b, ',')}\n${x}\n`).join('\n'));
fs.writeFileSync('../videos/revel-one-line.vtt', 'WEBVTT\n\n' + caps.map(([a, b, x]) => `${ts(a, '.')} --> ${ts(b, '.')}\n${x}\n`).join('\n'));
console.log(caps.length, 'captions');
