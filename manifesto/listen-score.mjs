import { listen } from './listen.mjs';
const files = process.argv.slice(2);
for (const f of files) {
  console.log('=====', f);
  console.log(await listen([f], `You are a music supervisor for a premium 90-second brand film (warm, human, confident; for an ethical open-source community event platform). Listen to this instrumental track carefully and give:
1. A timestamped section map (to the second): intro, builds, drops, breakdowns, climaxes, endings — describing instrumentation and energy (1-10) of each section.
2. Exact timestamps of the most dramatic moments: the biggest drop/hit, any near-silence or stop, any clear breakdown, the final resolution.
3. Production quality 1-10 (mix clarity, fidelity, AI artifacts like warbling, smeared transients, mushy drums), musicality 1-10, fit for the brand 1-10.
4. Any glitches or weird moments with timestamps.
Be precise and critical.`));
}
