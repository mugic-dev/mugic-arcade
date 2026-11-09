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

  function fire(t, size) {
    if (t - lastBeat < MIN_GAP) return;
    lastBeat = t;
    if (b.onBeat) b.onBeat({ t, size, yaw: yawOver(t - 0.45, t) });
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
        fire(low.t, high - low.pitch);
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

  b.flick = t => { if (b.mode === 'flick') fire(t, sizeOver(t - 0.6, t)); };
  b.tap = (t, size, yaw) => { if (t - lastBeat >= MIN_GAP) { lastBeat = t; b.onBeat && b.onBeat({ t, size, yaw }); } };
  return b;
})();
