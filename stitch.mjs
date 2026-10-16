#!/usr/bin/env node
// Stitch rendered clips into one video.
//   node stitch.mjs <out.mp4> <clipName> [<clipName> ...]
// Clip names are looked up in videos/tour, videos/clips and videos/in-depth;
// the result lands in the first clip's folder. All clips share the same recording
// profile (1920x1080@30, H.264/AAC via argo), so we normalize + concat with
// the ffmpeg concat filter (re-encode, safe across argo versions).
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [out, ...names] = process.argv.slice(2);
if (!out || names.length === 0) {
	console.error('usage: node stitch.mjs <out.mp4> <clipName> [<clipName> ...]');
	process.exit(1);
}

const FOLDERS = ['tour', 'clips', 'in-depth'];
const inputs = names.map((n) => {
	const p = FOLDERS.map((f) => resolve(here, 'videos', f, `${n}.mp4`)).find(existsSync);
	if (!p) {
		console.error(`missing clip: ${n}.mp4 in videos/{${FOLDERS}} — render it first (npm run pipeline -- ${n})`);
		process.exit(1);
	}
	return p;
});
const outPath = resolve(dirname(inputs[0]), out);

const args = ['-y'];
for (const p of inputs) args.push('-i', p);
const norm = inputs
	.map(
		(_, i) =>
			`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1,setsar=1,fps=30,format=yuv420p[v${i}];` +
			`[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`
	)
	.join(';');
const pairs = inputs.map((_, i) => `[v${i}][a${i}]`).join('');
args.push(
	'-filter_complex',
	`${norm};${pairs}concat=n=${inputs.length}:v=1:a=1[v][a]`,
	'-map',
	'[v]',
	'-map',
	'[a]',
	'-c:v',
	'libx264',
	'-preset',
	'slow',
	'-crf',
	'18',
	'-c:a',
	'aac',
	'-b:a',
	'192k',
	'-movflags',
	'+faststart',
	outPath
);

execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`\nStitched ${names.length} clips → ${outPath}`);
