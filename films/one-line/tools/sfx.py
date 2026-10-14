"""Render the sound-design cues in data/sfx.json to one short WAV each
(audio/sfx/<NNN>-<kind>.wav). build-index places them as <audio> clips in the
"sfx" group. Synthesis is ported from manifesto/mix.py (the 2026-09 film), plus
a rope snap. Deterministic: every cue is seeded by its index.

    uv run --with numpy --with scipy --with soundfile python tools/sfx.py
"""
import json, os, glob
import numpy as np
import soundfile as sf
from scipy import signal

ROOT = os.path.join(os.path.dirname(__file__), '..')
SR = 48000
cues = json.load(open(os.path.join(ROOT, 'data/sfx.json')))
OUT = os.path.join(ROOT, 'audio/sfx')
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, '*.wav')): os.remove(f)


def db(x): return 10 ** (x / 20)
def env_ad(n, a, d):
    a = max(1, int(a)); e = np.exp(-np.arange(n) / max(1, d)); e[:a] *= np.linspace(0, 1, a); return e
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)
def midi(n): return 440 * 2 ** ((n - 69) / 12)


def tone(f, dur, decay, harm=(1,), amps=(1,), a=0.004):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(am * np.sin(2 * np.pi * f * h * t) for h, am in zip(harm, amps))
    return x * env_ad(n, a * SR, decay * SR)


def gen(c, rng):
    noise = lambda n: rng.standard_normal(n)
    k, d = c['kind'], c.get('dur', 0.5)
    if k == 'blip':
        return tone(midi(c.get('note', 74)), 0.5, 0.09, (1, 2, 3), (1, 0.18, 0.04), 0.004) * db(-19)
    if k == 'close':
        return (tone(midi(74), 1.6, 0.5, (1, 2.01, 3), (1, .3, .1)) + tone(midi(81), 1.6, 0.5, (1, 2), (0.6, .2))) * db(-20)
    if k == 'swish':
        n = int(0.36 * SR); x = bp(noise(n), 500, 4000); e = np.sin(np.pi * np.linspace(0, 1, n)) ** 2; return x * e * db(-29)
    if k == 'whoosh':
        n = int(max(d, 0.3) * SR) + int(0.2 * SR); x = noise(n); t = np.linspace(0, 1, n)
        y = np.zeros(n); fc = 300 + 5000 * t ** 2
        for j in range(0, n, 2400):
            y[j:j + 2400] = bp(x[j:j + 2400], fc[j] * 0.6, min(fc[j] * 1.6, 20000))
        e = np.sin(np.pi * np.clip(t * 1.05, 0, 1)) ** 1.5; return y * e * db(-18)
    if k == 'riser':
        n = int(d * SR); t = np.linspace(0, 1, n)
        x = hp(noise(n), 2500) * t ** 2.5 * db(-24)
        x += np.sin(2 * np.pi * np.cumsum(200 + 600 * t ** 2) / SR) * t ** 3 * db(-30)
        return x
    if k == 'boom':
        n = int(1.2 * SR); t = np.arange(n) / SR; f = 38 + 30 * np.exp(-t * 9)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 3.2) * db(-9)
    if k == 'slam':
        n = int(0.5 * SR); t = np.arange(n) / SR
        body = np.sin(2 * np.pi * np.cumsum(55 + 90 * np.exp(-t * 30)) / SR) * np.exp(-t * 9)
        snap = bp(noise(n), 1500, 8000) * np.exp(-t * 60)
        return lp(body * db(-13) + snap * db(-34), 2500)
    if k == 'stamp':
        n = int(0.35 * SR); t = np.arange(n) / SR
        thud = lp(noise(n), 300) * np.exp(-t * 28) * 6 + np.sin(2 * np.pi * 95 * t) * np.exp(-t * 22)
        return lp(thud, 1800) * db(-14)
    if k == 'ropeSnap':
        # fibres giving way: a crackle of tiny clicks into a dull release
        n = int(0.4 * SR); t = np.arange(n) / SR; out = np.zeros(n)
        for j in range(18):
            s = int((j * 0.006 + rng.uniform(0, 0.004)) * SR); m = int(0.012 * SR)
            if s + m < n: out[s:s + m] += bp(noise(m), 1800, 6500) * np.exp(-np.arange(m) / SR * 400) * rng.uniform(0.4, 1)
        out += lp(noise(n), 500) * np.exp(-np.maximum(0, t - 0.1) * 30) * (t > 0.1) * 2.5
        return lp(out, 7000) * db(-15)
    if k == 'datatick':
        n = int(0.05 * SR); t = np.arange(n) / SR
        return np.sin(2 * np.pi * 1500 * t) * np.exp(-t * 90) * db(-33)
    if k == 'glitch':
        n = int(d * SR); x = noise(n); step = int(SR / 3000); x = np.repeat(x[::step], step)[:n]
        gate = (np.sin(2 * np.pi * 18 * np.arange(n) / SR) > 0).astype(float)
        return lp(bp(x, 300, 4000), 3500) * gate * np.linspace(1, 0.2, n) * db(-31)
    if k == 'tension':
        n = int(d * SR); t = np.arange(n) / SR
        e = np.minimum(1, t / 1.0) * np.minimum(1, (t[-1] - t) / 0.6 + 1e-3)
        return np.sin(2 * np.pi * 110 * t + 3 * np.sin(2 * np.pi * 0.7 * t)) * np.clip(e, 0, 1) * db(-36)
    if k == 'click':
        n = int(0.06 * SR); t = np.arange(n) / SR
        return lp(bp(noise(n), 1200, 5000) * np.exp(-t * 300) + np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 220) * 0.3, 5000) * db(-25)
    if k == 'typing':
        n = int((d + 0.2) * SR); out = np.zeros(n); count = int(c.get('chars', 80) * 0.6)
        for j in range(count):
            s = int((j / count * d + rng.uniform(-0.01, 0.01)) * SR); m = int(0.03 * SR)
            if s < 0 or s + m > n: continue
            tt = np.arange(m) / SR
            out[s:s + m] += bp(rng.standard_normal(m), 1500, 7000) * np.exp(-tt * 350) * rng.uniform(0.5, 1)
        return lp(out, 5000) * db(-27)
    if k == 'chime':
        a1 = tone(midi(74), 2.2, 0.7, (1, 2.0, 3.0), (1, .2, .05), 0.008); a2 = tone(midi(81), 2.2, 0.9, (1, 2.0, 3.0), (1, .2, .05), 0.008)
        out = np.zeros(len(a1) + int(0.12 * SR)); out[:len(a1)] += a1; out[int(0.12 * SR):] += a2
        return lp(out, 6000) * db(-23)
    if k == 'ding':
        return tone(midi(81), 1.2, 0.35, (1, 2.0), (1, .15), 0.006) * db(-25)
    if k in ('pop', 'softpop'):
        n = int(0.18 * SR); t = np.arange(n) / SR
        return np.sin(2 * np.pi * np.cumsum(300 + 500 * np.exp(-t * 40)) / SR) * np.exp(-t * 30) * db(-16 if k == 'pop' else -19)
    if k == 'coinTravel':
        n = int(d * SR); t = np.linspace(0, 1, n); return bp(noise(n), 2000, 6000) * np.sin(np.pi * t) * db(-30)
    if k == 'ropeDraw':
        n = int(d * SR); t = np.arange(n) / SR
        x = bp(noise(n), 500, 3500) * (0.6 + 0.4 * np.sin(2 * np.pi * 5.5 * t) ** 2)
        e = np.minimum(1, np.minimum(t / 0.25, (t[-1] - t) / 0.4 + 1e-3)); return x * np.clip(e, 0, 1) * db(-30)
    if k == 'ropeTighten':
        n = int(0.45 * SR); t = np.arange(n) / SR; out = np.zeros(n)
        for j in range(12):
            s = int((0.01 + j * 0.018 + rng.uniform(0, 0.006)) * SR); m = int(0.02 * SR)
            if s + m < n: out[s:s + m] += bp(noise(m), 700, 1600) * np.exp(-np.arange(m) / SR * 200)
        out += np.sin(2 * np.pi * 80 * t) * np.exp(-t * 16) * 0.6
        return out * db(-17)
    raise SystemExit(f'unknown sfx kind: {k}')


PANS = {'blip': 0.25, 'datatick': 0.3, 'click': 0.15, 'swish': -0.1}
for i, c in enumerate(cues):
    rng = np.random.default_rng(1000 + i)
    x = gen(c, rng) * c.get('gain', 1.0)
    p = PANS.get(c['kind'], 0.0) * (1 if i % 2 else -1)
    st = np.stack([x * np.sqrt(1 - p), x * np.sqrt(1 + p)], 1)
    # short fade-out so no file ends on a click
    m = min(len(st), int(0.01 * SR)); st[-m:] *= np.linspace(1, 0, m)[:, None]
    name = f'{i:03d}-{c["kind"]}.wav'
    sf.write(os.path.join(OUT, name), st.astype(np.float32), SR, subtype='PCM_16')
    c['file'] = f'audio/sfx/{name}'; c['dur'] = round(len(st) / SR, 3)
json.dump(cues, open(os.path.join(ROOT, 'data/sfx.json'), 'w'), indent=1)
print(len(cues), 'sfx rendered to audio/sfx/')
