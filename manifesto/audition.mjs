import { speech, credits } from './or.mjs';
import { execSync } from 'node:child_process';
const line = "Some rooms need a little care about who walks in. So before anyone gets a ticket, they answer a few honest questions. And a real person reads them.";
const C = [
  ['gemini-charon', 'google/gemini-3.8-flash-tts', 'Charon', 'pcm'],
  ['gemini-sulafat', 'google/gemini-3.8-flash-tts', 'Sulafat', 'pcm'],
  ['gemini-algieba', 'google/gemini-3.8-flash-tts', 'Algieba', 'pcm'],
  ['minimax-narrator', 'minimax/speech-2.8-hd', 'English_expressive_narrator', 'mp3'],
  ['minimax-storyteller', 'minimax/speech-2.8-hd', 'English_CaptivatingStoryteller', 'mp3'],
  ['mai-harper', 'microsoft/mai-voice-2', 'en-US-Harper:MAI-Voice-2', 'mp3'],
  ['fish-s2pro', 'fish-audio/s2-pro', undefined, 'mp3'],
  ['grok-eve', 'x-ai/grok-voice-tts-1.0', 'eve', 'mp3'],
];
console.log('before', await credits());
for (const [name, model, voice, fmt] of C) {
  try {
    const out = `audio/aud-${name}.${fmt === 'pcm' ? 'pcm' : 'bin'}`;
    const r = await speech({ model, input: line, voice, format: fmt, out });
    console.log(name, r);
  } catch (e) { console.log('FAIL', name, e.message); }
}
console.log('after', await credits());
