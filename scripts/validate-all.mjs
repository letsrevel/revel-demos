#!/usr/bin/env node
/*
 * Run `argo validate` over every demo in demos/ and summarize.
 *   npm run validate:all
 * Validation is offline: it checks that every narration.mark() in the script
 * has a matching scene in the manifest (and vice versa). It does NOT need the
 * app, a browser, or TTS — so run it after every edit, it costs a second.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const demos = readdirSync(resolve(root, 'demos'))
	.filter((f) => f.endsWith('.scenes.json'))
	.map((f) => f.replace(/\.scenes\.json$/, ''))
	.sort();

const failed = [];
for (const demo of demos) {
	try {
		execFileSync('npx', ['argo', 'validate', demo], { cwd: root, stdio: 'pipe' });
		console.log(`  ok    ${demo}`);
	} catch (e) {
		failed.push(demo);
		console.log(`  FAIL  ${demo}`);
		console.log(String(e.stdout || '') + String(e.stderr || ''));
	}
}
console.log(`\n${demos.length - failed.length}/${demos.length} demos valid.`);
process.exit(failed.length === 0 ? 0 : 1);
