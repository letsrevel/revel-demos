import sys, librosa, numpy as np, json
for f in sys.argv[1:]:
    y, sr = librosa.load(f, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units='time')
    rms = librosa.feature.rms(y=y, hop_length=sr//2)[0]  # per 0.5s
    db = 20*np.log10(rms+1e-6)
    print(f, 'tempo', np.round(tempo,2), 'nbeats', len(beats), 'dur', round(len(y)/sr,1))
    print(' beat[0:8]', np.round(beats[:8],2), 'median IBI', round(float(np.median(np.diff(beats))),3))
    # energy per 2.5s window as bar-ish chart
    per = [float(np.mean(db[i:i+5])) for i in range(0,len(db),5)]
    print(' dB per 2.5s:', ' '.join(f'{int(v)}' for v in per))
