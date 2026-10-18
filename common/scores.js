// Global scoreboard on Supabase (REST, no SDK). Needs common/config.js (and common/mugic.js to submit).
//   Scores.submit({ game, mode, level, score, quiet })  asks for initials and posts; requires a connected MUGIC.
//     quiet: reuse the remembered initials without asking (only asks the first time), no notice if not posted
//   Scores.top(game, { mode, level, lowerIsBetter, limit })  -> [{ initials, device, score, created_at }]
//   Scores.render(el, rows, unit, { dates })  fills a table (unit: a suffix, or a function formatting the score;
//     dates: add a date column)
//   Scores.time(cs)  formats hundredths of a second as m:ss.cc (for timed games, lower is better)
//   Scores.busy()  true while the initials dialog is open
//   Scores.latest()  -> created_at of the newest score in any game (cheap change check), or null
const Scores = (() => {
  const enabled = () => typeof SUPABASE_URL === 'string' && SUPABASE_URL && SUPABASE_ANON_KEY;
  const headers = () => ({ apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' });

  async function top(game, { mode = 'normal', level = null, lowerIsBetter = false, limit = 10 } = {}) {
    if (!enabled()) return [];
    const q = new URLSearchParams({ select: 'initials,device,score,created_at', game: 'eq.' + game, mode: 'eq.' + mode,
      order: `score.${lowerIsBetter ? 'asc' : 'desc'},created_at.asc`, limit });
    q.set('level', level == null ? 'is.null' : 'eq.' + level);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/scores?${q}`, { headers: headers() });
    return r.ok ? r.json() : [];
  }

  async function latest() {
    if (!enabled()) return null;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/scores?select=created_at&order=created_at.desc&limit=1`, { headers: headers() }).catch(() => null);
    const rows = r && r.ok ? await r.json() : [];
    return rows.length ? rows[0].created_at : null;
  }

  // Arcade-style three-letter entry; resolves to 'ABC' or null if cancelled.
  function askInitials(title) {
    let last = '';
    try { last = localStorage.getItem('mugicArcadeInitials') || ''; } catch (e) {}
    const d = document.createElement('dialog');
    d.className = 'sc-dialog';
    d.innerHTML = `<form method="dialog"><p>${title}</p>
      <input name="i" maxlength="3" pattern="[A-Za-z]{3}" required autocomplete="off" value="${last}">
      <div><button value="ok">Post</button> <button value="cancel" formnovalidate>Skip</button></div></form>`;
    document.body.append(d);
    d.showModal();
    const input = d.querySelector('input');
    input.select();
    input.oninput = () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    return new Promise(res => d.addEventListener('close', () => {
      const v = d.returnValue === 'ok' ? input.value : null;
      d.remove();
      if (v) { try { localStorage.setItem('mugicArcadeInitials', v); } catch (e) {} }
      res(v);
    }));
  }

  async function submit({ game, mode = 'normal', level = null, score, quiet = false }) {
    if (!enabled()) return 'scoreboard not configured';
    if (!Mugic.connected || !Mugic.deviceCode) {
      const why = Mugic.connected ? 'the MUGIC device code was not read (reconnect the MUGIC)' : 'no MUGIC connected';
      if (!quiet) notice(`Score ${score} not posted: ${why}.`);
      return why;
    }
    let remembered = '';
    try { remembered = localStorage.getItem('mugicArcadeInitials') || ''; } catch (e) {}
    const initials = quiet && /^[A-Z]{3}$/.test(remembered) ? remembered
      : await askInitials(`${score} — enter your initials (MUGIC ${Mugic.deviceCode})`);
    if (!initials) return 'skipped';
    const r = await fetch(`${SUPABASE_URL}/rest/v1/scores`, { method: 'POST', headers: headers(),
      body: JSON.stringify({ game, mode, level, score, initials, device: Mugic.deviceCode }) });
    return r.ok ? 'posted' : 'post failed: ' + r.status;
  }

  const time = cs => `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;

  function render(el, rows, unit = '', { dates = false } = {}) {
    const day = r => dates ? `<td class="sc-dev">${new Date(r.created_at).toLocaleDateString()}</td>` : '';
    el.innerHTML = rows.length
      ? '<table class="sc-table">' + rows.map((r, i) =>
          `<tr><td>${i + 1}.</td><td>${r.initials}</td><td>${typeof unit === 'function' ? unit(r.score) : r.score + unit}</td><td class="sc-dev">${r.device}</td>${day(r)}</tr>`).join('') + '</table>'
      : `<p class="sc-empty">${enabled() ? 'no scores yet' : 'scoreboard not configured'}</p>`;
  }

  function notice(text) {
    const d = document.createElement('dialog');
    d.className = 'sc-dialog';
    d.innerHTML = `<form method="dialog"><p>${text}</p><div><button>OK</button></div></form>`;
    document.body.append(d);
    d.showModal();
    d.addEventListener('close', () => d.remove());
  }

  const busy = () => !!document.querySelector('.sc-dialog');   // initials entry open: games ignore input

  return { enabled, top, latest, submit, render, busy, time };
})();
