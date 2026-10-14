// Single source of truth for timing. Reads the actor's take + its word
// transcript, cuts it into phrases at the silences, places each phrase on the
// film timeline, and lays out the music edit. Writes data/timing.json (for
// tools) and data/timing.js (window.TIMING, for the compositions).
//
//   node tools/timing.mjs [en|de]
//
// Re-run after a pickup arrives: drop the file in audio/, add it to PICKUPS.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const LANG = process.argv[2] || 'en';
const ROOT = new URL('..', import.meta.url).pathname;
const VO = `audio/vo-${LANG}.wav`;
const words = JSON.parse(fs.readFileSync(`${ROOT}data/vo-${LANG}.words.json`, 'utf8'));

// ---- silences in the take (phrase boundaries) ----
// silencedetect reports on stderr
const sil = [];
const raw = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${ROOT}${VO}" -af silencedetect=n=-45dB:d=0.12 -f null - 2>&1`], { encoding: 'utf8' });
let open = null;
for (const m of raw.matchAll(/silence_(start|end): ([0-9.]+)/g)) {
  if (m[1] === 'start') open = +m[2]; else if (open != null) { sil.push([open, +m[2]]); open = null; }
}
const takeEnd = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${ROOT}${VO}`], { encoding: 'utf8' }).trim();
// segments of speech between silences
const segs = []; let s0 = 0;
for (const [a, b] of sil) { if (a - s0 > 0.05) segs.push([s0, a]); s0 = b; }
if (takeEnd - s0 > 0.05) segs.push([s0, takeEnd]);

// ---- music: score-v5, 110 BPM; bar b at OFFSET + 4b*PERIOD (music time) ----
const PERIOD = 0.54542, OFFSET = 0.14;
const bar = b => OFFSET + 4 * b * PERIOD;
const beat = k => OFFSET + k * PERIOD;
// The edit: three passes of the score, each spliced on a bar line.
const MUSIC = [
  { id: 'm1', from: bar(2), to: bar(28) },   // intro (from bar 2) → platforms → drop → verse → breakdown
  { id: 'm2', from: bar(32), to: bar(44) },  // second half of the build → climax
  { id: 'm3', from: bar(51), to: 123.01 },   // solo-piano outro, final chord rings out
];
let acc = 0;
for (const m of MUSIC) { m.start = +acc.toFixed(3); m.dur = +(m.to - m.from).toFixed(3); acc += m.dur; m.from = +m.from.toFixed(3); }
const musicToFilm = t => { for (const m of MUSIC) if (t >= m.from - 1e-6 && t <= m.from + m.dur + 1e-6) return +(m.start + t - m.from).toFixed(3); return null; };
const DURATION = 95.0;

const S = { // sections, film time
  intro: musicToFilm(bar(2)), platforms: musicToFilm(bar(8)), drop: musicToFilm(bar(12)),
  breakdown: musicToFilm(bar(20)), build: MUSIC[1].start, climax: musicToFilm(bar(36)),
  outro: MUSIC[2].start, end: DURATION,
};

// ---- phrases: [first seg, last seg] of the take, on-screen text, film start ----
// segN indexes are for the EN take (see `node tools/timing.mjs en --segs`).
const PHRASES = {
  en: [
    ['v01', [0, 1], 'Every community starts the same way.', 1.2],
    ['v02', [2, 2], 'A few people. And a reason to get together.', 4.3],
    ['v03', [3, 6], 'A book club. A rope circle. A Sunday picnic. A basement gig.', 7.6],
    ['v04', [7, 9], 'Then come the platforms. Fees on every ticket. Your people, turned into data.', 13.3],
    ['v05', [10, 10], 'Revel is different.', 19.4],
    ['v06', [11, 14], "It's open source. Anyone can read it, run it, and make it better.", 22.3],
    ['v07', [15, 16], 'Buyers pay the ticket price. No fee on top.', 27.0],
    ['v08', null, 'The money goes straight to the organizer.', 30.4, 2.6],   // GAP — pickup pending
    ['v09', [17, 20], 'No ads. No trackers. And your data is never, ever sold.', 33.6],
    ['v10', [21, 21], 'Some rooms need a little more care.', 39.9],
    ['v11', [22, 23], 'Like a rope workshop in Vienna, built on trust.', 42.6],
    ['v12', [24, 24], 'So before anyone gets a ticket, they answer a few questions.', 46.4],
    ['v13', [25, 26], 'About experience, the consent guidelines, and why they want to come.', 50.5],
    ['v14', [27, 28], 'Then a real person reads every answer, and makes the call.', 57.3],
    ['v15', [29, 30], "And then, you're in.", 63.2],
    ['v16', [31, 32], 'Everyone in the room chose to be there. And was welcomed with care.', 66.2],
    // feature list: one phrase per montage panel, each on a beat (music beats 156…173)
    ['v17a', [33, 33], 'Potlucks.', 'beat:156'],
    ['v17b', [34, 34], 'Member pricing.', 'beat:159'],
    ['v17c', [35, 35], 'Pay what you can.', 'beat:162'],
    ['v17d', [36, 36], 'Waitlists.', 'beat:166'],
    ['v17e', [37, 37], 'Check-in at the door.', 'beat:170'],
    ['v17f', [38, 38], 'In six languages.', 'beat:173'],
    // he reads "Revel, the free, open-source…" as one breath — keep it whole
    ['v18', [39, 41], 'Revel. The free, open-source event platform for communities, clubs and independent venues.', 84.0],
    ['v20', [42, 42], "Let's revel.", 91.8],
  ],
};
// Pickups recorded separately: { id: { file, from, to } } — source range in that file.
const PICKUPS = {};

if (process.argv.includes('--segs')) {
  segs.forEach(([a, b], i) => console.log(String(i).padStart(2), a.toFixed(2), b.toFixed(2),
    words.filter(w => w.start >= a - 0.08 && w.start < b).map(w => w.text.trim()).join(' ')));
  process.exit(0);
}

const HEAD = 0.06, TAIL = 0.10; // handles: start just before the word, keep the decay
const lines = PHRASES[LANG].map(([id, range, text, at, gapDur]) => {
  const start = typeof at === 'string' ? +(musicToFilm(beat(+at.split(':')[1])) + 0.06).toFixed(3) : at;
  const pick = PICKUPS[id];
  if (!range && !pick) return { id, text, start, dur: gapDur, end: +(start + gapDur).toFixed(3), gap: true, words: [] };
  let file = VO, a, b;
  if (pick) ({ file, from: a, to: b } = pick);
  else {
    a = Math.max(0, segs[range[0]][0] - HEAD);
    b = Math.min(takeEnd, segs[range[1]][1] + TAIL);
    // never reach into the neighbouring phrase
    if (range[0] > 0) a = Math.max(a, segs[range[0] - 1][1] + 0.02);
    if (range[1] < segs.length - 1) b = Math.min(b, segs[range[1] + 1][0] - 0.02);
  }
  const dur = +(b - a).toFixed(3);
  // a word belongs to the phrase its midpoint falls in
  let ws = pick ? [] : words.filter(w => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 < b).map(w => ({
    w: w.text.trim(), s: +(start + Math.max(0, w.start - a)).toFixed(3), e: +(start + Math.min(b, w.end) - a).toFixed(3),
  }));
  // carry the script's spelling when the word counts line up (the recogniser hears "Buy" for "Buyers")
  const canon = text.split(/\s+/);
  if (canon.length === ws.length) ws = ws.map((w, i) => ({ ...w, w: canon[i] }));
  return { id, text, file, mediaStart: +a.toFixed(3), start, dur, end: +(start + dur).toFixed(3), words: ws };
});

for (let i = 1; i < lines.length; i++)
  if (lines[i].start < lines[i - 1].end + 0.2) console.warn('TIGHT', lines[i - 1].id, lines[i - 1].end, '→', lines[i].id, lines[i].start);

const montage = [156, 159, 162, 166, 170, 173].map(k => musicToFilm(beat(k)));
const out = { lang: LANG, duration: DURATION, fps: 60, sections: S, music: MUSIC, montage, montageEnd: musicToFilm(beat(176)),
  musicBeat: PERIOD, lines };
fs.writeFileSync(`${ROOT}data/timing.json`, JSON.stringify(out, null, 1));
fs.writeFileSync(`${ROOT}data/timing.js`, 'window.TIMING = ' + JSON.stringify(out) + ';\n');
console.log('sections', S);
console.log('music', MUSIC.map(m => `${m.id} film ${m.start}+${m.dur} ← music ${m.from}`).join(' | '));
for (const l of lines) console.log(l.id.padEnd(5), String(l.start).padStart(6), '→', String(l.end).padStart(6), l.gap ? '[GAP]' : '', '|', l.words.map(w => w.w).join(' '));
