"""Mix the soundtrack: score + narration + synthesized sound design -> master.

Everything is driven by cues.json (narration placement, music marks) and
sfx.json (sound-design cues registered by the animation's scenes).

    python mix.py [out.wav]
"""
import json, sys, subprocess
import numpy as np
import soundfile as sf
from scipy import signal
import pyloudnorm as pyln

SR = 48000
cues = json.load(open('cues.json'))
sfx = json.load(open('sfx.json'))
DUR = cues['duration']
N = int(DUR * SR)
marks = cues['music']['marks']
rng = np.random.default_rng(7)


def load(path, sr=SR):
    out = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, np.float32).reshape(-1, 2).astype(np.float64)


def db(x): return 10 ** (x / 20)
def ramp(n): return np.linspace(0, 1, max(1, n))
def env_ad(n, a, d):  # attack/decay envelope in samples
    e = np.exp(-np.arange(n) / max(1, d)); ai = min(n, max(1, a)); e[:ai] *= np.linspace(0, 1, ai); return e
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'highpass', fs=SR, output='sos'), x)
def midi(n): return 440 * 2 ** ((n - 69) / 12)
def noise(n): return rng.standard_normal(n)


# ---------------------------------------------------------------- music
music = load(cues['music']['file'])[:N]
if len(music) < N: music = np.vstack([music, np.zeros((N - len(music), 2))])

# "the platforms": muffled, narrowed, with a queasy tape wobble — then snaps open on the drop
t0, t1 = marks['platforms'], marks['drop']
i0, i1 = int(t0 * SR), int(t1 * SR)
seg = music[i0 - SR: i1 + SR].copy()
muf = np.stack([lp(seg[:, c], 950, 4) for c in range(2)], 1)
mid = muf.mean(1, keepdims=True); muf = mid + (muf - mid) * 0.35
n = len(muf); tt = np.arange(n) / SR
delay = (0.0035 + 0.0025 * np.sin(2 * np.pi * 0.8 * tt)) * SR
idx = np.clip(np.arange(n) - delay, 0, n - 1)
muf = np.stack([np.interp(idx, np.arange(n), muf[:, c]) for c in range(2)], 1) * db(-2)
w = np.zeros(n); a = SR; b = SR + (i1 - i0)
w[a:b] = 1; w[a:a + int(0.35 * SR)] = ramp(int(0.35 * SR)); w[b - int(0.012 * SR):b] = 1 - ramp(int(0.012 * SR))
music[i0 - SR: i1 + SR] = seg * (1 - w[:, None]) + muf * w[:, None]
# fade-out at the very end (picture fades too)
fo = int(1.6 * SR); music[N - fo:] *= (1 - ramp(fo))[:, None] ** 1.5

# ---------------------------------------------------------------- narration
vo = np.zeros(N)
ir_n = int(0.5 * SR); ir = noise(ir_n) * np.exp(-np.arange(ir_n) / (0.09 * SR)); ir = lp(ir, 5000); ir /= np.abs(ir).sum()
for l in cues['lines']:
    x, sr = sf.read(f"audio/vo/final/{l.get('file', l['id'])}.wav")
    if x.ndim > 1: x = x.mean(1)
    if sr != SR: x = signal.resample_poly(x, SR, sr)
    if 'clip' in l:  # a phrase cut from a longer take, with short fades at the cuts
        a, b = int(l['clip'][0] * SR), int(l['clip'][1] * SR); x = x[a:b].copy()
        f, g = int(0.025 * SR), int(0.03 * SR); x[:f] *= ramp(f) ** 2; x[-g:] *= (1 - ramp(g)) ** 2
    x = hp(x, 75, 2)
    f0, gdb, q = 3000, 2.5, 0.9
    A = 10 ** (gdb / 40); w0 = 2 * np.pi * f0 / SR; al = np.sin(w0) / (2 * q)
    bb = [1 + al * A, -2 * np.cos(w0), 1 - al * A]; aa = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    x = signal.lfilter(bb, aa, x)
    x = x / (np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2)) + 1e-9) * db(-20)  # level match on voiced parts
    wet = signal.fftconvolve(x, ir)[:len(x)] * 0.9
    x = x + wet * db(-12)  # a breath of room so it sits in the mix
    s = int(l['start'] * SR); e = min(N, s + len(x)); vo[s:e] += x[:e - s]
# gentle compression on the voice bus
envv = signal.sosfilt(signal.butter(1, 12, 'lowpass', fs=SR, output='sos'), np.abs(vo))
gain = np.minimum(1, (db(-24) / (envv + 1e-9)) ** 0.35); vo *= gain / np.median(gain[envv > db(-40)]) if np.any(envv > db(-40)) else 1

# ---------------------------------------------------------------- sound design
fx = np.zeros((N, 2))


def put(sig, t, g=1.0, pan=0.0):
    s = int(t * SR)
    if s >= N: return
    if sig.ndim == 1:
        l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan)); sig = np.stack([sig * l, sig * r], 1) * np.sqrt(2)
    e = min(N, s + len(sig)); fx[s:e] += sig[:e - s] * g


def tone(f, dur, decay, harm=(1,), amps=(1,), a=0.004):
    n = int(dur * SR); t = np.arange(n) / SR
    x = sum(am * np.sin(2 * np.pi * f * h * t) for h, am in zip(harm, amps))
    return x * env_ad(n, int(a * SR), decay * SR)


def gen(c):
    k, d = c['kind'], c.get('dur', 0.5)
    if k == 'blip':
        f = midi(c.get('note', 74)); return tone(f, 0.5, 0.09, (1, 2, 3), (1, 0.18, 0.04), 0.004) * db(-19)
    if k == 'close':
        return (tone(midi(74), 1.6, 0.5, (1, 2.01, 3), (1, .3, .1)) + tone(midi(81), 1.6, 0.5, (1, 2), (0.6, .2))) * db(-20)
    if k == 'swish':
        n = int(0.36 * SR); x = bp(noise(n), 500, 4000); e = np.sin(np.pi * np.linspace(0, 1, n)) ** 2; return x * e * db(-29)
    if k == 'whoosh':
        n = int(max(d, 0.3) * SR) + int(0.2 * SR); x = noise(n); t = np.linspace(0, 1, n)
        y = np.zeros(n); fc = 300 + 5000 * t ** 2
        for j in range(0, n, 2400):  # swept band, block-wise
            y[j:j + 2400] = bp(x[j:j + 2400], fc[j] * 0.6, min(fc[j] * 1.6, 20000))
        e = np.sin(np.pi * np.clip(t * 1.05, 0, 1)) ** 1.5; return y * e * db(-18)
    if k == 'suck':
        n = int(d * SR); t = np.linspace(0, 1, n); x = bp(noise(n), 400, 9000) * t ** 3; return x * db(-16)
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
    if k == 'datatick':
        n = int(0.05 * SR); t = np.arange(n) / SR
        return np.sin(2 * np.pi * 1500 * t) * np.exp(-t * 90) * db(-33)
    if k == 'glitch':
        n = int(d * SR); x = noise(n); step = int(SR / 3000); x = np.repeat(x[::step], step)[:n]
        gate = (np.sin(2 * np.pi * 18 * np.arange(n) / SR) > 0).astype(float)
        return lp(bp(x, 300, 4000), 3500) * gate * np.linspace(1, 0.2, n) * db(-31)
    if k == 'tension':
        n = int(d * SR); t = np.arange(n) / SR
        return np.sin(2 * np.pi * 110 * t + 3 * np.sin(2 * np.pi * 0.7 * t)) * (t / t[-1]) ** 2 * db(-34)
    if k in ('click',):
        n = int(0.06 * SR); t = np.arange(n) / SR
        return lp(bp(noise(n), 1200, 5000) * np.exp(-t * 300) + np.sin(2 * np.pi * 1900 * t) * np.exp(-t * 220) * 0.3, 5000) * db(-25)
    if k == 'typing':
        n = int((d + 0.2) * SR); out = np.zeros(n); r = np.random.default_rng(3)
        count = int(c.get('chars', 80) * 0.6)
        for j in range(count):
            s = int((j / count * d + r.uniform(-0.01, 0.01)) * SR); m = int(0.03 * SR)
            if s < 0 or s + m > n: continue
            tt = np.arange(m) / SR
            out[s:s + m] += bp(r.standard_normal(m), 1500, 7000) * np.exp(-tt * 350) * r.uniform(0.5, 1)
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
    if k == 'unlock':
        return (tone(2400, 0.08, 0.012) + np.concatenate([np.zeros(int(0.06 * SR)), tone(1700, 0.1, 0.02)])[:int(0.08 * SR)]) * db(-20)
    if k == 'coinTravel':
        n = int(d * SR); t = np.linspace(0, 1, n); return bp(noise(n), 2000, 6000) * np.sin(np.pi * t) * db(-30)
    if k == 'ropeDraw':
        # soft friction of rope on paper: band-limited noise with a slow flutter
        n = int(d * SR); t = np.arange(n) / SR
        x = bp(noise(n), 500, 3500) * (0.6 + 0.4 * np.sin(2 * np.pi * 5.5 * t) ** 2)
        e = np.minimum(1, np.minimum(t / 0.25, (t[-1] - t) / 0.4 + 1e-3)); return x * np.clip(e, 0, 1) * db(-30)
    if k == 'ropeTighten':
        # a creak: resonant filtered clicks + low thump
        n = int(0.45 * SR); t = np.arange(n) / SR; out = np.zeros(n)
        for j in range(12):
            s = int((0.01 + j * 0.018 + rng.uniform(0, 0.006)) * SR); m = int(0.02 * SR)
            if s + m < n: out[s:s + m] += bp(noise(m), 700, 1600) * np.exp(-np.arange(m) / SR * 200)
        out += np.sin(2 * np.pi * 80 * t) * np.exp(-t * 16) * 0.6
        return out * db(-17)
    return None


pans = {'blip': 0.25, 'datatick': 0.3, 'click': 0.15, 'swish': -0.1}
for i, c in enumerate(sfx):
    sig = gen(c)
    if sig is None: continue
    p = pans.get(c['kind'], 0.0) * (1 if i % 2 else -1)
    put(sig, c['t'], c.get('gain', 1.0), p)

# ---------------------------------------------------------------- ducking + sum
from scipy.ndimage import maximum_filter1d
key = np.abs(vo)
key = signal.sosfilt(signal.butter(1, 8, 'lowpass', fs=SR, output='sos'), key)
key = maximum_filter1d(key, int(1.0 * SR))          # hold through the gaps between words
key = np.roll(key, -int(0.12 * SR))                  # look-ahead
k = np.clip(key / db(-32), 0, 1)
# duck deeper where the score is dense
menv = signal.sosfiltfilt(signal.butter(1, 0.8, 'lowpass', fs=SR, output='sos'), np.abs(music).mean(1))
dense = np.clip((20 * np.log10(menv + 1e-9) + 30) / 12, 0, 1)
duck = db(-(3.0 + 2.5 * dense) * k)
duck = signal.sosfiltfilt(signal.butter(1, 0.55, 'lowpass', fs=SR, output='sos'), duck)
music_l = music * db(-4.5) * duck[:, None]
mix = music_l * db(-1.5) + np.stack([vo, vo], 1) * db(3.5) + fx * db(-2)

# master: loudness to -14 LUFS with a look-ahead peak limiter at -1.2 dBFS
from scipy.ndimage import minimum_filter1d, uniform_filter1d
def limit(x, ceil):
    g = np.minimum(1, ceil / (np.max(np.abs(x), 1) + 1e-12))
    g = uniform_filter1d(minimum_filter1d(g, 481), 241)
    return x * g[:, None]
meter = pyln.Meter(SR)
lufs = meter.integrated_loudness(mix)
ceil = db(-1.2)
for _ in range(4):
    cur = meter.integrated_loudness(mix)
    mix = limit(mix * db(-14 - cur), ceil)
print('loudness before', round(lufs, 2), 'after', round(meter.integrated_loudness(mix), 2), 'peak dB', round(20 * np.log10(np.max(np.abs(mix))), 2))
out = sys.argv[1] if len(sys.argv) > 1 else 'audio/master.wav'
sf.write(out, mix.astype(np.float32), SR, subtype='PCM_24')
# stems for inspection
sf.write('audio/stem-vo.wav', vo.astype(np.float32), SR)
sf.write('audio/stem-fx.wav', fx.astype(np.float32), SR)
print('wrote', out)
