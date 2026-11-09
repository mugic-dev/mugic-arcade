// Beat detection for the Conductor. Feed it the MUGIC pose each frame; it calls onBeat({ t, size, yaw }) at each
// ictus: t in seconds (performance clock) at the bottom of the stroke, size = height of the stroke in degrees of
// pitch (sets the dynamics), yaw = where the hand pointed over the stroke (picks the section being cued).
//   mode 'dip'   the bottom of each down-up dip of the hand (pitch), the conductor's ictus
//   mode 'flick' the shared flick detector (a sharp beat in the air), for players whose dips don't register
// Beats are kept apart by at least MIN_GAP seconds, so a bouncy rebound doesn't count twice.
const Beat = (() => {
  const MIN_GAP = 0.28, FALL = -25, RISE = 8;   // pitch speeds (degrees/s) that start a stroke / mark its bottom
  const b = { onBeat: null, mode: 'dip', minDip: 4, history: [] };   // history: { t, pitch, yaw } over 1.5 s
  let last = null, vel = 0, falling = false, high = -Infinity, low = { pitch: Infinity, t: 0 }, lastBeat = -Infinity;

  const yawOver = (t0, t1) => {
    const h = b.history.filter(s => s.t >= t0 && s.t <= t1);
    return h.length ? h.reduce((a, s) => a + s.yaw, 0) / h.length : 0;
  };
  const sizeOver = (t0, t1) => {
    const h = b.history.filter(s => s.t >= t0 && s.t <= t1).map(s => s.pitch);
    return h.length ? Math.max(...h) - Math.min(...h) : 0;
  };

  // bottom: the lowest pitch of the stroke (a dip lower than usual is a cue for the section you already face)
  // a small stroke soon after a beat is the rebound of that beat, not a beat: under 30% of your recent beat size,
  // less than 3/4 of your recent beat interval after the last one
  const recent = [];   // { t, size, top, bottom } of the last few beats
  const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
  function rebound(t, size) {
    if (recent.length < 3) return false;
    const ivs = recent.slice(1).map((r, i) => r.t - recent[i].t);
    return size < 0.3 * med(recent.map(r => r.size)) && t - lastBeat < 0.75 * med(ivs);
  }
  // a dip high up that comes early (a hesitation at the top before a big beat) is not an ictus: its bottom is in the
  // upper half of your recent beats' range and it comes before 80% of your recent beat interval
  function upHigh(t, bottom) {
    if (recent.length < 3) return false;
    const ivs = recent.slice(1).map((r, i) => r.t - recent[i].t);
    return bottom > (med(recent.map(r => r.top)) + med(recent.map(r => r.bottom))) / 2 && t - lastBeat < 0.8 * med(ivs);
  }
  function fire(t, size, bottom) {
    if (t - lastBeat < MIN_GAP || rebound(t, size) || upHigh(t, bottom)) return;
    lastBeat = t;
    recent.push({ t, size, top: bottom + size, bottom }); if (recent.length > 5) recent.shift();
    if (b.onBeat) b.onBeat({ t, size, bottom, yaw: yawOver(t - 0.45, t) });
  }

  b.sample = (t, pitch, yaw) => {
    b.history.push({ t, pitch, yaw });
    while (b.history[0].t < t - 1.5) b.history.shift();
    if (last && t > last.t) vel = 0.5 * vel + 0.5 * (pitch - last.pitch) / (t - last.t);
    last = { t, pitch };
    if (b.mode !== 'dip') return;
    high = Math.max(high, pitch);
    if (vel < FALL && !falling) { falling = true; low = { pitch, t }; }   // a new downstroke: find its own bottom
    if (falling && pitch < low.pitch) low = { pitch, t };
    if (falling && vel > RISE) {
      falling = false;
      if (high - low.pitch >= b.minDip) {
        fire(low.t, high - low.pitch, low.pitch);
        high = pitch; low = { pitch, t };
      }
    }
  };

  // true when the hand has held still (pitch and yaw within `deg`) for the last `secs`
  b.still = (t, secs = 0.5, deg = 3) => {
    const h = b.history.filter(s => s.t >= t - secs);
    if (!h.length || h[0].t > t - secs * 0.8) return false;
    const range = k => Math.max(...h.map(s => s[k])) - Math.min(...h.map(s => s[k]));
    return range('pitch') < deg && range('yaw') < deg;
  };

  b.flick = t => {
    if (b.mode !== 'flick') return;
    const h = b.history.filter(s => s.t >= t - 0.4);
    fire(t, sizeOver(t - 0.6, t), h.length ? Math.min(...h.map(s => s.pitch)) : 0);
  };
  b.tap = (t, size, yaw) => { if (t - lastBeat >= MIN_GAP) { lastBeat = t; b.onBeat && b.onBeat({ t, size, yaw }); } };
  return b;
})();
