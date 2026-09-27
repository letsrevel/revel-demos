// "Listening panel": an audio-capable model rates TTS clips, since Claude cannot hear.
import fs from 'node:fs';
import { KEY } from './or.mjs';
export async function listen(files, prompt, model = 'google/gemini-3.1-pro-preview') {
  const content = [{ type: 'text', text: prompt }];
  for (const f of files) {
    content.push({ type: 'text', text: `CLIP: ${f.split('/').pop()}` });
    content.push({ type: 'input_audio', input_audio: { data: fs.readFileSync(f).toString('base64'), format: f.endsWith('.wav') ? 'wav' : 'mp3' } });
  }
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0.2 }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 400));
  return j.choices[0].message.content;
}
if (process.argv[1]?.endsWith('listen.mjs')) {
  const files = fs.readdirSync('audio').filter(f => f.startsWith('aud-')).map(f => 'audio/' + f);
  console.log(await listen(files, `You are a casting director for the voice-over of a premium brand film (think Apple / Patagonia manifesto spots) for an open-source, ethical community event platform. The tone must be warm, human, confident, honest — not salesy, not robotic. Each clip reads the same line. For EACH clip rate 1-10 on: naturalness (human vs synthetic), warmth, clarity/diction, audio artifacts (glitches, metallic tone, clipping, odd breaths), pacing. Note gender/accent. Then rank all clips best to worst for this brand film and justify the top 3 in one sentence each. Be critical and specific.`));
}
