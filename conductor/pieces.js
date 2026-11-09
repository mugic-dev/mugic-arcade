// Pieces for the Conductor: our own arrangements of public-domain works.
// Times are in beats from the downbeat of bar 1 (beat 0); a note is [beat, midi, beats].
//   sections: stage left -> right; yaw (degrees from the calibrated center) is where the player points to cue it
//     (from a recorded player: a quick wide point, about ±60-75° for the far sections; the nearest section wins)
//   cues: { beat, section } — the section's entry, cued on that very beat (see index.html, cueGesture)
//   dynamics: { beat, mark, level 0..1 }; hairpins: { from, to, kind: 'cresc' | 'dim' }
//   fermata: beat of the final held chord (the orchestra holds until the cutoff)
const PIECES = (() => {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = n => { const m = /^([A-G])(#|b)?(\d)$/.exec(n); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  // "F#5 E5 D5" in equal note lengths of `dur` beats from `start`
  const seq = (start, notes, dur) => notes.trim().split(/\s+/).map((n, i) => [start + i * dur, midi(n), dur]);
  const bar = n => 4 * (n - 1);   // first beat of bar n (4/4)

  // ---- Pachelbel, Canon in D: three-voice canon over the ground bass, 2 bars apart ----
  const GROUND = 'D3 A2 B2 F#2 G2 D2 G2 A2';
  const PHRASES = [   // the first violin's line, two bars each
    ['F#5 E5 D5 C#5 B4 A4 B4 C#5', 1],
    ['D5 C#5 B4 A4 G4 F#4 G4 E4', 1],
    ['D4 F#4 A4 G4 F#4 D4 F#4 E4 D4 B3 D4 A4 G4 B4 A4 G4', 0.5],
    ['F#4 D4 E4 C#5 D5 F#5 A5 A4 B4 G4 A4 F#4 D4 D5 D5 C#5', 0.5],
    ['D5 C#5 D5 D4 C#4 A4 E4 F#4 D4 D5 C#5 B4 C#5 F#5 A5 B5 G5 F#5 E5 G5 F#5 E5 D5 C#5 B4 A4 G4 F#4 E4 G4 F#4 E4', 0.25],
    ['D4 E4 F#4 G4 A4 E4 A4 G4 F#4 B4 A4 G4 A4 G4 F#4 E4 D4 B3 B4 C#5 D5 C#5 B4 A4 G4 F#4 E4 B4 A4 B4 A4 G4', 0.25],
    ['F#5 E5 D5 C#5 B4 A4 B4 C#5', 1],
    ['D5 C#5 B4 A4 G4 F#4 G4 E4', 1],
  ];
  const END = bar(19);
  // a canon voice entering at `entry`, cut off where the final chord starts
  const voice = entry => PHRASES.flatMap(([n, d], i) => seq(entry + 8 * i, n, d)).filter(([b]) => b < END);
  const ground = (octave, from) => Array.from({ length: (END - from) / 8 }, (_, i) =>
    seq(from + 8 * i, GROUND.replace(/\d/g, d => +d + octave), 1)).flat()
    .map(([b, m, d]) => [b, m < midi('E1') + 2 ? m + 12 : m, d]);   // the bass has no low D: up an octave

  const canon = {
    id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel', meter: 4, tempo: 60, bars: 19,
    blurb: 'Cellos lay down the ground bass; each violin section, then the violas, enters two bars apart with the same tune.',
    sections: [
      { id: 'vln1', name: 'Violins I', inst: 'vln', yaw: -60, players: 6 },
      { id: 'vln2', name: 'Violins II', inst: 'vln', yaw: -25, players: 6 },
      { id: 'vla', name: 'Violas', inst: 'vla', yaw: 20, players: 4 },
      { id: 'vc', name: 'Cellos', inst: 'vc', yaw: 45, players: 4 },
      { id: 'cb', name: 'Basses', inst: 'cb', yaw: 72, players: 2 },
    ],
    parts: {
      vc: [...ground(0, 0), [END, midi('D3'), 4]],
      cb: [...ground(-1, bar(9)), [END, midi('D2'), 4]],
      vln1: [...voice(bar(3)), [END, midi('F#5'), 4]],
      vln2: [...voice(bar(5)), [END, midi('D5'), 4]],
      vla: [...voice(bar(7)), [END, midi('A4'), 4]],
    },
    cues: [
      { beat: bar(1), section: 'vc' },
      { beat: bar(3), section: 'vln1' },
      { beat: bar(5), section: 'vln2' },
      { beat: bar(7), section: 'vla' },
      { beat: bar(9), section: 'cb' },
    ],
    dynamics: [
      { beat: bar(1), mark: 'p', level: 0.3 },
      { beat: bar(7), mark: 'mp', level: 0.45 },
      { beat: bar(9), mark: 'mf', level: 0.6 },
      { beat: bar(13), mark: 'f', level: 0.85 },
      { beat: bar(17), mark: 'mp', level: 0.45 },
      { beat: bar(19), mark: 'p', level: 0.3 },
    ],
    hairpins: [{ from: bar(11), to: bar(13), kind: 'cresc' }, { from: bar(15), to: bar(17), kind: 'dim' }],
    fermata: END,
  };

  // target loudness at `beat`, following the marks and hairpins
  const target = (p, beat) => {
    const marks = p.dynamics, i = marks.findLastIndex(d => d.beat <= beat), cur = marks[Math.max(0, i)];
    const pin = p.hairpins.find(h => beat >= h.from && beat < h.to), next = marks[i + 1];
    if (!pin || !next) return cur.level;
    return cur.level + (next.level - cur.level) * (beat - pin.from) / (pin.to - pin.from);
  };

  return { list: [canon], target };
})();
