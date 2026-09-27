// Tiny OpenRouter client: speech + music. Reads the key from ../.env.
import fs from 'node:fs';
import path from 'node:path';
const envPath = new URL('../.env', import.meta.url);
for (const l of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const KEY = process.env.OPENROUTER_API_KEY;
export async function speech({ model, input, voice, format, extra = {}, out }) {
  const body = { model, input, voice, ...(format ? { response_format: format } : {}), ...extra };
  let r;
  for (let attempt = 0; ; attempt++) {
    r = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status !== 429 || attempt > 12) break;
    await new Promise(res => setTimeout(res, 8000 + Math.random() * 6000));
  }
  const buf = Buffer.from(await r.arrayBuffer());
  if (!r.ok) throw new Error(`${model} ${r.status}: ${buf.toString().slice(0, 300)}`);
  fs.writeFileSync(out, buf);
  return { type: r.headers.get('content-type'), bytes: buf.length, gen: r.headers.get('x-generation-id') };
}
export async function credits() {
  const r = await fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: `Bearer ${KEY}` } });
  return (await r.json()).data;
}
export { KEY };
