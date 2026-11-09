#!/usr/bin/env python3
"""Fetch VSCO 2 Community Edition (CC0) string-section sustains and cut them into small game samples.

Each sample: mono, 22.05 kHz, 16-bit WAV, starts at the note onset, 3 s long, with a seamless loop baked in
between LOOP_START and LOOP_END (seconds) so the game can hold a note (fermata) as long as it likes.
Output: conductor/samples/<section>/<midi>.wav and conductor/samples/index.json ({section: [midi, ...]}).
VSCO names notes an octave low (its "A3" sounds A4), checked by pitch detection: midi = label + 12.

Usage: python3 conductor/tools/build_samples.py   (pure Python, no dependencies; downloads ~120 MB)
"""
import json, os, re, struct, urllib.parse, urllib.request, wave

REPO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'
TREE = 'https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/master?recursive=1'
SECTIONS = {   # game section -> (VSCO folder, file pattern for the soft layer)
    'vln': ('Strings/Violin Section/susVib/', r'VlnEns_susVib_([A-G]#?)(\d)_v1\.wav'),
    'vla': ('Strings/Viola Section/susvib/', r'ViolaEns_susvib_([A-G]#?)(\d)_v1_1\.wav'),
    'vc': ('Strings/Cello Section/susvib/', r'susvib_([A-G]#?)(\d)_v1_1\.wav'),
    'cb': ('Strings/Solo Contrabass/SusVib/', r'BKCtbss_SusVib_([A-G]#?)(\d)_v1_rr1\.wav'),
}
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
RATE, LENGTH, LOOP_START, LOOP_END, XFADE = 22050, 3.0, 1.2, 2.8, 0.35
OUT = os.path.join(os.path.dirname(__file__), '..', 'samples')


def read_mono(data):
    """WAV bytes -> (rate, list of float samples in -1..1, channels averaged)."""
    path = os.path.join(OUT, '.tmp.wav')
    with open(path, 'wb') as f:
        f.write(data)
    with wave.open(path) as w:
        ch, width, rate, raw = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.readframes(w.getnframes())
    os.remove(path)
    if width == 2:
        vals = struct.unpack('<%dh' % (len(raw) // 2), raw)
        scale = 32768
    else:   # 24-bit: widen to 32-bit by putting each sample in the top three bytes
        vals = struct.unpack('<%di' % (len(raw) // 3), b''.join(b'\0' + raw[i:i + 3] for i in range(0, len(raw), 3)))
        scale = 2 ** 31
    return rate, [sum(vals[i:i + ch]) / ch / scale for i in range(0, len(vals), ch)]


def cut(rate, s):
    step = rate // RATE                                   # 44.1 kHz -> 22.05 kHz: average sample pairs
    s = [sum(s[i:i + step]) / step for i in range(0, len(s) - step, step)]
    peak = max(abs(x) for x in s)
    onset = next(i for i, x in enumerate(s) if abs(x) > 0.02 * peak)
    s = s[max(0, onset - int(0.005 * RATE)):][:int(LENGTH * RATE)]
    a, b, x = int(LOOP_START * RATE), int(LOOP_END * RATE), int(XFADE * RATE)
    for i in range(x):                                    # end of the loop fades into what precedes its start
        t = i / x
        s[b - x + i] = s[b - x + i] * (1 - t) + s[a - x + i] * t
    gain = 0.9 / peak
    return [max(-32767, min(32767, int(v * gain * 32767))) for v in s]


def main():
    tree = json.load(urllib.request.urlopen(TREE))['tree']
    index = {}
    for sec, (folder, pattern) in SECTIONS.items():
        os.makedirs(os.path.join(OUT, sec), exist_ok=True)
        for item in tree:
            name = item['path'][len(folder):] if item['path'].startswith(folder) else ''
            m = re.fullmatch(pattern, name)
            if not m:
                continue
            midi = 12 * (int(m[2]) + 1) + NOTE[m[1]] + 12
            data = urllib.request.urlopen(REPO + urllib.parse.quote(item['path'])).read()
            pcm = cut(*read_mono(data))
            with wave.open(os.path.join(OUT, sec, f'{midi}.wav'), 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
                w.writeframes(struct.pack('<%dh' % len(pcm), *pcm))
            index.setdefault(sec, []).append(midi)
            print(sec, name, '->', midi)
        index[sec].sort()
    with open(os.path.join(OUT, 'index.json'), 'w') as f:
        json.dump({'loop': [LOOP_START, LOOP_END], **index}, f)


if __name__ == '__main__':
    main()
