# Trim the picked take for each given line id, measure it, and word-align it.
import json, subprocess, sys
from faster_whisper import WhisperModel
ids = sys.argv[1:]
picks = json.load(open('audio/vo/picks.json'))
durs = json.load(open('audio/vo/final/durations.json'))
words = json.load(open('audio/vo/final/words.json'))
m = WhisperModel("small.en", device="cpu", compute_type="int8")
for id in ids:
    src, dst = f"audio/vo/{picks[id]['best']}", f"audio/vo/final/{id}.wav"
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',src,'-af','silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse',dst],check=True)
    durs[id] = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',dst]))
    segs,_ = m.transcribe(dst, word_timestamps=True, beam_size=5)
    words[id] = [dict(w=w.word.strip(), s=round(float(w.start),3), e=round(float(w.end),3)) for sg in segs for w in sg.words]
    print(id, round(durs[id],2), ' '.join(f"{w['w']}@{w['s']}" for w in words[id]))
json.dump(durs, open('audio/vo/final/durations.json','w'), indent=1)
json.dump(words, open('audio/vo/final/words.json','w'), indent=0)
