// Sound-design cue list → data/sfx.json. Times come from his words (timing.json)
// where the picture is cut to them, and from the scene layers' own beat constants
// otherwise (kept in step with compositions/* by hand — see the notes per block).
//
//   node tools/sfx-cues.mjs && uv run --with numpy --with scipy --with soundfile python tools/sfx.py
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const T = JSON.parse(fs.readFileSync(`${ROOT}data/timing.json`, 'utf8'));
const L = Object.fromEntries(T.lines.map(l => [l.id, l]));
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const w = (id, word) => {
  const l = L[id]; if (!l) throw new Error(id);
  if (typeof word === 'number') return l.words[word].s;
  const x = l.words.find(q => norm(q.w) === norm(word)); if (!x) throw new Error(`${id}:${word}`);
  return x.s;
};
const S = T.sections, M = T.montage;
const cues = [];
const add = (t, kind, gain = 1, extra = {}) => cues.push({ t: +t.toFixed(3), kind, gain, ...extra });

// ---- s1 origins (station / tag times: rope/s1-origins.js constants)
add(0.3, 'ropeDraw', 0.45, { dur: 3.6 });
add(w('v02', 'people') + 0.02, 'blip', 0.55, { note: 62 }); add(w('v02', 'people') + 0.14, 'blip', 0.55, { note: 66 }); add(w('v02', 'people') + 0.26, 'blip', 0.55, { note: 69 });
add(5.2, 'ropeDraw', 0.35, { dur: 1.8 });
add(w('v02', 'together') + 0.05, 'close', 0.6);
for (const ts of [6.96, 7.98, 9.18, 10.38]) add(ts, 'swish', 0.45);      // rope head leaves for the next station (rope/s1-origins.js)
for (const [i, ts] of [7.8, 8.9, 10.1, 11.3].entries()) {                    // loop closes → that station's people pop in
  add(ts, 'close', 0.35); for (let k = 0; k < 3; k++) add(ts + 0.05 + k * 0.07, 'blip', 0.35, { note: [64, 67, 71, 74][i] + [0, 4, 7][k] });
}
add(S.platforms, 'tension', 0.5, { dur: 6.0 });
for (const [drop, bite] of [[15.12, 15.26], [15.62, 15.76], [16.07, 16.21]]) { add(drop, 'stamp', 0.75); add(bite, 'ropeSnap', 0.85); } // tag clamps, rope bites
for (let i = 0; i < 8; i++) add(17.0 + i * 0.11, 'datatick', 0.8);
add(w('v04', 'data'), 'glitch', 0.7, { dur: 0.5 });

// ---- s2 different (beat marks: rope/s2-different.js window.S2)
add(19.45, 'riser', 0.7, { dur: S.drop - 19.45 });
add(S.drop, 'boom', 0.8); add(S.drop + 0.02, 'chime', 0.55);
add(22.0, 'whoosh', 0.55, { dur: 0.35 });
for (const word of ['read', 'run', 'better']) add(w('v06', word), 'slam', 0.35);
add(w('v06', 'source') + 0.5, 'pop', 0.6);
add(26.75, 'swish', 0.5);
add(w('v07', 'fee'), 'ding', 0.7);
add(30.6, 'pop', 0.5); add(31.0, 'coinTravel', 0.8, { dur: 1.4 }); add(32.45, 'chime', 0.5);
for (const ts of [33.95, 34.10, 34.75, 34.90, 35.05]) add(ts, 'pop', 0.55);
add(w('v09', 'never'), 'slam', 0.9); add(w('v09', 'ever'), 'slam', 0.75);

// ---- s3 care (knot / answer beats: compositions/s3-care.html window.S3)
add(39.5, 'ropeDraw', 0.3, { dur: 3.2 });
add(43.5, 'swish', 0.3);
add(46.0, 'ropeDraw', 0.35, { dur: 1.6 }); add(47.6, 'ropeTighten', 0.6);
add(51.33, 'click', 0.8); add(51.36, 'ropeTighten', 0.45);
add(52.7, 'click', 0.8);
add(53.86, 'typing', 0.8, { dur: 1.75, chars: 70 });
add(55.96, 'click', 0.8); add(56.0, 'ding', 0.6); add(56.02, 'ropeTighten', 0.5);
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
fs.writeFileSync(`${ROOT}data/sfx.json`, JSON.stringify(cues, null, 1));
console.log(cues.length, 'cues →', 'data/sfx.json');
