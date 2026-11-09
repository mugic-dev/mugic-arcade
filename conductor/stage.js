// Drawing for the Conductor: the hall seen from the podium, the players (animated by the notes they play),
// the spot where you point, your baton trail, the cue banner and the cue lane.
const Stage = (() => {
  const W = 960, H = 540, CX = 480, CY = 500, LANE = 462;
  const COLORS = { vln1: '#f2c14e', vln2: '#f08a5d', vla: '#b48ef0', vc: '#5db8f0', cb: '#6fdc8c' };
  const SPAN = 8;   // half-width (degrees of yaw) each section occupies on the arc
  const ARC = 1.3;  // stage angle per degree of yaw, to spread the orchestra across the screen

  // stage position for yaw `a` (degrees) at radius r
  const at = (a, r) => { const t = a * ARC * Math.PI / 180; return { x: CX + r * Math.sin(t) * 1.25, y: CY - r * Math.cos(t) * 0.62 }; };

  // seats per section: two rows on the arc (basses stand in one row at the back)
  const seatCache = new Map();
  function seats(piece) {
    if (seatCache.has(piece)) return seatCache.get(piece);
    const list = [];
    for (const s of piece.sections) {
      const rows = s.inst === 'cb' ? [[300, s.players]] : [[210, Math.ceil(s.players / 2)], [275, Math.floor(s.players / 2)]];
      for (const [r, n] of rows) {
        for (let i = 0; i < n; ++i) {
          const a = s.yaw + (n === 1 ? 0 : -SPAN + 2 * SPAN * i / (n - 1)) * (r === 210 ? 0.85 : 1);
          list.push({ sec: s, ...at(a, r), scale: r === 210 ? 1 : 0.86, seed: list.length });
        }
      }
    }
    list.sort((p, q) => p.y - q.y);
    seatCache.set(piece, list);
    return list;
  }

  function hall(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, LANE);
    g.addColorStop(0, '#120a07'); g.addColorStop(0.45, '#3a2116'); g.addColorStop(1, '#5a3520');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, LANE);
    for (let i = 0; i < 9; ++i) {   // organ-pipe panels on the back wall
      ctx.fillStyle = `rgba(255, 220, 160, ${0.03 + 0.02 * (i % 2)})`;
      ctx.fillRect(140 + i * 76, 40, 40, 150);
    }
    for (const x of [260, 480, 700]) {   // warm spotlights
      const s = ctx.createRadialGradient(x, 300, 10, x, 300, 260);
      s.addColorStop(0, 'rgba(255, 210, 140, 0.16)'); s.addColorStop(1, 'rgba(255, 210, 140, 0)');
      ctx.fillStyle = s; ctx.fillRect(0, 0, W, LANE);
    }
    ctx.fillStyle = '#6b4226';   // the stage floor
    ctx.beginPath(); ctx.ellipse(CX, CY, 520, 220, 0, Math.PI, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 170, 0.12)'; ctx.lineWidth = 1;
    for (const r of [210, 275]) { ctx.beginPath(); ctx.ellipse(CX, CY, r * 1.25, r * 0.62, 0, Math.PI, 2 * Math.PI); ctx.stroke(); }
  }

  function glow(ctx, s, amount, color) {
    if (amount <= 0.01) return;
    const p = at(s.yaw, 245), g = ctx.createRadialGradient(p.x, p.y, 5, p.x, p.y, 120);
    g.addColorStop(0, color + Math.round(amount * 120).toString(16).padStart(2, '0')); g.addColorStop(1, color + '00');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(p.x, p.y, 120, 60, 0, 0, 2 * Math.PI); ctx.fill();
  }

  // one musician; st = section state { bow (0..1 position), playing, unsure, lift }
  function player(ctx, p, st, t) {
    const { x, y, scale: k, sec } = p, inst = sec.inst, c = COLORS[sec.id];
    const look = st.unsure ? Math.sin(t * 3 + p.seed) * 3 * k : 0;   // glancing around when unsure
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    if (inst === 'cb') {   // standing bass player
      ctx.fillStyle = '#1b1b22'; ctx.fillRect(-7, -58, 14, 40); ctx.fillRect(-6, -18, 5, 18); ctx.fillRect(2, -18, 5, 18);
      ctx.fillStyle = '#7a3e1b'; ctx.beginPath(); ctx.ellipse(-10, -26, 11, 22, -0.15, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, -48); ctx.lineTo(-6, -78); ctx.stroke();
      head(ctx, 0 + look, -66, c);
      bow(ctx, -22 + st.bow * 22, -24, -2 + st.bow * 22, -18, st.playing);
    } else if (inst === 'vc') {   // seated cellist, cello between the knees
      chair(ctx); ctx.fillStyle = '#1b1b22'; ctx.fillRect(-8, -40, 16, 26);
      ctx.fillStyle = '#7a3e1b'; ctx.beginPath(); ctx.ellipse(0, -16, 9, 16, 0, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = '#3a1e0c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(-2, -52); ctx.stroke();
      head(ctx, look, -48, c);
      bow(ctx, -14 + st.bow * 18, -18, 8 + st.bow * 18, -14, st.playing);
    } else {   // violin / viola under the chin, lifted when about to play
      chair(ctx); ctx.fillStyle = '#1b1b22'; ctx.fillRect(-8, -38, 16, 26);
      head(ctx, look, -46, c);
      const up = st.lift, vy = -38 + 12 * (1 - up), big = inst === 'vla' ? 1.15 : 1;
      ctx.fillStyle = '#8a4a20'; ctx.beginPath(); ctx.ellipse(-9, vy, 9 * big, 4 * big, -0.5 + 0.7 * (1 - up), 0, 2 * Math.PI); ctx.fill();
      if (up > 0.5) bow(ctx, -2 + st.bow * 10, vy - 10 + st.bow * 4, 14 + st.bow * 10, vy + 6 + st.bow * 4, st.playing);
    }
    ctx.restore();
  }
  const chair = ctx => { ctx.fillStyle = '#2a1a12'; ctx.fillRect(-10, -14, 20, 4); ctx.fillRect(-9, -10, 3, 10); ctx.fillRect(6, -10, 3, 10); };
  function head(ctx, x, y, c) {
    ctx.fillStyle = '#d9a77a'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = c; ctx.fillRect(x - 8, y + 8, 16, 3);   // section-coloured collar
  }
  function bow(ctx, x0, y0, x1, y1, playing) {
    ctx.strokeStyle = playing ? '#f3e6c8' : '#9c917c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }

  // where you point: a soft beam from the podium
  function pointer(ctx, yaw, onTarget) {
    const a = at(yaw, 330), g = ctx.createLinearGradient(CX, CY - 40, a.x, a.y), c = onTarget ? '80, 255, 140' : '255, 240, 200';
    g.addColorStop(0, `rgba(${c}, ${onTarget ? 0.4 : 0.18})`); g.addColorStop(1, `rgba(${c}, 0)`);
    const n = { x: -(a.y - CY + 40), y: a.x - CX }, l = Math.hypot(n.x, n.y) || 1, w = 26;
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(CX, CY - 40);
    ctx.lineTo(a.x + n.x / l * w, a.y + n.y / l * w); ctx.lineTo(a.x - n.x / l * w, a.y - n.y / l * w); ctx.fill();
  }

  // a gold arrow from where you point to the section to cue
  function cueArrow(ctx, yaw, s, t) {
    const a = at(yaw, 250), b = at(s.yaw + (yaw < s.yaw ? -6 : 6), 250), lift = 40 + 6 * Math.sin(t * 6);
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - lift - Math.abs(b.x - a.x) * 0.15 };
    ctx.strokeStyle = '#ffcd5a'; ctx.fillStyle = '#ffcd5a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 20); ctx.quadraticCurveTo(mid.x, mid.y, b.x, b.y - 20); ctx.stroke();
    const ang = Math.atan2(b.y - 20 - mid.y, b.x - mid.x);
    ctx.beginPath(); ctx.moveTo(b.x + 6 * Math.cos(ang), b.y - 20 + 6 * Math.sin(ang));
    ctx.lineTo(b.x - 16 * Math.cos(ang - 0.5), b.y - 20 - 16 * Math.sin(ang - 0.5));
    ctx.lineTo(b.x - 16 * Math.cos(ang + 0.5), b.y - 20 - 16 * Math.sin(ang + 0.5)); ctx.fill();
  }

  // the baton: the last second of the hand's motion as a fading gold ribbon, sparks at each beat
  function trail(ctx, history, beats, t) {
    const pt = s => ({ x: CX + s.yaw * 4.5, y: 250 - s.pitch * 4 });
    const h = history.filter(s => s.t > t - 1.1);
    ctx.lineCap = 'round';
    for (let i = 1; i < h.length; ++i) {
      const a = pt(h[i - 1]), b = pt(h[i]), f = 1 - (t - h[i].t) / 1.1;
      ctx.strokeStyle = `rgba(255, 205, 90, ${f * 0.9})`; ctx.lineWidth = 1 + 4 * f;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const bt of beats) {
      const age = t - bt.t; if (age > 0.5) continue;
      const near = history.reduce((a, s) => Math.abs(s.t - bt.t) < Math.abs(a.t - bt.t) ? s : a, history[0]);
      if (!near) continue;
      const p = pt(near);
      ctx.fillStyle = `rgba(255, 240, 180, ${1 - age * 2})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 + age * 30, 0, 2 * Math.PI); ctx.fill();
    }
  }

  function banner(ctx, b) {
    if (!b) return;
    ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'center';
    const w = Math.max(ctx.measureText(b.text).width, b.sub ? 200 : 0) + 48;
    ctx.fillStyle = b.ok ? 'rgba(24, 168, 74, 0.92)' : b.bad ? 'rgba(224, 38, 43, 0.92)' : 'rgba(30, 90, 200, 0.92)';
    ctx.beginPath(); ctx.roundRect(CX - w / 2, 50, w, b.sub ? 64 : 42, 10); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(b.text, CX, 79);
    if (b.sub) { ctx.font = '16px system-ui, sans-serif'; ctx.fillText(b.sub, CX, 104); }
    ctx.textAlign = 'left';
  }

  // the cue lane: the score as a road map scrolling toward the "now" line
  function lane(ctx, piece, pos, cueState) {
    const NOW = 150, PX = 52, y0 = LANE;
    ctx.fillStyle = '#0d0f16'; ctx.fillRect(0, y0, W, H - y0);
    const x = b => NOW + (b - pos) * PX;
    ctx.font = '11px ui-monospace, monospace';
    for (let b = Math.floor(pos - 3); b < pos + 17; ++b) {
      if (b < 0 || b > piece.fermata) continue;
      const bar = b % piece.meter === 0;
      ctx.fillStyle = bar ? '#5a6478' : '#2a3040'; ctx.fillRect(x(b), y0 + (bar ? 4 : 18), bar ? 2 : 1, bar ? 70 : 42);
      if (bar) { ctx.fillStyle = '#7a8499'; ctx.fillText(b / piece.meter + 1, x(b) + 4, y0 + 14); }
    }
    for (const h of piece.hairpins) {
      const a = x(h.from), z = x(h.to), m = y0 + 60, open = h.kind === 'cresc';
      ctx.strokeStyle = '#c9d2e6'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(open ? z : a, m - 6); ctx.lineTo(open ? a : z, m); ctx.lineTo(open ? z : a, m + 6); ctx.stroke();
    }
    ctx.font = 'italic bold 18px Georgia, serif'; ctx.fillStyle = '#e8f0ff';
    for (const d of piece.dynamics) ctx.fillText(d.mark, x(d.beat) + 4, y0 + 66);
    ctx.font = 'bold 12px system-ui, sans-serif';
    piece.cues.forEach((c, i) => {
      const s = piece.sections.find(q => q.id === c.section), cx = x(c.beat), st = cueState[i];
      const w = ctx.measureText(s.name).width + 14;
      ctx.fillStyle = st === 'hit' ? '#18a84a' : st === 'miss' ? '#e0262b' : COLORS[s.id];
      ctx.beginPath(); ctx.roundRect(cx + 3, y0 + 20, w, 20, 5); ctx.fill();
      ctx.fillStyle = '#05060a'; ctx.fillText(s.name, cx + 10, y0 + 34);
    });
    ctx.font = '26px Georgia, serif'; ctx.fillStyle = '#e8f0ff'; ctx.fillText('𝄐', x(piece.fermata) + 2, y0 + 44);
    ctx.fillStyle = '#ffcd5a'; ctx.fillRect(NOW - 1, y0, 3, H - y0);
  }

  function hud(ctx, g) {
    ctx.font = '14px ui-monospace, monospace'; ctx.fillStyle = '#e8d9c0';
    ctx.fillText(`${g.piece.title} — ${g.piece.composer}`, 14, 24);
    if (g.pos >= 0) {
      const bar = Math.floor(g.pos / g.piece.meter) + 1, beat = Math.floor(g.pos % g.piece.meter) + 1;
      ctx.textAlign = 'right';
      ctx.fillText(`bar ${Math.min(bar, g.piece.bars)}:${beat}   ♩ = ${Math.round(g.bpm)} (${g.piece.tempo})`, W - 14, 24);
      ctx.textAlign = 'left';
    }
    // loudness: yours (bar) against the score's (gold mark)
    const x = W - 34, y = 150, h = 200;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fillRect(x, y, 16, h);
    ctx.fillStyle = '#e8d9c0'; ctx.fillRect(x + 3, y + h * (1 - g.level), 10, h * g.level);
    ctx.fillStyle = '#ffcd5a'; ctx.fillRect(x - 5, y + h * (1 - g.target) - 2, 26, 4);
    ctx.font = '11px ui-monospace, monospace'; ctx.fillStyle = '#c9b89a'; ctx.textAlign = 'center';
    ctx.fillText('loud', x + 8, y - 6); ctx.fillText('soft', x + 8, y + h + 14); ctx.textAlign = 'left';
  }

  function card(ctx, r) {
    ctx.fillStyle = 'rgba(10, 8, 6, 0.86)'; ctx.beginPath(); ctx.roundRect(230, 70, 500, 340, 14); ctx.fill();
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffcd5a'; ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('★'.repeat(r.stars) + '☆'.repeat(5 - r.stars), CX, 118);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui, sans-serif'; ctx.fillText(`${r.points} points — ${r.verdict}`, CX, 156);
    ctx.font = '16px system-ui, sans-serif'; ctx.fillStyle = '#e8d9c0';
    r.lines.forEach((l, i) => ctx.fillText(l, CX, 198 + i * 30));
    ctx.fillStyle = '#9aa3b5'; ctx.fillText('Give a beat (or press space) to conduct again', CX, 388);
    ctx.textAlign = 'left';
  }

  function draw(ctx, g) {
    hall(ctx);
    for (const s of g.piece.sections) glow(ctx, s, g.sections[s.id].glow, COLORS[s.id]);
    const onTarget = g.cueTarget && Math.abs(g.yaw - g.cueTarget.yaw) <= g.zone;
    if (g.pointing) pointer(ctx, g.yaw, onTarget);
    const t = g.t;
    for (const p of seats(g.piece)) player(ctx, p, g.sections[p.sec.id], t);
    ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const s of g.piece.sections) {
      const p = at(s.yaw, s.inst === 'cb' ? 300 : 275); p.y -= s.inst === 'cb' ? 92 : 64; ctx.fillStyle = COLORS[s.id]; ctx.fillText(s.name, p.x, p.y);
    }
    ctx.textAlign = 'left';
    if (g.cueTarget && g.pointing && !onTarget) cueArrow(ctx, g.yaw, g.cueTarget, t);
    trail(ctx, g.history, g.beats, g.now);
    hud(ctx, g);
    banner(ctx, g.banner);
    lane(ctx, g.piece, Math.max(-2, g.pos), g.cueState);
    if (g.report) card(ctx, g.report);
  }

  return { draw, W, H, COLORS, SPAN };
})();
