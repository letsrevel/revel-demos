// Commission the score from Lyria 3 Pro via OpenRouter (streamed audio).
import fs from 'node:fs';
import { KEY } from './or.mjs';
const [,, promptFile, out, model = 'google/lyria-3-pro-preview'] = process.argv;
const prompt = fs.readFileSync(promptFile, 'utf8');
const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], modalities: ['text', 'audio'], stream: true }),
});
if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
let buf = '', audio = [], text = '', fmt = null, raw = [];
const dec = new TextDecoder();
for await (const chunk of r.body) {
  buf += dec.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    if (!line.startsWith('data:')) continue;
    const d = line.slice(5).trim(); if (d === '[DONE]') continue;
    try {
      const j = JSON.parse(d); raw.push(j);
      const delta = j.choices?.[0]?.delta || {};
      if (delta.content) text += delta.content;
      if (delta.audio?.data) audio.push(delta.audio.data);
      if (delta.audio?.format) fmt = delta.audio.format;
      if (j.usage) console.error('usage', JSON.stringify(j.usage));
    } catch (e) { console.error('parse', d.slice(0, 200)); }
  }
}
const b = Buffer.concat(audio.map(a => Buffer.from(a, 'base64')));
fs.writeFileSync(out, b);
fs.writeFileSync(out + '.txt', text);
console.error('bytes', b.length, 'fmt', fmt, 'text', text.slice(0, 400));
if (!b.length) console.error(JSON.stringify(raw.slice(-3)).slice(0, 1500));
