// Quick listening draft of the soundtrack, straight from data/timing.json with
// ffmpeg: the three music passes with their splices, the narration phrases, and
// a sidechain duck standing in for the HyperFrames carve. Not the final mix —
// it exists so the cuts and pacing can be judged by ear before any render.
//
//   node tools/audio-preview.mjs  → renders/audio-preview.m4a
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const T = JSON.parse(fs.readFileSync(`${ROOT}data/timing.json`, 'utf8'));
fs.mkdirSync(`${ROOT}renders`, { recursive: true });

const inputs = ['-i', `${ROOT}audio/score.mp3`, '-i', `${ROOT}audio/vo-${T.lang}.wav`];
const f = [];
const ms = s => Math.round(s * 1000);

// music passes (same envelopes as build-index: 0.8 s head, m2 out on the bar-43 breath, 2 s tail)
const mus = T.music.map((m, i) => {
  const last = i === T.music.length - 1, ring = 0;
  const dur = last ? Math.min(m.dur, T.duration - m.start) : m.dur + ring + 0.03;
  const fin = i === 0 ? 0.8 : i === 2 ? 0.12 : 0.03, fout = last ? 2.0 : i === 1 ? 0.25 : 0.03;
  f.push(`[0:a]atrim=start=${m.from}:duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,` +
    `afade=t=in:d=${fin},afade=t=out:st=${(dur - fout).toFixed(3)}:d=${fout},volume=0.55,adelay=${ms(m.start)}|${ms(m.start)}[m${i}]`);
  return `[m${i}]`;
});
f.push(`${mus.join('')}amix=inputs=${mus.length}:normalize=0:duration=longest[bed]`);

// narration phrases
const vo = T.lines.filter(l => !l.gap).map((l, i) => {
  f.push(`[1:a]atrim=start=${l.mediaStart}:duration=${l.dur},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,` +
    `afade=t=in:d=0.01,afade=t=out:st=${(l.dur - 0.04).toFixed(3)}:d=0.04,volume=1.8,adelay=${ms(l.start)}|${ms(l.start)}[v${i}]`);
  return `[v${i}]`;
});
f.push(`${vo.join('')}amix=inputs=${vo.length}:normalize=0:duration=longest,highpass=f=80,acompressor=threshold=0.1:ratio=2.5:attack=12:release=220[voice]`);
f.push(`[voice]asplit=2[vk][vm]`);
// duck the bed under the voice (≈ the carve's level half)
f.push(`[bed][vk]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=450:makeup=1[ducked]`);
f.push(`[ducked][vm]amix=inputs=2:normalize=0:duration=longest,atrim=duration=${T.duration},loudnorm=I=-14:TP=-1.5:LRA=11[out]`);

const out = `${ROOT}renders/audio-preview.m4a`;
execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', f.join(';'), '-map', '[out]',
  '-c:a', 'aac', '-b:a', '256k', out], { stdio: 'inherit' });
console.log('wrote', out);
