#!/usr/bin/env python3
"""Fetch VSCO 2 Community Edition (CC0) samples and cut them into small game samples.

Sustained instruments: mono, 22.05 kHz, 16-bit WAV from the note onset, 3 s long, with a seamless loop baked in
between LOOP_START and LOOP_END (seconds) so the game can hold a note (fermata) as long as it likes.
One-shot instruments (pizzicato, staccato, percussion): the first ONESHOT seconds, faded out, never looped.
Output: conductor/samples/<inst>/<midi>.wav and conductor/samples/index.json:
  { loop: [start, end], insts: { <inst>: { notes: [midi, ...], oneshot?: true, unpitched?: true } } }
VSCO's octave numbering differs between instruments, so each instrument's octave is checked by pitch detection
on one sample (the label + 12k that best matches the detected pitch). Notes closer than MIN_STEP semitones to the
previous kept one are skipped (the game pitch-shifts the nearest sample).

Usage: python3 conductor/tools/build_samples.py [inst ...]   (pure Python, no dependencies; default: all)
"""
import json, math, os, re, struct, sys, urllib.parse, urllib.request, wave

REPO = 'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/'
TREE = 'https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/master?recursive=1'
N = r'([A-G]#?)(\d)'
INSTS = {   # game instrument -> (VSCO folder, file pattern with the note, kind)
    'vln': ('Strings/Violin Section/susVib/', rf'VlnEns_susVib_{N}_v1\.wav', 'loop'),
    'vla': ('Strings/Viola Section/susvib/', rf'ViolaEns_susvib_{N}_v1_1\.wav', 'loop'),
    'vc': ('Strings/Cello Section/susvib/', rf'susvib_{N}_v1_1\.wav', 'loop'),
    'cb': ('Strings/Solo Contrabass/SusVib/', rf'BKCtbss_SusVib_{N}_v1_rr1\.wav', 'loop'),
    'vlnp': ('Strings/Violin Section/Pizz/', rf'VlnEns_Pizz_{N}_v2_rr1\.wav', 'oneshot'),
    'vcp': ('Strings/Cello Section/pizzT/', rf'pizzT_{N}_v2_RR1\.wav', 'oneshot'),
    'cbp': ('Strings/Solo Contrabass/Pizz/', rf'BKCtbss_Pizz_{N}_v1_rr1\.wav', 'oneshot'),
    'fl': ('Woodwinds/Flute/susvib/', rf'LDFlute_susvib_{N}_v1_1\.wav', 'loop'),
    'ob': ('Woodwinds/Oboe/Vib/', rf'Oboe_Vib_{N}_v1_Main\.wav', 'loop'),
    'cl': ('Woodwinds/Clarinet/susLong/', rf'DCClar_susLong_{N}_v1_rr1_sum\.wav', 'loop'),
    'bn': ('Woodwinds/Bassoon/sus/', rf'PSBassoon_{N}_v1_1\.wav', 'loop'),
    'bns': ('Woodwinds/Bassoon/stac/', rf'PSBassoon_{N}_v2_rr1\.wav', 'oneshot'),
    'hn': ('Brass/F Horn/sus/', rf'MOHorn_sus_{N}_v[12]_1\.wav', 'loop'),
    'tp': ('Brass/Trumpet/sus/', rf'Sum_SHTrumpet_sus_{N}_v1_rr1\.wav', 'loop'),
    'tb': ('Brass/Tenor Trombone/sus/', rf'tenortbn_sus_{N}_v1_1\.wav', 'loop'),
    'tu': ('Brass/Tuba/sus/', rf'Tuba3_sus_{N}_v2_rr1_Mid\.wav', 'loop'),
}
UNPITCHED = {   # game instrument -> VSCO file (one-shot, played at its own pitch; stored as note 60)
    'timp': 'Percussion/Timpani/Timpani3_Hit_v3_rr1_Sum.wav',
    'bd': 'Percussion/BDrumNewhit_v4_rr1_Sum.wav',
    'sn': 'Percussion/Snare2-HitSN_v5_rr1_Sum.wav',
    'cym': 'Percussion/cymbal-crash1_mf_rr1.wav',
    'tri': 'Percussion/Triangle3-Hit_v1_rr1_Sum.wav',
}
# octave offsets checked by hand where detection locks onto a harmonic or fails (VSCO labels are an octave low)
OCTAVE = {'vla': 12, 'vlnp': 12, 'vcp': 12, 'cbp': 12, 'hn': 12}
NOTE = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
RATE, LENGTH, LOOP_START, LOOP_END, XFADE, ONESHOT, MIN_STEP = 22050, 3.0, 1.2, 2.8, 0.35, 1.6, 2
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


def pitch(s, rate, start=0.6):
    """Fundamental (Hz) of a steady stretch, by normalised autocorrelation (first peak near the maximum)."""
    seg = s[int(start * rate):int(start * rate) + 6000]
    n = 3000
    def r(lag):
        a, b = seg[:n], seg[lag:lag + n]
        den = math.sqrt(sum(x * x for x in a) * sum(x * x for x in b)) or 1
        return sum(x * y for x, y in zip(a, b)) / den
    lags = range(int(rate / 1500), min(int(rate / 35), len(seg) - n - 1))
    rs = {L: r(L) for L in lags}
    top = max(rs.values())
    for L in lags:
        if L - 1 in rs and L + 1 in rs and rs[L] > 0.85 * top and rs[L] >= rs[L - 1] and rs[L] >= rs[L + 1]:
            return rate / L
    return None


def cut(rate, s, kind):
    step = rate // RATE                                   # 44.1 kHz -> 22.05 kHz (48 kHz: close enough for this)
    s = [sum(s[i:i + step]) / step for i in range(0, len(s) - step, step)]
    peak = max(abs(x) for x in s) or 1
    onset = next(i for i, x in enumerate(s) if abs(x) > 0.02 * peak)
    s = s[max(0, onset - int(0.005 * RATE)):]
    if kind == 'loop':
        s = s[:int(LENGTH * RATE)]
        a, b, x = int(LOOP_START * RATE), int(LOOP_END * RATE), int(XFADE * RATE)
        for i in range(x):                                # end of the loop fades into what precedes its start
            t = i / x
            s[b - x + i] = s[b - x + i] * (1 - t) + s[a - x + i] * t
    else:
        s = s[:int(ONESHOT * RATE)]
        f = int(0.2 * RATE)
        for i in range(min(f, len(s))):                   # fade the tail out
            s[len(s) - 1 - i] *= i / f
    gain = 0.9 / peak
    return [max(-32767, min(32767, int(v * gain * 32767))) for v in s]


def save(inst, midi, pcm):
    os.makedirs(os.path.join(OUT, inst), exist_ok=True)
    with wave.open(os.path.join(OUT, inst, f'{midi}.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(struct.pack('<%dh' % len(pcm), *pcm))


def main():
    only = set(sys.argv[1:])
    tree = json.load(urllib.request.urlopen(TREE))['tree']
    path = os.path.join(OUT, 'index.json')
    index = json.load(open(path)) if os.path.exists(path) else {}
    index = {'loop': [LOOP_START, LOOP_END], 'insts': index.get('insts', {})}
    get = lambda p: urllib.request.urlopen(REPO + urllib.parse.quote(p)).read()
    for inst, (folder, pattern, kind) in INSTS.items():
        if only and inst not in only:
            continue
        files = sorted(((12 * (int(m[2]) + 1) + NOTE[m[1]], item['path']) for item in tree
                        if item['path'].startswith(folder) and (m := re.fullmatch(pattern, item['path'][len(folder):]))))
        offset, notes, last = None, [], -99
        for label, p in files:
            if label - last < MIN_STEP:
                continue
            rate, s = read_mono(get(p))
            if offset is None and inst in OCTAVE:
                offset = OCTAVE[inst]
            if offset is None:                            # this instrument's octave numbering, from the first sample
                hz = pitch(s, rate, 0.6 if kind == 'loop' else 0.05)
                heard = 69 + 12 * math.log2(hz / 440) if hz else label
                offset = 12 * round((heard - label) / 12)
                print(inst, 'octave offset', offset, 'detected', round(heard, 1), 'label', label)
            save(inst, label + offset, cut(rate, s, kind))
            notes.append(label + offset); last = label
        index['insts'][inst] = {'notes': notes, **({'oneshot': True} if kind == 'oneshot' else {})}
        print(inst, notes)
    for inst, p in UNPITCHED.items():
        if only and inst not in only:
            continue
        save(inst, 60, cut(*read_mono(get(p)), 'oneshot'))
        index['insts'][inst] = {'notes': [60], 'oneshot': True, 'unpitched': True}
        print(inst)
    json.dump(index, open(path, 'w'))


if __name__ == '__main__':
    main()
