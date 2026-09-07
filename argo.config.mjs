import { defineConfig, engines } from '@argo-video/cli';
import { readFileSync } from 'node:fs';

// argo does not load .env itself — hydrate process.env from ./.env.
// NEVER commit .env (it holds the ElevenLabs key); copy .env.example instead.
try {
	for (const line of readFileSync(new URL('./.env', import.meta.url), 'utf8').split('\n')) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
	}
} catch {
	// no .env — cloud engines will require the key in the shell env
}

/*
 * TTS engine selection — see CLAUDE.md § "Voice & TTS".
 *
 *   (unset) | kokoro  Kokoro-82M via kokoro-js. Pure Node + ONNX runtime, so
 *                     it runs anywhere (Ubuntu included), free, no API key.
 *                     THE DEFAULT — draft every clip with this.
 *   elevenlabs        ElevenLabs, voice "Will". Billed per character.
 *                     For the FINAL re-voice, once narration is frozen.
 *   mlx               mlx-audio / Qwen3-TTS on localhost:9333.
 *                     Apple-Silicon ONLY — optional, macOS authors.
 *
 * The clip cache (.argo/<demo>/clips) is keyed on scene TEXT, not on the
 * engine, so switching engines does NOT invalidate it. Purge before a
 * re-voice:  npm run purge-clips -- <demo>
 */
const tts = (process.env.ARGO_TTS || 'kokoro').toLowerCase();

const ENGINES = {
	kokoro: () => ({
		// fp32 is the accurate weight set. The default q8 quantization slurs
		// consonants on product nouns ("Revel", "RSVP", "potluck").
		engine: engines.kokoro({ dtype: 'fp32' }),
		voice: 'af_heart',
	}),
	elevenlabs: () => ({
		engine: engines.elevenlabs({ model: 'eleven_multilingual_v2' }),
		// Will — relaxed optimist, picked by ear from the audition roster.
		// argo's own default (Rachel) is a shared "library" voice that 402s
		// `paid_plan_required` on most accounts; only use roster voices.
		voice: 'bIHbv24MWmeRgasZH58o',
	}),
	mlx: () => ({
		// macOS / Apple Silicon only. Start the server first:
		//   .venv/bin/python3 -m mlx_audio.server --port 9333
		// argo cannot health-check it — a dead server fails at tts time.
		engine: engines.mlxAudio({
			baseUrl: process.env.MLX_AUDIO_URL || 'http://localhost:9333',
			model: 'mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16',
			// Runaway guard: a short outro line once came back as 96s of
			// audio. ~12 codec tokens/sec → 300 ≈ a 25s ceiling per scene.
			maxTokens: 300,
		}),
		voice: 'aiden',
	}),
};

const selected = ENGINES[tts];
if (!selected) {
	throw new Error(
		`Unknown ARGO_TTS="${tts}". Use one of: ${Object.keys(ENGINES).join(', ')} (default: kokoro)`
	);
}
const { engine, voice } = selected();

export default defineConfig({
	baseURL: process.env.BASE_URL || 'http://localhost:5173',
	demosDir: 'demos',
	// ARGO_OUT lets a series render into its own folder (videos/in-depth for
	// the "Revel, in depth" episodes) without touching the standing clips.
	outputDir: process.env.ARGO_OUT || 'videos',
	tts: {
		engine,
		// ARGO_VOICE overrides for either engine (ElevenLabs voices are IDs).
		defaultVoice: process.env.ARGO_VOICE || voice,
		defaultSpeed: 1.0,
	},
	video: {
		width: 1920,
		height: 1080,
		fps: 30,
		browser: 'chromium',
		captureMode: 'jpeg-stitch', // CDP paint-time capture — highest-quality path
		deviceScaleFactor: 2, // 4K supersample → lanczos downscale
		cursorHighlight: true,
	},
	export: {
		preset: 'slow',
		crf: 16,
		// No scene transition by default. argo only has ONE global transition,
		// applied at every scene boundary, and most boundaries in the episodes
		// sit on the SAME page (a new narration line, same screen) — a
		// fade-through-black there reads as the page blinking off and back on.
		// Real cuts are painted in-page instead (episode-helpers: the title
		// card dissolve, the persona interstitials), so nothing is lost.
		// ARGO_TRANSITION=fade restores the old dip-to-black for the standing
		// tour clips, which were paced around it.
		...(process.env.ARGO_TRANSITION === 'fade'
			? { transition: { type: 'fade-through-black', durationMs: 2000 } }
			: {}),
		speedRamp: { gapSpeed: 2.0, minGapMs: 500 },
		sharpen: true,
		audio: { loudnorm: true },
	},
	overlays: {
		autoBackground: true,
	},
});
