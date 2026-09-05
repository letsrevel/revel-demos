#!/usr/bin/env node
/*
 * Purge cached TTS clips for one demo (or all demos).
 *
 *   node scripts/purge-clips.mjs <demo>     # e.g. clip-intro
 *   node scripts/purge-clips.mjs --all
 *
 * WHY THIS EXISTS: argo caches TTS clips at .argo/<demo>/clips/, keyed on the
 * scene TEXT ONLY — not on the engine or the voice. So switching ARGO_TTS
 * (kokoro → elevenlabs) or ARGO_VOICE reuses the OLD audio and silently
 * produces a video in the wrong voice. Always purge before a re-voice.
 */
import { rmSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argoDir = resolve(root, '.argo');
const args = process.argv.slice(2);

if (args.length === 0) {
	console.error('usage: node scripts/purge-clips.mjs <demo> [<demo> ...] | --all');
	process.exit(1);
}

if (!existsSync(argoDir)) {
	console.log('Nothing to purge — .argo/ does not exist yet.');
	process.exit(0);
}

const demos = args.includes('--all')
	? readdirSync(argoDir, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name)
	: args;

let purged = 0;
for (const demo of demos) {
	const clips = resolve(argoDir, demo, 'clips');
	if (existsSync(clips)) {
		rmSync(clips, { recursive: true, force: true });
		console.log(`purged ${clips}`);
		purged++;
	} else {
		console.log(`no cached clips for "${demo}" (${clips})`);
	}
}
console.log(`\nPurged ${purged} clip cache(s). Re-run the pipeline to re-synthesize.`);
