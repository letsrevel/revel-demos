import fs from 'node:fs';
import { listen } from './listen.mjs';
const f = fs.readdirSync('audio/vo/final').filter(x => x.endsWith('.wav')).sort().map(x => 'audio/vo/final/' + x);
console.log(await listen(f, 'Give a verbatim transcript of each clip, one line each as <clip name>: <transcript>. Include any extra words, laughs or noises in brackets. Nothing else.', 'google/gemini-3.5-flash'));
