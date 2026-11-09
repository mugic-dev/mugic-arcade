// Orchestra sound: VSCO 2 CE string samples (samples/<inst>/<midi>.wav, looped for long notes), one channel per
// section (level + brightness), a synthetic hall reverb, and noise-burst applause.
// The score clock maps beats to audio time at a rate (beats/s) the tempo follower changes as you conduct.
const Orchestra = (() => {
  let ctx = null, master, reverb, index = null;
  const buffers = {}, channels = {};
  let anchor = { t: 0, beat: 0, rate: 1 };   // beat position `beat` at audio time `t`, moving at `rate` beats/s
  const voices = new Set();

  const now = () => ctx.currentTime;
  const beatAt = t => anchor.beat + (t - anchor.t) * anchor.rate;
  const timeOf = beat => anchor.t + (beat - anchor.beat) / anchor.rate;
  const setRate = (rate, t = now()) => { anchor = { t, beat: beatAt(t), rate }; };
  const startAt = (beat, t, rate) => { anchor = { t, beat, rate }; };

  function hall(seconds = 2.4) {   // decaying stereo noise as an impulse response
    const n = Math.round(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; ++c) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < n; ++i) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.5);
    }
    return ir;
  }

  async function init() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    reverb = ctx.createConvolver(); reverb.buffer = hall();
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    reverb.connect(wet).connect(comp);
    index = await (await fetch('samples/index.json')).json();
  }

  // one sample file, with a timeout and a few retries; throws naming the file if it can't be had
  async function fetchSample(url) {
    for (let attempt = 1; ; ++attempt) {
      const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 10000);
      try {
        const r = await fetch(url, { signal: abort.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await ctx.decodeAudioData(await r.arrayBuffer());
      } catch (err) {
        console.error('sample', url, 'attempt', attempt, err);
        if (attempt >= 3) throw new Error(`${url}: ${err.message || err}`);
      } finally { clearTimeout(timer); }
    }
  }

  // Load the samples a piece needs (six at a time); onProgress(0..1).
  async function load(piece, onProgress = () => {}) {
    await init();
    const insts = PIECES.instruments(piece);
    const jobs = insts.flatMap(inst => index.insts[inst].notes.map(m => [inst, m])).filter(([i, m]) => !buffers[i + m]);
    let done = 0, next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const [inst, m] = jobs[next++];
        buffers[inst + m] = await fetchSample(`samples/${inst}/${m}.wav`);
        onProgress(++done / jobs.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    for (const s of piece.sections) {
      if (channels[s.id]) continue;
      const gain = ctx.createGain(), tone = ctx.createBiquadFilter(), send = ctx.createGain();
      tone.type = 'lowpass'; tone.frequency.value = 3000; send.gain.value = 1;
      gain.connect(tone).connect(master); tone.connect(send).connect(reverb);
      channels[s.id] = { gain, tone, inst: s.inst };
    }
  }

  // Section loudness 0..1 (gain and brightness), ramped to avoid zipper noise.
  function level(id, v) {
    const ch = channels[id], t = now();
    ch.gain.gain.setTargetAtTime(0.08 + 0.5 * v * v, t, 0.08);
    ch.tone.frequency.setTargetAtTime(900 + 6000 * v, t, 0.08);
  }

  // Play `midi` on a section from audio time t for `secs`; returns the voice (for an early release).
  // pizzicato and percussion (oneshot) ring out by themselves; drums (unpitched) play at their own pitch
  function note(id, midi, t, secs, vel = 1, inst = channels[id].inst) {
    const ch = channels[id], info = index.insts[inst], list = info.notes;
    const s = list.reduce((a, b) => Math.abs(b - midi) < Math.abs(a - midi) ? b : a);
    const src = ctx.createBufferSource(), env = ctx.createGain();
    src.buffer = buffers[inst + s];
    src.playbackRate.value = Math.pow(2, (midi - s) / 12);
    if (info.unpitched) src.playbackRate.value = 1;
    if (!info.oneshot) { src.loop = true; [src.loopStart, src.loopEnd] = index.loop; }
    const attack = info.oneshot ? 0.003 : Math.min(0.06, secs * 0.3);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + attack);
    src.connect(env).connect(ch.gain);
    src.start(t);
    const v = { src, env, end: Infinity };
    v.release = (at = now(), fade = 0.25) => {
      if (at >= v.end) return;
      v.end = at;
      env.gain.cancelScheduledValues(at); env.gain.setTargetAtTime(0, at, fade / 3);
      src.stop(at + fade * 2);
    };
    if (Number.isFinite(secs) && !info.oneshot) v.release(t + secs, Math.min(0.3, 0.1 + secs * 0.2));
    voices.add(v); src.onended = () => voices.delete(v);
    return v;
  }

  // a metronome tick (count-in), accented on the first beat of the bar
  function click(t, accent) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1600 : 1100;
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.07);
  }

  const releaseAll = (fade = 0.4) => voices.forEach(v => v.release(now(), fade));

  // Applause: `amount` 0..1 sets how many claps per second and how long it lasts.
  function applause(amount) {
    const secs = 2 + 5 * amount, n = Math.round(secs * (20 + 160 * amount)), t0 = now();
    const clap = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.03), ctx.sampleRate), d = clap.getChannelData(0);
    for (let i = 0; i < d.length; ++i) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
    for (let i = 0; i < n; ++i) {
      const t = t0 + Math.random() * secs, fade = 1 - (t - t0) / secs;
      const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
      src.buffer = clap; f.type = 'bandpass'; f.frequency.value = 800 + Math.random() * 1800; f.Q.value = 1.2;
      g.gain.value = (0.15 + Math.random() * 0.3) * Math.min(1, fade * 2); p.pan.value = Math.random() * 2 - 1;
      src.connect(f).connect(g).connect(p).connect(master); p.connect(reverb);
      src.start(t);
    }
  }

  return { load, level, note, click, releaseAll, applause, beatAt, timeOf, setRate, startAt, now: () => (ctx ? now() : 0),
           get rate() { return anchor.rate; }, resume: () => ctx && ctx.resume() };
})();
