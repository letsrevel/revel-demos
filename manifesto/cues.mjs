// Single source of truth for timing: narration placement (seconds, film time),
// word-level timings, and the music grid. Writes cues.json (for the mixer) and
// film/cues.js (for the animation).
import fs from 'node:fs';
const words = JSON.parse(fs.readFileSync('audio/vo/final/words.json', 'utf8'));
const durs = JSON.parse(fs.readFileSync('audio/vo/final/durations.json', 'utf8'));
const script = JSON.parse(fs.readFileSync('script.json', 'utf8'));

// Music: score-v5, 110 BPM. Beat k sits at OFFSET + k*PERIOD; bar b at OFFSET + 4b*PERIOD.
const PERIOD = 0.54542, OFFSET = 0.14;
const bar = b => +(OFFSET + 4 * b * PERIOD).toFixed(3);

// Narration start times, chosen against the music map (see README).
const VO = {
  v01: 1.6, v02: 5.2, v03: 10.3,
  v04: 16.85, v05: 23.88,
  v06: 26.6, v07: 31.0, v08: 34.3, v09: 37.0,
  v10: 44.5, v11: 47.9, v12: 52.3, v13: 57.6,
  v14: 69.6, v15: 75.64,
  v16: 79.4, v17: 85.2,
  v18: 101.0, v19: 102.2, v20: 110.0,
};
// v17 (the feature list) is cut at its natural pauses so each phrase can sit on its own
// montage panel. cuts are clip-relative seconds; panels start on beats.
const beatT = k => +(OFFSET + k * PERIOD).toFixed(3);
const SPLITS = { v17: { cuts: [0.76, 1.71, 2.85, 3.71, 4.79], beats: [156, 159, 162, 166, 170, 173], lead: 0.06 } };
let lines = script.lines.map(l => ({
  id: l.id, text: l.text, start: VO[l.id], dur: durs[l.id], end: +(VO[l.id] + durs[l.id]).toFixed(3),
  words: words[l.id].map(w => ({ w: w.w, s: +(VO[l.id] + w.s).toFixed(3), e: +(VO[l.id] + w.e).toFixed(3) })),
}));
lines = lines.flatMap(l => {
  const sp = SPLITS[l.id]; if (!sp) return [l];
  const src = words[l.id]; const edges = [0, ...sp.cuts, durs[l.id]];
  return sp.beats.map((b, i) => {
    const z = edges[i + 1], start = +(beatT(b) + sp.lead).toFixed(3);
    const ws = src.filter(w => w.s >= edges[i] - 0.01 && w.s < z);
    const a = i === 0 ? 0 : Math.max(edges[i], ws[0].s - 0.05);  // start right before the word, not on the in-breath
    return { id: `${l.id}${'abcdef'[i]}`, file: l.id, clip: [a, z], text: ws.map(w => w.w).join(' ').replace(' -', '-'),
      start, dur: +(z - a).toFixed(3), end: +(start + z - a).toFixed(3),
      words: ws.map(w => ({ w: w.w, s: +(start + w.s - a).toFixed(3), e: +(start + w.e - a).toFixed(3) })), panel: beatT(b) };
  });
});
// overlap check
for (let i = 1; i < lines.length; i++) if (lines[i].start < lines[i - 1].end + 0.15) console.warn('tight/overlap', lines[i - 1].id, lines[i].id, lines[i - 1].end, lines[i].start);

const music = { montageEnd: beatT(176),
  file: 'audio/score-v5.mp3', period: PERIOD, offset: OFFSET,
  marks: { intro: 0, platforms: bar(8), dip: 24.3, drop: 25.77, dropBar: bar(12), breakdown: bar(20),
           build: bar(28), climaxPickup: 78.12, climax: bar(36), climax2: bar(44), logo: bar(46), outro: bar(51) },
};
const DURATION = 121.0;
const cues = { duration: DURATION, fps: 60, music, lines };
fs.writeFileSync('cues.json', JSON.stringify(cues, null, 1));
fs.writeFileSync('film/cues.js', 'window.CUES = ' + JSON.stringify(cues) + ';\n');
console.log(music.marks);
for (const l of lines) console.log(l.id, l.start, '->', l.end, '|', l.words.map(w => `${w.w}@${w.s}`).join(' '));
