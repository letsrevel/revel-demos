import sys, librosa, numpy as np, json
f=sys.argv[1]
y, sr = librosa.load(f, sr=44100, mono=True)
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=512, units='time', tightness=400)
print('tempo', tempo, 'n', len(beats))
ibi=np.diff(beats); print('ibi mean %.4f std %.4f min %.3f max %.3f'%(ibi.mean(), ibi.std(), ibi.min(), ibi.max()))
# linear fit of beat times -> constant tempo grid
idx=np.arange(len(beats)); a,b=np.polyfit(idx,beats,1); res=beats-(a*idx+b)
print('fit period %.5f offset %.4f resid max %.3f'%(a,b,np.abs(res).max()))
# fine RMS every 0.25s
hop=int(sr*0.25); rms=librosa.feature.rms(y=y,frame_length=hop*2,hop_length=hop)[0]; db=20*np.log10(rms+1e-6)
for t in range(0,len(db),4):
    print('%5.1f %s'%(t*0.25, ' '.join('%4d'%v for v in db[t:t+4])), end=' | ' if (t//4)%3!=2 else '\n')
# low band (kick) energy change
S=np.abs(librosa.stft(y,n_fft=4096,hop_length=hop)); freqs=librosa.fft_frequencies(sr=sr,n_fft=4096)
low=S[freqs<150].sum(0); lowdb=20*np.log10(low+1e-6)
print('\nlow-band dB per 1s:', ' '.join('%d'%np.mean(lowdb[i:i+4]) for i in range(0,len(lowdb),4)))
json.dump({'period':a,'offset':b,'beats':beats.tolist()},open(f+'.grid.json','w'))
