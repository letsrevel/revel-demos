// Single source of truth for timing. Reads the actor's take + its word
// transcript, cuts it into phrases at the silences, places each phrase on the
// film timeline, and lays out the music edit. Writes data/timing.<lang>.json
// (for tools) and data/timing.<lang>.js (window.TIMING, for the compositions).
//
//   node tools/timing.mjs [en|de]
//
// Re-run after a pickup arrives: copy it to audio/vo-pickups-<name>.wav, transcribe it to
// data/vo-pickups-<name>.words.json, add it to PICKUPS and the line to PICKUP_LINES.
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
    ['v08', null, 'The money goes straight to the organizer.', 30.4, 2.6],   // not in the take — Draft 03 pickup
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
// German: same ids and beats as English. Text is what the SCREEN shows (word-
// synced by index), so the tagline is the website's wording — the take said
// "Clubs … Spielstätten"; the Draft 03 pickup replaces it (PICKUP_LINES).
PHRASES.de = [
  ['v01', [0, 0], 'Jede Community fängt gleich an.', 1.2],
  ['v02', [1, 1], 'Ein paar Leute. Und ein Grund, zusammenzukommen.', 4.3],
  ['v03', [2, 5], 'Ein Buchclub. Ein Rope-Kreis. Ein Picknick am Sonntag. Ein Konzert im Keller.', 7.6],
  ['v04', [6, 8], 'Dann kommen die Plattformen. Gebühren auf jedes Ticket. Aus deinen Leuten werden Daten.', 13.3],
  ['v05', [9, 10], 'Revel ist anders.', 19.4],
  ['v06', [11, 12], 'Es ist Open Source. Alle können es lesen, betreiben und besser machen.', 22.3],
  ['v07', [13, 14], 'Wer kauft, zahlt den Ticketpreis. Keine Gebühr obendrauf.', 27.0],
  ['v08', [15, 15], 'Das Geld geht direkt an die Organisation.', 30.75],
  ['v09', [16, 19], 'Keine Werbung. Keine Tracker. Und deine Daten werden nie und nimmer verkauft.', 33.6],
  ['v10', [20, 20], 'Manche Räume brauchen ein bisschen mehr Achtsamkeit.', 39.9],
  ['v11', [21, 22], 'Wie ein Rope-Workshop in Wien, der auf Vertrauen baut.', 43.25],
  ['v12', [23, 23], 'Bevor also jemand ein Ticket bekommt, gibt es ein paar Fragen.', 46.6],
  ['v13', [24, 26], 'Zur Erfahrung, zu den Konsens-Regeln, und warum man kommen möchte.', 50.5],
  ['v14', [27, 27], 'Dann liest ein echter Mensch jede Antwort und entscheidet.', 57.3],
  ['v15', [28, 29], 'Und dann: Du bist dabei.', 63.2],
  ['v16', [30, 31], 'Alle im Raum haben sich entschieden, hier zu sein. Und wurden mit Achtsamkeit empfangen.', 66.2],
  ['v17a', [32, 32], 'Potlucks.', 'beat:156'],
  ['v17b', [33, 33], 'Mitgliederpreise.', 'beat:159'],
  ['v17c', [34, 34], 'Zahl, was du kannst.', 'beat:162'],
  ['v17d', [35, 35], 'Wartelisten.', 'beat:166'],
  ['v17e', [36, 36], 'Check-in am Einlass.', 'beat:170'],
  ['v17f', [37, 37], 'In sechs Sprachen.', 'beat:173'],
  ['v18', [38, 39], 'Revel. Die kostenlose, quelloffene Event-Plattform für Communities, Vereine und unabhängige Veranstaltungsorte.', 84.0],
  ['v20', [40, 40], 'Let’s revel.', 91.8],
];
// Pickups recorded separately: { key: { file, words, from, to, gain } } — source range in
// that file, gain in dB to sit at the take's level (the pickup session ran ~3–5 dB hotter).
// A phrase uses one by naming its key among its parts (see PHRASES).
const PICKUPS = {
  // Draft 03 (2026-10-14): voice_overs/Draft 03/revel-corrections-14102026.wav
  'd03-money': { file: 'audio/vo-pickups-d03.wav', words: 'data/vo-pickups-d03.words.json', from: 0.11, to: 2.75, gain: -3 },
  'd03-there': { file: 'audio/vo-pickups-d03.wav', words: 'data/vo-pickups-d03.words.json', from: 3.38, to: 6.0, gain: -5 },
  'd03-tagline-de': { file: 'audio/vo-pickups-d03.wav', words: 'data/vo-pickups-d03.words.json', from: 6.97, to: 13.715, gain: -2.5 },
};
const PICKUP_LINES = {
  en: { v08: ['d03-money'], v16: ['d03-there', [32, 32]] },   // "…chose to be there." + the take's "And was welcomed with care."
  de: { v18: [[38, 38], 'd03-tagline-de'] },                  // the take's „Revel." + the website's tagline
}[LANG] || {};

if (process.argv.includes('--segs')) {
  segs.forEach(([a, b], i) => console.log(String(i).padStart(2), a.toFixed(2), b.toFixed(2),
    words.filter(w => w.start >= a - 0.08 && w.start < b).map(w => w.text.trim()).join(' ')));
  process.exit(0);
}

const HEAD = 0.06, TAIL = 0.10; // handles: start just before the word, keep the decay
// a source range: segments [a, b] of the take, or a pickup key
const source = part => {
  if (typeof part === 'string') {
    const p = PICKUPS[part]; if (!p) throw new Error(`unknown pickup ${part}`);
    return { file: p.file, a: p.from, b: p.to, gain: p.gain || 0, pickup: true, words: JSON.parse(fs.readFileSync(`${ROOT}${p.words}`, 'utf8')) };
  }
  let a = Math.max(0, segs[part[0]][0] - HEAD), b = Math.min(takeEnd, segs[part[1]][1] + TAIL);
  // never reach into the neighbouring phrase
  if (part[0] > 0) a = Math.max(a, segs[part[0] - 1][1] + 0.02);
  if (part[1] < segs.length - 1) b = Math.min(b, segs[part[1] + 1][0] - 0.02);
  return { file: VO, a, b, gain: 0, words };
};
const JOIN = 0.14; // silence between spliced parts of one phrase (+ the handles ≈ 0.3 s between words)
const lines = PHRASES[LANG].map(([id, range, text, at, gapDur]) => {
  const start = typeof at === 'string' ? +(musicToFilm(beat(+at.split(':')[1])) + 0.06).toFixed(3) : at;
  const parts = PICKUP_LINES[id] || (range && [range]);
  if (!parts) return { id, text, start, dur: gapDur, end: +(start + gapDur).toFixed(3), gap: true, words: [], clips: [] };
  const clips = []; let ws = [], t = start;
  for (const src of parts.map(source)) {
    const { file, a, b, gain } = src, dur = +(b - a).toFixed(3);
    clips.push({ file, mediaStart: +a.toFixed(3), start: +t.toFixed(3), dur, volume: +(10 ** (gain / 20)).toFixed(3) });
    // a word belongs to the phrase its midpoint falls in; a pickup range holds every word it
    // overlaps (the recogniser's word edges run long into the silence around a pickup)
    const inside = src.pickup ? w => w.end > a + 0.05 && w.start < b - 0.05 : w => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 < b;
    ws.push(...src.words.filter(inside).map(w => ({
      w: w.text.trim(), s: +(t + Math.max(0, w.start - a)).toFixed(3), e: +(t + Math.min(b, w.end) - a).toFixed(3),
    })));
    t += dur + JOIN;
  }
  const end = +(t - JOIN).toFixed(3);
  // carry the script's spelling when the word counts line up (the recogniser hears "Buy" for "Buyers")
  const canon = text.split(/\s+/);
  if (canon.length === ws.length) ws = ws.map((w, i) => ({ ...w, w: canon[i] }));
  else console.warn('WORDS', id, `screen ${canon.length} ≠ spoken ${ws.length}`);
  return { id, text, start, dur: +(end - start).toFixed(3), end, words: ws, clips };
});

for (let i = 1; i < lines.length; i++)
  if (lines[i].start < lines[i - 1].end + 0.2) console.warn('TIGHT', lines[i - 1].id, lines[i - 1].end, '→', lines[i].id, lines[i].start);

const montage = [156, 159, 162, 166, 170, 173].map(k => musicToFilm(beat(k)));
const out = { lang: LANG, duration: DURATION, fps: 60, sections: S, music: MUSIC, montage, montageEnd: musicToFilm(beat(176)),
  musicBeat: PERIOD, lines };
fs.writeFileSync(`${ROOT}data/timing.${LANG}.json`, JSON.stringify(out, null, 1));
fs.writeFileSync(`${ROOT}data/timing.${LANG}.js`, 'window.TIMING = ' + JSON.stringify(out) + ';\n');
console.log('sections', S);
console.log('music', MUSIC.map(m => `${m.id} film ${m.start}+${m.dur} ← music ${m.from}`).join(' | '));
for (const l of lines) console.log(l.id.padEnd(5), String(l.start).padStart(6), '→', String(l.end).padStart(6), l.gap ? '[GAP]' : '', '|', l.words.map(w => w.w).join(' '));
