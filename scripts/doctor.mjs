#!/usr/bin/env node
/*
 * Environment doctor — run this FIRST, every session, before recording.
 *
 *   npm run doctor
 *
 * Checks the four things that silently ruin a take:
 *   1. host tools (node, ffmpeg, playwright chromium)
 *   2. the demo stack (frontend :5173, API :8000, Mailpit :8025)
 *   3. DEMO_MODE + the fake OIDC provider + wallet flags on /api/version
 *   4. which TTS engine is selected and whether it can actually run
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const API = process.env.API_URL || 'http://localhost:8000';
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';

let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const warn = (m) => console.log(`  warn  ${m}`);
const bad = (m) => {
	console.log(`  FAIL  ${m}`);
	failures++;
};

function which(cmd) {
	try {
		return execFileSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
}

async function head(url, { json = false } = {}) {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		return { status: res.status, body: json ? await res.json() : null };
	} catch (e) {
		return { status: 0, error: String(e.message || e) };
	}
}

console.log('\n== host tools ==');
const [major] = process.versions.node.split('.').map(Number);
major >= 20 ? ok(`node ${process.version}`) : bad(`node ${process.version} — argo needs >= 20`);
which('ffmpeg') ? ok('ffmpeg') : bad('ffmpeg missing — `sudo apt install ffmpeg`');
existsSync(resolve(root, 'node_modules/@argo-video/cli'))
	? ok('@argo-video/cli installed')
	: bad('run `npm install`');
existsSync(resolve(root, 'node_modules/kokoro-js'))
	? ok('kokoro-js installed (default TTS engine)')
	: bad('kokoro-js missing — run `npm install`');

console.log('\n== demo stack ==');
const fe = await head(BASE);
fe.status === 200 ? ok(`frontend ${BASE} → 200`) : bad(`frontend ${BASE} → ${fe.status || fe.error}`);

const ver = await head(`${API}/api/version`, { json: true });
if (ver.status !== 200) {
	bad(`API ${API}/api/version → ${ver.status || ver.error}  (docker compose up -d)`);
} else {
	const v = ver.body;
	ok(`API ${API} → version ${v.version}`);
	v.demo ? ok('DEMO_MODE on (login page shows the demo-account picker)') : warn('DEMO_MODE OFF — set DEMO_MODE=True in .env and recreate the backend');
	const providers = v.sso_providers || [];
	if (providers.some((p) => p.key === 'google')) {
		ok('"Continue with Google" button will render (fake provider configured)');
	} else if (providers.length) {
		warn(
			`sso providers are ${providers.map((p) => p.key).join(', ')} but not "google" — ` +
				'the Google-branded button needs the key to be exactly `google` (see OIDC_* in docker-compose.yml)'
		);
	} else {
		warn(
			'no SSO providers — "Continue with Google" will NOT render. ' +
				'Check the OIDC_* values in docker-compose.yml'
		);
	}
	console.log(
		'  note  the Google button is behind the "Show login form" toggle on /login ' +
			'(demo mode shows the account picker first); on /register it needs no toggle, ' +
			'but dismiss the "This is a demo" dialog with "Register anyway" first'
	);
	console.log('  note  wallet buttons cannot be checked from here — open a ticket in the app to confirm');
}

const mp = await head(`${MAILPIT}/api/v1/info`);
mp.status === 200 ? ok(`mailpit ${MAILPIT} → 200`) : bad(`mailpit ${MAILPIT} → ${mp.status || mp.error}`);

console.log('\n== TTS ==');
const engine = (process.env.ARGO_TTS || 'kokoro').toLowerCase();
if (engine === 'kokoro') {
	ok('engine: kokoro (local, free, cross-platform) — the default');
} else if (engine === 'elevenlabs') {
	let key = process.env.ELEVENLABS_API_KEY;
	if (!key && existsSync(resolve(root, '.env'))) {
		key = readFileSync(resolve(root, '.env'), 'utf8').match(/^ELEVENLABS_API_KEY\s*=\s*(.+)$/m)?.[1];
	}
	key && !key.includes('your-key')
		? ok('engine: elevenlabs — API key present')
		: bad('engine: elevenlabs but no ELEVENLABS_API_KEY (put it in .env)');
	warn('ElevenLabs is BILLED PER CHARACTER — only for the final re-voice');
} else if (engine === 'mlx') {
	if (process.platform !== 'darwin') bad('engine: mlx is Apple-Silicon only — use kokoro on Linux');
	const s = await head(`${process.env.MLX_AUDIO_URL || 'http://localhost:9333'}/docs`);
	s.status ? ok('mlx-audio server reachable') : bad('mlx-audio server not running on :9333');
} else {
	bad(`unknown ARGO_TTS="${engine}" — use kokoro | elevenlabs | mlx`);
}

console.log(
	failures === 0
		? '\nAll good. Next: npm run pipeline -- clip-intro\n'
		: `\n${failures} check(s) failed — fix them before recording.\n`
);
process.exit(failures === 0 ? 0 : 1);
