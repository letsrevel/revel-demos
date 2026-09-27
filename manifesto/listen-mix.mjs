import { listen } from './listen.mjs';
import fs from 'node:fs';
const cues = JSON.parse(fs.readFileSync('cues.json'));
const i = +process.argv[2];
const lines = cues.lines.filter(l => l.end > i * 30 && l.start < i * 30 + 31).map(l => `${(l.start - i * 30).toFixed(1)}s: "${l.text}"`).join('\n');
console.log(await listen([`audio/chunks/mix-${i}.mp3`], `You are the re-recording mixer on a premium brand film. This is a 31-second excerpt of the final mix (music score + female voice-over + subtle sound design). Expected voice-over in this excerpt, with start times:\n${lines}\n\nCritique precisely with timestamps: (1) Is every VO line clearly intelligible over the music? any line buried or too loud? (2) music level/ducking — pumping, too loud, too quiet? (3) sound effects — list the ones you hear with timestamps; any that are distracting, cheap-sounding, too loud, harsh, or clicky? (4) any clipping, distortion, abrupt cuts, glitches (except an intentional muffled/wobbly music section around 17-26s of the film and an intentional glitch ~23.3s). (5) Top 3 concrete fixes (e.g. "SFX at 12.4s too loud by ~6dB"). Be concise.`, 'google/gemini-3.1-pro-preview'));
