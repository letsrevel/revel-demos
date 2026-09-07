#!/usr/bin/env node
/*
 * Render one "Revel, in depth" episode into videos/in-depth/, through a small
 * concurrency gate so several authors can render at once without three
 * recorders fighting one emulated Docker stack.
 *
 *   node scripts/render-episode.mjs <demo-name>
 *
 * Holds one of RENDER_SLOTS (default 2) slots under .argo/.slots/ for the
 * duration of `argo pipeline`. A slot whose owner process has died is
 * reclaimed automatically.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name) {
	console.error('usage: node scripts/render-episode.mjs <demo-name>');
	process.exit(1);
}
const SLOTS = Number(process.env.RENDER_SLOTS || 2);
const slotsDir = resolve(root, '.argo', '.slots');
mkdirSync(slotsDir, { recursive: true });

const alive = (pid) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function acquire() {
	for (;;) {
		for (let i = 0; i < SLOTS; i++) {
			const slot = resolve(slotsDir, `slot-${i}`);
			const pidFile = resolve(slot, 'pid');
			if (existsSync(slot)) {
				const pid = Number(readFileSync(pidFile, 'utf8').trim() || 0);
				if (pid && alive(pid)) continue;
				rmSync(slot, { recursive: true, force: true });
			}
			try {
				mkdirSync(slot);
				writeFileSync(pidFile, String(process.pid));
				return slot;
			} catch {
				/* lost the race */
			}
		}
		await sleep(5000);
	}
}

const t0 = Date.now();
console.log(`[render-episode] ${name}: waiting for a slot (${SLOTS} max)…`);
const slot = await acquire();
console.log(`[render-episode] ${name}: slot acquired after ${Math.round((Date.now() - t0) / 1000)}s`);
const release = () => rmSync(slot, { recursive: true, force: true });
process.on('exit', release);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const child = spawn('npx', ['argo', 'pipeline', name], {
	cwd: root,
	stdio: 'inherit',
	env: { ...process.env, ARGO_OUT: process.env.ARGO_OUT || 'videos/in-depth' }
});
child.on('exit', (code) => {
	release();
	process.exit(code ?? 1);
});
