#!/usr/bin/env node
/*
 * File finished renders into the videos/ folders, so the folder holds videos
 * and not argo's sidecars.
 *
 *   node scripts/file-videos.mjs [<name> ...]
 *
 * argo writes <name>.mp4 + .srt + .vtt + .meta.json into videos/.renders/
 * (argo.config.mjs). This moves each one to its folder:
 *
 *   ep-*            → videos/in-depth/
 *   the tour clips  → videos/tour/
 *   anything else   → videos/clips/
 *
 * The .mp4 sits at the top of the folder, subtitles go to subtitles/, and
 * argo's .meta.json to the hidden .meta/. A new render replaces the old one.
 * With no names, everything waiting in videos/.renders/ is filed.
 */
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const videos = resolve(root, 'videos');
const staging = resolve(videos, '.renders');

export const TOUR = new Set([
	'revel-tour',
	'clip-intro',
	'clip-org-membership',
	'clip-gate-review',
	'clip-dietary-potluck',
	'clip-much-more',
	'clip-outro'
]);

export function folderFor(name) {
	if (name.startsWith('ep-')) return 'in-depth';
	if (TOUR.has(name)) return 'tour';
	return 'clips';
}

const SIDECARS = [
	['.mp4', ''],
	['.srt', 'subtitles'],
	['.vtt', 'subtitles'],
	['.meta.json', '.meta']
];

export function fileVideo(name) {
	const moved = [];
	for (const [ext, sub] of SIDECARS) {
		const from = resolve(staging, `${name}${ext}`);
		if (!existsSync(from)) continue;
		const dir = resolve(videos, folderFor(name), sub);
		mkdirSync(dir, { recursive: true });
		renameSync(from, resolve(dir, `${name}${ext}`));
		moved.push(ext);
	}
	if (moved.length) console.log(`[file-videos] ${name} → videos/${folderFor(name)}/`);
	return moved.length > 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	let names = process.argv.slice(2);
	if (names.length === 0) {
		names = existsSync(staging)
			? [...new Set(readdirSync(staging).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)))]
			: [];
	}
	for (const n of names) fileVideo(n);
}
