import { listen } from './listen.mjs';
const i = +process.argv[2];
console.log(await listen([`audio/chunks/mix-${i}.mp3`], `Re-recording mixer check of a brand-film mix excerpt (music + female VO + subtle sound design). Answer briefly with timestamps: 1) any VO words hard to understand? 2) audible pumping of the music? 3) any sound effect that is harsh, clicky or too loud? 4) overall: is this mix broadcast-ready, yes/no, and the single most important fix if not.`, 'google/gemini-3.1-pro-preview'));
