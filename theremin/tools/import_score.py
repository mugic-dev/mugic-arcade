#!/usr/bin/env python3
"""Turn a public-domain score (MusicXML .mxl/.xml or MIDI .mid) into a Theremin Hero melody + accompaniment.

  python3 -I import_score.py SCORE --melody P1 --accomp P2 [--transpose K] [--from-bar N --to-bar M]

Parts are MusicXML part ids (P1, P2, ...) or MIDI track numbers (0, 1, ...); --list shows them. PART:STAFF takes
one staff of a part (a piano's right hand: --melody P1:1 --accomp P1, the accompaniment then leaves out the melody);
PART:STAFF:VOICE one voice of it (when the melody is its own voice, e.g. P1:1:2).
Prints JSON {"tempo": quarter bpm or null, "melody": [[beat, midi, beats], ...], "accomp": [...], "beatsPerBar": n} with beats in quarter notes
from the first printed bar; paste it into theremin/pieces.js. Repeats are not expanded; ties are merged.
"""
import argparse, json, re, struct, sys, zipfile
import xml.etree.ElementTree as ET

# loudness 0..1 for each dynamic mark (fp, sfp: the piano after the accent)
LOUD = {'ppp': 0.15, 'pp': 0.25, 'p': 0.4, 'mp': 0.55, 'mf': 0.7, 'f': 0.85, 'ff': 1.0, 'fff': 1.0, 'fp': 0.4, 'sfp': 0.4}
ESPR = re.compile(r'espr|dolce|cantabile', re.I)
SWELL = re.compile(r'^\s*(cresc|dim|decresc)', re.I)
STEP = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def musicxml_root(path):
    if path.endswith('.mxl'):
        z = zipfile.ZipFile(path)
        name = re.search(r'full-path="([^"]+)"', z.read('META-INF/container.xml').decode()).group(1)
        return ET.fromstring(z.read(name))
    return ET.parse(path).getroot()


def musicxml_parts(path):
    root = musicxml_root(path)
    names = {p.get('id'): (p.findtext('part-name') or '').strip() for p in root.iter('score-part')}
    parts, meter = {}, 4
    marks = {'dynamics': {}, 'hairpins': {}, 'espr': {}}   # keyed by beat: the same mark in two parts counts once
    for part in root.iter('part'):
        notes, t, div, bar_start, open_ties, open_wedges = [], 0.0, 1, [], {}, {}
        for measure in part.iter('measure'):
            bar_start.append(t)
            for el in measure:
                if el.tag == 'attributes':
                    div = int(el.findtext('divisions') or div)
                    if el.find('time/beats') is not None:
                        meter = int(el.findtext('time/beats')) * 4 / int(el.findtext('time/beat-type'))
                elif el.tag == 'direction':
                    at = t + int(el.findtext('offset') or 0) / div
                    for dt in el.iter('direction-type'):
                        for d in dt.iter('dynamics'):
                            for c in d:
                                if c.tag in LOUD:
                                    marks['dynamics'][at] = LOUD[c.tag]
                        for w in dt.iter('wedge'):
                            kind = w.get('type')
                            if kind in ('crescendo', 'diminuendo'):
                                open_wedges[w.get('number', '1')] = (at, 'cresc' if kind == 'crescendo' else 'dim')
                            elif kind == 'stop' and w.get('number', '1') in open_wedges:
                                start, k = open_wedges.pop(w.get('number', '1'))
                                marks['hairpins'][start] = (at, k)
                        for w in dt.iter('words'):
                            text = w.text or ''
                            if ESPR.search(text):
                                marks['espr'][at] = True
                            elif SWELL.match(text):   # "cresc." / "dim." in words: until the next dynamic mark
                                marks['hairpins'][at] = (None, 'cresc' if text.strip().lower().startswith('cresc') else 'dim')
                elif el.tag in ('backup', 'forward'):
                    d = int(el.findtext('duration')) / div
                    t += -d if el.tag == 'backup' else d
                elif el.tag == 'note':
                    if el.find('grace') is not None:
                        continue
                    d = int(el.findtext('duration') or 0) / div
                    start = t - (last_d if el.find('chord') is not None else 0)
                    if el.find('chord') is None:
                        last_d, t = d, t + d
                    p = el.find('pitch')
                    if p is None:
                        continue
                    m = 12 * (int(p.findtext('octave')) + 1) + STEP[p.findtext('step')] + int(float(p.findtext('alter') or 0))
                    ties = {x.get('type') for x in el.findall('tie')}
                    staff, voice = el.findtext('staff') or '1', el.findtext('voice') or '1'
                    key = (m, staff, voice)   # a tie joins notes of one voice; a chord tone elsewhere doesn't break it
                    if 'stop' in ties and key in open_ties:
                        open_ties[key][2] += d
                        n = open_ties[key]
                    else:
                        n = [start, m, d, staff, voice]
                        notes.append(n)
                    if 'start' in ties:
                        open_ties[key] = n
                    else:
                        open_ties.pop(key, None)
        parts[part.get('id')] = (names.get(part.get('id'), ''), notes, bar_start)
    tempo = next((float(s.get('tempo')) for s in root.iter('sound') if s.get('tempo')), None)
    return parts, meter, tempo, marks


def midi_parts(path):
    data = open(path, 'rb').read()
    _, ntrk, tpq = struct.unpack('>HHH', data[8:14])
    pos, parts, tempos, raw = 14, {}, [], {}
    for k in range(ntrk):
        size = struct.unpack('>I', data[pos + 4:pos + 8])[0]
        trk, pos = data[pos + 8:pos + 8 + size], pos + 8 + size
        i, tick, status, on, notes, name = 0, 0, 0, {}, [], ''
        while i < len(trk):
            delta = 0
            while True:
                b = trk[i]; i += 1
                delta = (delta << 7) | (b & 0x7F)
                if b < 0x80:
                    break
            tick += delta
            if trk[i] >= 0x80:
                status = trk[i]; i += 1
            if status == 0xFF:
                kind, ln = trk[i], trk[i + 1]; i += 2
                if kind == 3:
                    name = trk[i:i + ln].decode('latin-1')
                elif kind == 0x51:
                    tempos.append((tick, int.from_bytes(trk[i:i + 3], 'big')))
                i += ln
            elif status in (0xF0, 0xF7):
                ln = trk[i]; i += 1 + ln
            else:
                hi = status & 0xF0
                a = trk[i]; b = trk[i + 1] if hi not in (0xC0, 0xD0) else 0
                i += 1 if hi in (0xC0, 0xD0) else 2
                if hi == 0x90 and b > 0:
                    on[a] = tick
                elif hi in (0x80, 0x90) and a in on:
                    s = on.pop(a)
                    notes.append([s / tpq, a, (tick - s) / tpq])
        if notes:
            raw[str(k)] = (name, notes)
    # a performed MIDI's tempo changes (a ritardando) become timing: ticks -> seconds -> beats at the opening tempo
    tempos = sorted(tempos) or [(0, 500000)]
    us0 = tempos[0][1]

    def beats(t):
        acc, last_tick, us = 0.0, 0, tempos[0][1]
        for tick, u in tempos:
            if tick >= t * tpq:
                break
            acc += (tick - last_tick) * us; last_tick, us = tick, u
        return (acc + (t * tpq - last_tick) * us) / us0 / tpq

    for k, (name, notes) in raw.items():
        parts[k] = (name, sorted([beats(s), m, beats(s + d) - beats(s)] for s, m, d in notes), None)
    return parts, 4, round(60e6 / us0, 2), None


def expression(marks, t0, t1, meter, melody):
    """Dynamic marks, hairpins and espressivo spans in beats from t0:
    dynamics [[beat, loudness], ...], hairpins [[from, to, 'cresc'|'dim'], ...] (a written cresc./dim. runs to the
    next mark), espr [[from, to], ...] (to the next dynamic mark or expression word, at most 8 bars)."""
    inside = lambda b: t0 <= b < t1
    dyn = sorted((b, v) for b, v in marks['dynamics'].items() if inside(b))
    nxt = lambda b: next((x for x, _ in dyn if x > b + 1e-6), t1)
    pins = [[a, e if e is not None else nxt(a), k] for a, (e, k) in sorted(marks['hairpins'].items()) if inside(a)]
    starts = sorted(b for b in marks['espr'] if inside(b))
    espr = [[b, min(nxt(b), *(x for x in starts if x > b), b + 8 * meter)] for b in starts]
    end = melody[-1][0] + melody[-1][2] if melody else 0
    r = lambda x: round(min(x, t1, t0 + end + 1e-9) - t0, 4)
    return {'marks': [[r(b), v] for b, v in dyn], 'hairpins': [[r(a), r(e), k] for a, e, k in pins if e > a],
            'espr': [[r(a), r(e)] for a, e in espr if e > a]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('score')
    ap.add_argument('--melody'); ap.add_argument('--accomp', default='')
    ap.add_argument('--transpose', type=int, default=0)
    ap.add_argument('--from-bar', type=int, default=1); ap.add_argument('--to-bar', type=int)
    ap.add_argument('--melody-from-bar', type=int, default=1, help='notes before this bar go to the accompaniment')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    parts, meter, tempo, marks = (midi_parts if a.score.lower().endswith(('.mid', '.midi')) else musicxml_parts)(a.score)
    if a.list or not a.melody:
        for pid, (name, notes, _) in parts.items():
            print(pid, repr(name), len(notes), 'notes, range', min(n[1] for n in notes), max(n[1] for n in notes))
        return
    taken = set()
    # a score's lengths are exact; a performed MIDI's notes overlap (legato), so there it's just the top at each onset
    overlap = float('inf') if a.score.lower().endswith(('.mid', '.midi')) else 1e-6
    bars = parts[a.melody.partition(':')[0]][2]
    t0 = bars[a.from_bar - 1] if bars else (a.from_bar - 1) * meter
    t1 = (bars[a.to_bar] if bars and a.to_bar < len(bars) else 1e9) if a.to_bar else 1e9
    melody_from = bars[a.melody_from_bar - 1] if bars else (a.melody_from_bar - 1) * meter

    def pick(spec, top_only):
        pid, staff, voice = (spec.split(':') + ['', ''])[:3]
        notes = sorted((n for n in parts[pid][1] if t0 <= n[0] < t1 and n[2] > 0 and (not staff or n[3:4] == [staff])
                        and (not voice or n[4:5] == [voice])
                        and id(n) not in taken), key=lambda n: n[:3])
        if top_only:   # one line, the "skyline": the highest note at each onset, unless a higher one is still sounding
            best = {}
            for n in notes:
                if n[0] >= melody_from and (n[0] not in best or n[1] > best[n[0]][1]):
                    best[n[0]] = n
            notes, cur = [], None
            for n in sorted(best.values(), key=lambda n: n[:3]):
                if cur is None or n[0] >= cur[0] + cur[2] - overlap or n[1] >= cur[1]:
                    notes.append(n); cur = n
            taken.update(id(n) for n in notes)
            notes = [n[:3] for n in notes]
            for n, nxt in zip(notes, notes[1:]):   # legato overlaps: end each note where the next begins
                n[2] = min(n[2], nxt[0] - n[0])
        return [[round(n[0] - t0, 4), n[1] + a.transpose, round(n[2], 4)] for n in notes]

    melody = pick(a.melody, True)
    out = {'beatsPerBar': meter, 'tempo': tempo, 'melody': melody,
           'accomp': sorted(n for p in a.accomp.split(',') if p for n in pick(p, False))}
    if marks and marks['dynamics']:
        out['dynamics'] = expression(marks, t0, t1, meter, melody)
    json.dump(out, sys.stdout, separators=(',', ':'))


if __name__ == '__main__':
    main()
