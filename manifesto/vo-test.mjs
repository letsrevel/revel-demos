import { speech } from './or.mjs';
import { listen } from './listen.mjs';
import { execSync } from 'node:child_process';
const tests = {
  plain: 'Some rooms need a little more care.',
  directed: 'Read the following in a warm, intimate, unhurried voice, like telling a close friend something you care about. Speak only the quoted line: "Some rooms need a little more care."',
  bracket: '[warm, intimate, unhurried] Some rooms need a little more care.',
};
for (const [k, input] of Object.entries(tests)) {
  await speech({ model: 'google/gemini-3.8-flash-tts', input, voice: 'Sulafat', format: 'pcm', out: `audio/t-${k}.pcm` });
  execSync(`ffmpeg -loglevel error -y -f s16le -ar 24000 -ac 1 -i audio/t-${k}.pcm audio/t-${k}.mp3`);
}
console.log(await listen(['audio/t-plain.mp3','audio/t-directed.mp3','audio/t-bracket.mp3'], 'For each clip: give a verbatim transcript of every word spoken, then describe the delivery (tone, pace, warmth) in one line.', 'google/gemini-3.5-flash'));
