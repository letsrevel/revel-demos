#!/usr/bin/env node
/*
 * `argo pipeline`, then file the result into its videos/ folder.
 *
 *   npm run pipeline -- <demo-name> [argo flags]
 */
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileVideo } from './file-videos.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('-'));

const child = spawn('npx', ['argo', 'pipeline', ...args], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => {
	if (code === 0 && name) fileVideo(name);
	process.exit(code ?? 1);
});
