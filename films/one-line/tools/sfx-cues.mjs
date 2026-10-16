// Sound-design cue list → data/sfx.json. Times come from his words (timing.json)
// where the picture is cut to them, and from the scene layers' own beat constants
// otherwise (kept in step with compositions/* by hand — see the notes per block).
//
//   node tools/sfx-cues.mjs <lang> && uv run --with numpy --with scipy --with soundfile python tools/sfx.py <lang>
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const LANG = process.argv[2] || 'en';
const T = JSON.parse(fs.readFileSync(`${ROOT}data/timing.${LANG}.json`, 'utf8'));
// the spoken word each cue hangs on, per language (keys are the English words)
const WORDS = {
  people: { de: 'Leute' }, together: { de: 'zusammenzukommen' }, data: { de: 'Daten' },
  read: { de: 'lesen' }, run: { de: 'betreiben' }, better: { de: 'besser' }, source: { de: 'Source' },
  fee: { de: 'Gebühr' }, never: { de: 'nie' }, ever: { de: 'nimmer' }, call: { de: 'entscheidet' },
  "you're": { de: 'Du' }, revel: { de: 0 },
};
const L = Object.fromEntries(T.lines.map(l => [l.id, l]));
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const w = (id, word) => {
  const l = L[id]; if (!l) throw new Error(id);
  if (LANG !== 'en' && typeof word === 'string' && WORDS[word] && LANG in WORDS[word]) word = WORDS[word][LANG];
  if (typeof word === 'number') return l.words[word].s;
  const x = l.words.find(q => norm(q.w) === norm(word)); if (!x) throw new Error(`${id}:${word}`);
  return x.s;
};
const S = T.sections, M = T.montage;
// Beats the picture is cut to that are not plain word starts, per language, as the scene
// layers report them (rope/s1-origins.js, compositions/s2–s3). Re-sync after retiming a layer.
const BEATS = {
  en: { leave: [6.96, 7.98, 9.18, 10.38], close: [7.8, 8.9, 10.1, 11.3],
        tags: [[15.12, 15.26], [15.62, 15.76], [16.07, 16.21]], beads: 17.0,
        coin: [31.4, 32.75], adTags: [33.86, 34.01, 34.66, 34.81, 34.96], und: null,
        q1: 51.33, q2: 52.7, type: 53.86, submit: 55.96 },
  de: { leave: [7.026, 8.425, 9.465, 10.665], close: [8.225, 9.185, 10.385, 11.985],
        tags: [[14.862, 15.002], [15.362, 15.502], [15.892, 16.032]], beads: 16.902,
        coin: [31.45, 32.95], adTags: [33.94, 34.09, 34.82, 34.97, 35.12], und: 37.11,
        q1: 51.174, q2: 52.744, type: 53.624, submit: 55.724 },
}[LANG] || null;
if (!BEATS) throw new Error(`no beat table for ${LANG}`);
const B = BEATS;
const cues = [];
const add = (t, kind, gain = 1, extra = {}) => cues.push({ t: +t.toFixed(3), kind, gain, ...extra });

// ---- s1 origins (station / tag times: rope/s1-origins.js constants)
add(0.3, 'ropeDraw', 0.45, { dur: 3.6 });
add(w('v02', 'people') + 0.02, 'blip', 0.55, { note: 62 }); add(w('v02', 'people') + 0.14, 'blip', 0.55, { note: 66 }); add(w('v02', 'people') + 0.26, 'blip', 0.55, { note: 69 });
add(5.2, 'ropeDraw', 0.35, { dur: 1.8 });
add(w('v02', 'together') + 0.05, 'close', 0.6);
for (const ts of B.leave) add(ts, 'swish', 0.45);      // rope head leaves for the next station (rope/s1-origins.js)
for (const [i, ts] of B.close.entries()) {                    // loop closes → that station's people pop in
  add(ts, 'close', 0.35); for (let k = 0; k < 3; k++) add(ts + 0.05 + k * 0.07, 'blip', 0.35, { note: [64, 67, 71, 74][i] + [0, 4, 7][k] });
}
add(S.platforms, 'tension', 0.5, { dur: 6.0 });
for (const [drop, bite] of B.tags) { add(drop, 'stamp', 0.75); add(bite, 'ropeSnap', 0.85); } // tag clamps, rope bites
for (let i = 0; i < 8; i++) add(B.beads + i * 0.11, 'datatick', 0.8);
add(w('v04', 'data'), 'glitch', 0.7, { dur: 0.5 });

// ---- s2 different (beat marks: rope/s2-different.js window.S2)
add(19.45, 'riser', 0.7, { dur: S.drop - 19.45 });
add(S.drop, 'boom', 0.8); add(S.drop + 0.02, 'chime', 0.55);
add(22.0, 'whoosh', 0.55, { dur: 0.35 });
for (const word of ['read', 'run', 'better']) add(w('v06', word), 'slam', 0.35);
add(w('v06', 'source') + 0.5, 'pop', 0.6);
add(26.75, 'swish', 0.5);
add(w('v07', 'fee'), 'ding', 0.7);
add(30.5, 'pop', 0.5); add(B.coin[0], 'coinTravel', 0.8, { dur: B.coin[1] - B.coin[0] }); add(B.coin[1], 'chime', 0.5);
for (const ts of B.adTags) add(ts, 'pop', 0.55);
add(w('v09', 'never'), 'slam', 0.9); add(w('v09', 'ever'), 'slam', 0.75);
if (B.und) add(B.und, 'slam', 0.35);   // „nie UND nimmer" — the soft middle hit

// ---- s3 care (knot / answer beats: compositions/s3-care.html window.S3)
add(39.5, 'ropeDraw', 0.3, { dur: 3.2 });
add(43.5, 'swish', 0.3);
add(46.0, 'ropeDraw', 0.35, { dur: 1.6 }); add(47.6, 'ropeTighten', 0.6);
add(B.q1, 'click', 0.8); add(B.q1 + 0.03, 'ropeTighten', 0.45);
add(B.q2, 'click', 0.8);
add(B.type, 'typing', 0.8, { dur: 1.75, chars: 70 });
add(B.submit, 'click', 0.8); add(B.submit + 0.04, 'ding', 0.6); add(B.submit + 0.06, 'ropeTighten', 0.5);
add(56.3, 'whoosh', 0.6, { dur: 0.45 });

// ---- s4 in
add(57.05, 'swish', 0.4);
add(w('v14', 'call'), 'click', 0.9); add(w('v14', 'call') + 0.08, 'chime', 0.55);
add(63.12, 'pop', 0.7); add(w('v15', "you're"), 'softpop', 0.6);
add(63.3, 'riser', 0.55, { dur: S.climax - 63.3 });
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
for (let i = 0; i < 24; i++) add(S.climax + i * 0.0545, 'blip', 0.32, { note: PENTA[(i * 3) % PENTA.length] });

// ---- s5 everything (panel beats = FILM.T.montage; micro-interactions: compositions/s5-everything.html)
for (const ts of M) add(ts - 0.02, 'stamp', 0.4);
add(M[0] + 0.55, 'click', 0.7); add(M[0] + 0.62, 'ding', 0.45);
for (let i = 0; i < 6; i++) add(M[1] + 0.35 + i * 0.07, 'datatick', 0.6);
add(M[1] + 0.85, 'pop', 0.45);
add(M[2] + 0.3, 'coinTravel', 0.5, { dur: 0.7 }); add(M[2] + 1.05, 'pop', 0.45);
add(M[3] + 1.1, 'ding', 0.5); add(M[3] + 1.4, 'click', 0.7);
add(M[4] + 0.25, 'coinTravel', 0.4, { dur: 0.5 }); add(M[4] + 0.8, 'ding', 0.6);
for (let i = 0; i < 6; i++) add(M[5] + 0.1 + i * 0.26, 'blip', 0.3, { note: [74, 76, 78, 81, 83, 86][i] });
add(83.2, 'ropeDraw', 0.4, { dur: 1.2 });
add(w('v18', 'revel'), 'chime', 0.55);
add(w('v20', 0), 'softpop', 0.35);

cues.sort((a, b) => a.t - b.t);
fs.writeFileSync(`${ROOT}data/sfx.${LANG}.json`, JSON.stringify(cues, null, 1));
console.log(cues.length, 'cues →', `data/sfx.${LANG}.json`);
