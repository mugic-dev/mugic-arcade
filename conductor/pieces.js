// Pieces for the Conductor: our own arrangements of public-domain works.
// Times are in beats (the beats you conduct) from the downbeat of bar 1 (beat 0); a note is [beat, midi, beats, inst?]
// (inst: a sample set other than the section's, e.g. 'tp' in the brass section).
//   meter: beats per bar (1 for a waltz conducted in one); tempo: marked beats per minute, or tempos: [[beat, bpm], ...]
//     for a tempo that changes (linear in between); the orchestra follows within ±40% of the marked tempo
//   sections: stage left -> right; look: how the players are drawn; yaw (degrees from the calibrated center) is where
//     the player points to cue it (Canon: from a recorded player; otherwise spread evenly from -70° to +70°)
//   cues: { beat, section } — the section's entry, cued on that very beat (see index.html, cueGesture)
//   dynamics: { beat, mark, level 0..1 }; hairpins: { from, to, kind: 'cresc' | 'dim' }
//   fermata: beat of the final held chord (the orchestra holds until the cutoff)
const PIECES = (() => {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = n => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(n); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  const tag = (n, inst) => inst ? [...n.slice(0, 3), inst] : n;
  const up = (notes, k) => notes.map(n => [n[0], n[1] + k, ...n.slice(2)]);
  const as = (notes, inst) => notes.map(n => tag(n, inst));
  // "F#5 E5 D5" in equal note lengths of `dur` beats from `start`
  const seq = (start, notes, dur) => notes.trim().split(/\s+/).map((n, i) => [start + i * dur, midi(n), dur]);
  // "F#4:1.5 E4:.5 r:1 D4 | ..." — each note with its length in beats (kept until changed), r a rest, | ignored
  function mel(start, text) {
    let b = start, d = 1; const out = [];
    for (const tok of text.trim().split(/[\s|]+/).filter(Boolean)) {
      const [n, len] = tok.split(':');
      if (len) d = len.includes('/') ? len.split('/')[0] / len.split('/')[1] : +len;   // 1/3: a quarter in a waltz in one
      if (n !== 'r') out.push([b, midi(n), d]);
      b += d;
    }
    return out;
  }
  // "D:4 A7:2 Bm:2" (symbol:beats) -> [[beat, pitch classes (root first), beats], ...]
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10] };
  function chords(start, text) {
    let b = start; const out = [];
    for (const tok of text.trim().split(/[\s|]+/).filter(Boolean)) {
      const [sym, len] = tok.split(':'), m = /^([A-G][#b]?)(.*)$/.exec(sym), root = midi(m[1] + '4') % 12;
      out.push([b, QUAL[m[2]].map(q => (root + q) % 12), +len]);
      b += +len;
    }
    return out;
  }
  const tone = (pcs, lo, k = 0) => { for (let n = lo, seen = -1; ; ++n) if (pcs.includes(n % 12) && ++seen === k) return n; };
  const pad = (chs, lo, k = 0, inst) => chs.map(([b, pcs, d]) => tag([b, tone(pcs, lo, k), d], inst));
  const roots = (chs, lo, inst) => chs.map(([b, pcs, d]) => tag([b, tone([pcs[0]], lo), d], inst));
  // a note every `step` beats through each chord, at `offsets` within the step (repeated bass, afterbeats)
  const pulse = (chs, lo, k, step, offsets, len, inst) => chs.flatMap(([b, pcs, d]) =>
    Array.from({ length: Math.round(d / step) }, (_, i) => offsets.map(o => tag([b + i * step + o, tone(pcs, lo, k), len], inst))).flat());
  const hits = (beats, inst) => beats.map(b => [b, 60, 1, inst]);
  const short = (notes, max) => notes.map(n => [n[0], n[1], Math.min(n[2], max), ...n.slice(3)]);

  // ---- Pachelbel, Canon in D: three-voice canon over the ground bass, 2 bars apart ----
  const canon = (() => {
    const bar = n => 4 * (n - 1);
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
    const voice = entry => PHRASES.flatMap(([n, d], i) => seq(entry + 8 * i, n, d)).filter(([b]) => b < END);
    const ground = (octave, from) => Array.from({ length: (END - from) / 8 }, (_, i) =>
      seq(from + 8 * i, GROUND.replace(/\d/g, d => +d + octave), 1)).flat()
      .map(([b, m, d]) => [b, m < midi('E1') + 2 ? m + 12 : m, d]);   // the bass has no low D: up an octave
    return {
      id: 'canon', title: 'Canon in D', composer: 'Johann Pachelbel', meter: 4, tempo: 60, bars: 19,
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
      cues: [{ beat: 0, section: 'vc' }, { beat: bar(3), section: 'vln1' }, { beat: bar(5), section: 'vln2' },
             { beat: bar(7), section: 'vla' }, { beat: bar(9), section: 'cb' }],
      dynamics: [{ beat: 0, mark: 'p', level: 0.3 }, { beat: bar(7), mark: 'mp', level: 0.45 }, { beat: bar(9), mark: 'mf', level: 0.6 },
                 { beat: bar(13), mark: 'f', level: 0.85 }, { beat: bar(17), mark: 'mp', level: 0.45 }, { beat: bar(19), mark: 'p', level: 0.3 }],
      hairpins: [{ from: bar(11), to: bar(13), kind: 'cresc' }, { from: bar(15), to: bar(17), kind: 'dim' }],
      fermata: END,
    };
  })();

  // ---- Beethoven, Symphony No. 9, "Ode to Joy": the theme climbs from the low strings to the full orchestra ----
  const ode = (() => {
    const bar = n => 4 * (n - 1);
    // Four-part harmony from the public-domain SATB setting on the Mutopia Project (BeethovenLv/ode, P. Chubb),
    // transposed from G to D; [bars 1-8, bars 9-16] of the hymn (the second half is the B phrase + the return)
    const V = {
      s: ['F#4:1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | F#4:1.5 E4:.5 E4:2 | F#4:1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4:1.5 D4:.5 D4:2',
          'E4:1 E4 F#4 D4 | E4 F#4:.5 G4 F#4:1 D4 | E4 F#4:.5 G4 F#4:1 E4 | D4 E4 A3:2 | F#4:1 F#4 G4 A4 | A4 G4 F#4 E4 | D4 D4 E4 F#4 | E4:1.5 D4:.5 D4:2'],
      a: ['D4:1 D4 E4 D4 | D4:1.5 E4:.5 D4:1 C#4 | A3 A3 C#4 D4 | D4:1.5 C#4:.5 C#4:2 | D4:1 D4 E4 D4 | D4:1.5 E4:.5 D4:1 C#4 | A3 A3 C#4 D4 | D4 C#4 A3:2',
          'A3:1 A3 A3 A3 | A3 A3 A3 A3 | A3 A3 C#4 C#4 | B3 G#3 A3:2 | A3:1 D4 E4 E4 | F#4 D4:.5 E4 D4:1 B3 | B3 A3 C#4 D4 | D4 C#4 D4:2'],
      t: ['A3:1 A3 G3 F#3 | B3:1.5 A3:.5 A3:1 A3 | F#3 F#3 A3 A3 | A3:1.5 A3:.5 A3:2 | A3:1 A3 G3 F#3 | B3:1.5 A3:.5 A3:1 A3 | F#3 F#3 A3 A3 | A3 A3 F#3:2',
          'C#3:1 C#3 D3 B2 | C#3 D3:.5 E3 D3:1 B2 | C#3 C#3 C#3 F#3 | F#3 E3 D3 C#3 | D3 A3 C4 C4 | D4:1.5 A3:.5 A3:1 G3 | D3 D3 G3 A3 | A3 A3 F#3:2'],
      b: ['D3:1 D3 D3 D3 | B2:1.5 C#3:.5 D3:1 A2 | F#3 F#3 E3 D3 | A2:1.5 A2:.5 A2:2 | D3:1 D3 D3 D3 | B2:1.5 C#3:.5 D3:1 A2 | F#3 F#3 E3 D3 | A2 A2 D2:2',
          'A2:1 A2 A2 A2 | A2 A2 A2 A2 | A2 A2 A#2 A#2 | B2 E2 A2:2 | D3:1 D3 C3 C3 | B2:1.5 C#3:.5 D3:1 G2 | G2 F#2 E2 D2 | A2 A2 D2:2'],
    };
    // voice v of half h from `start`, shifted k semitones, kept at or above `low` (an octave up below it)
    const part = (v, h, start, k = 0, inst, low = 0) => as(mel(start, V[v][h]).map(([b, m, d]) => [b, m + k < low ? m + k + 12 : m + k, d]), inst);
    const from = (notes, b) => notes.filter(n => n[0] >= b);
    const s2 = bar(9), s3 = bar(17), s4 = bar(25), END = bar(33), FINAL = chords(END, 'D:4');
    return {
      id: 'ode', title: 'Ode to Joy (Symphony No. 9)', composer: 'Ludwig van Beethoven', meter: 4, tempo: 76, bars: 33,
      sections: [
        { id: 'vln', name: 'Violins', inst: 'vln', players: 8 },
        { id: 'vla', name: 'Violas', inst: 'vla', players: 4 },
        { id: 'ww', name: 'Winds', inst: 'fl', look: 'ww', players: 4 },
        { id: 'br', name: 'Brass & Timpani', inst: 'tp', look: 'br', players: 5 },
        { id: 'vc', name: 'Cellos', inst: 'vc', players: 4 },
        { id: 'cb', name: 'Basses', inst: 'cb', players: 2 },
      ],
      parts: {
        // the theme alone in the cellos; under the violas, the alto line a third below; then the tenor, then the bass
        vc: [...part('s', 0, 0, -12), ...part('a', 0, s2), ...part('t', 1, s3), ...part('b', 0, s4), ...pad(FINAL, 50)],
        vla: [...part('s', 0, s2), ...part('a', 1, s3), ...part('a', 0, s4), ...pad(FINAL, 57, 1)],
        cb: [...from(part('b', 0, s2, -12, undefined, 30), bar(13)), ...part('b', 1, s3, -12, undefined, 30),
             ...part('b', 0, s4, -12, undefined, 30), ...roots(FINAL, 38)],
        vln: [...part('s', 1, s3, 12), ...part('s', 0, s4, 12), ...pad(FINAL, 74, 1)],
        ww: [...from(part('a', 1, s3, 12, 'ob'), bar(21)), ...from(part('t', 1, s3, 12, 'cl'), bar(21)),
             ...part('s', 0, s4, 12), ...part('a', 0, s4, 12, 'ob'), ...part('t', 0, s4, 12, 'cl'),
             ...pad(FINAL, 74, 2), ...pad(FINAL, 62, 0, 'cl')],
        br: [...part('s', 0, s4), ...part('t', 0, s4, 0, 'hn'), ...part('a', 0, s4, 0, 'tb'), ...part('b', 0, s4, 0, 'tu'),
             ...hits(Array.from({ length: 8 }, (_, i) => s4 + 4 * i), 'timp'),
             ...pad(FINAL, 62), ...pad(FINAL, 57, 1, 'hn'), ...roots(FINAL, 38, 'tb'), ...hits([END], 'timp')],
      },
      cues: [{ beat: 0, section: 'vc' }, { beat: s2, section: 'vla' }, { beat: bar(13), section: 'cb' },
             { beat: s3, section: 'vln' }, { beat: bar(21), section: 'ww' }, { beat: s4, section: 'br' }],
      dynamics: [{ beat: 0, mark: 'pp', level: 0.2 }, { beat: s2, mark: 'p', level: 0.32 }, { beat: s3, mark: 'mp', level: 0.45 },
                 { beat: bar(21), mark: 'mf', level: 0.6 }, { beat: s4, mark: 'ff', level: 0.95 }],
      hairpins: [{ from: bar(23), to: s4, kind: 'cresc' }],
      fermata: END,
    };
  })();

  // ---- Johann Strauss II, The Blue Danube: a waltz conducted in one (one beat per bar of 3/4) ----
  const danube = (() => {
    const T = '1/3';
    const THEME = `D4:${T} D4 F#4 | A4:1 | r:${T} A5 A5 | r F#5 F#5 | D4 D4 F#4 | A4:1 | r:${T} A5 A5 | r G5 G5 |
      C#4 C#4 E4 | B4:1 | r:${T} B5 B5 | r G5 G5 | C#4 C#4 E4 | B4:1 | r:${T} B5 B5 | r F#5 F#5 |
      D4:${T} D4 F#4 | A4:${T} D5:2/3 | r:${T} D6 D6 | r A5 A5 | D4:${T} D4 F#4 | A4:${T} D5:2/3 | r:${T} D6 D6 | r B5 B5`;
    const HT = 'D:7 A7:9 D:7 G:1';
    const s1 = 16, s2 = 40, END = 66;   // an unhurried introduction: horn call at bar 5, basses at bar 9
    const h1 = chords(s1, HT), h2 = chords(s2, HT), CAD = chords(64, 'A7:2'), FINAL = chords(END, 'D:1');
    const all = [...chords(8, 'D:8'), ...h1, ...h2, ...CAD];
    const after = (chs, lo, k) => pulse(chs, lo, k, 1, [1 / 3, 2 / 3], 0.25);
    const theme1 = up(mel(s1, THEME), -12);
    return {
      id: 'danube', title: 'The Blue Danube', composer: 'Johann Strauss II', meter: 1, tempo: 56, bars: 67,
      sections: [
        { id: 'vln', name: 'Violins', inst: 'vln', players: 8 },
        { id: 'vla', name: 'Violas', inst: 'vla', players: 4 },
        { id: 'ww', name: 'Flutes', inst: 'fl', look: 'ww', players: 2 },
        { id: 'br', name: 'Horns', inst: 'hn', look: 'br', players: 4 },
        { id: 'vc', name: 'Cellos', inst: 'vc', players: 4 },
        { id: 'cb', name: 'Basses', inst: 'cbp', look: 'cb', players: 2 },
      ],
      parts: {
        vln: [[0, midi('A4'), 16], [0, midi('D5'), 16], ...mel(s2, THEME), ...pad(CAD, 76), ...pad(FINAL, 74, 1)],
        br: [...mel(4, `D4:${T} D4 F#4 | A4:2 | r:2 | D4:${T} D4 F#4 | A4:2`), ...theme1.map(([b, m, d]) => [b, m > 69 ? m - 12 : m, d]), ...pad(FINAL, 62)],
        cb: [...pulse(all, 38, 0, 1, [0], 1 / 3), ...roots(FINAL, 38, 'cb')],
        vc: [...theme1, ...pulse(h2, 48, 0, 1, [0], 1 / 3), ...pad(FINAL, 50)],
        vla: [...after([...h1, ...h2, ...CAD], 57, 1), ...after([...h1, ...h2, ...CAD], 60, 2)].filter(n => n[0] >= s1 + 4).concat(pad(FINAL, 57, 1)),
        ww: [...up(mel(s2 + 16, THEME.split('|').slice(16).join('|')), 12), ...pad(CAD, 81), ...pad(FINAL, 81, 1)],
      },
      cues: [{ beat: 0, section: 'vln' }, { beat: 4, section: 'br' }, { beat: 8, section: 'cb' }, { beat: s1, section: 'vc' },
             { beat: s1 + 4, section: 'vla' }, { beat: s2, section: 'vln' }, { beat: s2 + 16, section: 'ww' }],
      dynamics: [{ beat: 0, mark: 'pp', level: 0.2 }, { beat: s1, mark: 'p', level: 0.35 }, { beat: s1 + 16, mark: 'mp', level: 0.45 },
                 { beat: s2, mark: 'mf', level: 0.6 }, { beat: s2 + 16, mark: 'f', level: 0.8 }],
      hairpins: [{ from: s1 + 12, to: s1 + 16, kind: 'cresc' }, { from: s2 + 12, to: s2 + 16, kind: 'cresc' }],
      fermata: END,
    };
  })();

  // ---- Grieg, In the Hall of the Mountain King: pizzicato low strings, the tune creeping up the orchestra, faster and faster ----
  const troll = (() => {
    const bar = n => 4 * (n - 1);
    const P1 = 'B3:.5 C#4 D4 E4 F#4 D4 F#4:1 | F4:.5 C#4 F4:1 E4:.5 C4 E4:1 | B3:.5 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4:2';
    const P2 = 'F#4:.5 G#4 A#4 B4 C#5 A#4 C#5:1 | D5:.5 A#4 D5:1 C#5:.5 A#4 C#5:1 | F#4:.5 G#4 A#4 B4 C#5 A#4 C#5:1 | D5:.5 A#4 D5:1 C#5:2';
    const tune = start => [...mel(start, P1), ...mel(start + 16, P2)];
    const H = start => chords(start, 'Bm:16 F#:16');
    // six statements of the theme (8 bars each), growing from bassoons alone to the full orchestra
    const [w, v, x, y, z, q] = [3, 11, 19, 27, 35, 43].map(bar), END = bar(51), FINAL = chords(END, 'Bm:4');
    const low = [...chords(0, 'Bm:8'), ...[w, v, x, y, z, q].flatMap(H)];
    // the accelerando gathers speed: ♩ = 70 at the start, double (140) at the end, as 70·2^(x^1.8)
    const tempos = Array.from({ length: END / 8 + 1 }, (_, i) => [8 * i, Math.round(70 * 2 ** ((8 * i / END) ** 1.8))]);
    const stac = (notes, inst) => short(as(notes, inst), 0.4);
    return {
      id: 'troll', title: 'In the Hall of the Mountain King', composer: 'Edvard Grieg', meter: 4, tempo: 70, tempos, bars: 51,
      sections: [
        { id: 'vln', name: 'Violins', inst: 'vlnp', look: 'vln', players: 8 },
        { id: 'ww', name: 'Bassoons & Winds', inst: 'bns', look: 'ww', players: 4 },
        { id: 'br', name: 'Brass & Timpani', inst: 'hn', look: 'br', players: 5 },
        { id: 'low', name: 'Cellos & Basses', inst: 'vcp', look: 'vc', players: 6 },
      ],
      parts: {
        low: [...pulse(low, 35, 0, 2, [0], 1, 'cbp'), ...pulse(low, 54, 0, 2, [1], 1),
              ...[z, q].flatMap(s => pulse(H(s), 47, 0, 1, [0], 0.4, 'vc')), ...roots(FINAL, 35, 'cbp'), ...pad(FINAL, 47)],
        ww: [...up(tune(w), -12), ...up(tune(v), -12),
             ...[x, y, z, q].flatMap(s => [...stac(up(tune(s), 12), 'ob'), ...stac(tune(s), 'cl')]),
             ...[z, q].flatMap(s => stac(up(tune(s), 24), 'fl')), ...pad(FINAL, 59, 1, 'cl'), ...pad(FINAL, 74, 2, 'fl')],
        vln: [...tune(v), ...[x, y, z, q].flatMap(s => stac(up(tune(s), 12), 'vln')),
              ...[z, q].flatMap(s => stac(tune(s), 'vln')), ...pad(FINAL, 71, 2, 'vln')],
        br: [...stac(tune(y)), ...[z, q].flatMap(s => [...stac(tune(s)), ...stac(tune(s), 'tp')]),
             ...[y, z, q].flatMap(s => [...roots(H(s), 35, 'tb'), ...roots(H(s), 23, 'tu')]),
             ...hits(Array.from({ length: 16 }, (_, i) => z + 2 * i), 'timp'), ...hits(Array.from({ length: 32 }, (_, i) => q + i), 'timp'),
             ...hits([z, q, END], 'cym'), ...roots(FINAL, 35, 'tb'), ...pad(FINAL, 59), ...pad(FINAL, 66, 0, 'tp'), ...hits([END], 'timp')],
      },
      cues: [{ beat: 0, section: 'low' }, { beat: w, section: 'ww' }, { beat: v, section: 'vln' }, { beat: y, section: 'br' }],
      dynamics: [{ beat: 0, mark: 'pp', level: 0.2 }, { beat: v, mark: 'p', level: 0.32 }, { beat: x, mark: 'mp', level: 0.45 },
                 { beat: y, mark: 'mf', level: 0.6 }, { beat: z, mark: 'f', level: 0.8 }, { beat: q, mark: 'ff', level: 0.97 }],
      hairpins: [{ from: bar(23), to: y, kind: 'cresc' }, { from: bar(39), to: q, kind: 'cresc' }],
      fermata: END,
    };
  })();

  const list = [canon, ode, danube, troll];
  for (const p of list) {   // sections without a yaw: spread evenly across ±70°
    const n = p.sections.length;
    p.sections.forEach((s, i) => { if (s.yaw == null) s.yaw = Math.round(-70 + 140 * i / (n - 1)); });
  }

  // target loudness at `beat`, following the marks and hairpins
  const target = (p, beat) => {
    const marks = p.dynamics, i = marks.findLastIndex(d => d.beat <= beat), cur = marks[Math.max(0, i)];
    const pin = p.hairpins.find(h => beat >= h.from && beat < h.to), next = marks[i + 1];
    if (!pin || !next) return cur.level;
    return cur.level + (next.level - cur.level) * (beat - pin.from) / (pin.to - pin.from);
  };
  // marked tempo (beats per minute) at `beat`
  const tempoAt = (p, beat) => {
    const t = p.tempos;
    if (!t) return p.tempo;
    const i = t.findLastIndex(([b]) => b <= beat);
    if (i < 0) return t[0][1];
    if (i === t.length - 1) return t[i][1];
    return t[i][1] + (t[i + 1][1] - t[i][1]) * (beat - t[i][0]) / (t[i + 1][0] - t[i][0]);
  };
  // every sample set a piece plays
  const instruments = p => [...new Set([...p.sections.map(s => s.inst), ...Object.values(p.parts).flat().map(n => n[3]).filter(Boolean)])];

  return { list, target, tempoAt, instruments };
})();
