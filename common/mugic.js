// Shared MUGIC input for the arcade: Web Bluetooth connection (BLE output mode, firmware >= 2.2.0),
// OSC parsing, calibration, and a control panel with live meters.
//   Mugic.roll / .pitch / .yaw  degrees from the calibrated pose
//   Mugic.energy                |acc|^2 minus the at-rest baseline
//   Mugic.onFlick               called once per energy spike above settings.thresh
//   Mugic.trigger(on)           hysteresis + cooldown edge detector (same as the flick) for game inputs
const Mugic = (() => {
  const SERVICE = 0x5501, DATA_CHAR = 0x113B;
  const ACC = 0;                         // OSC float args: acc xyz, euler xyz (heading, roll, pitch), gyro, mag, quat
  const STORE = 'mugicArcade';
  const AXES = { roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' };
  const m = {
    connected: false, roll: 0, pitch: 0, yaw: 0, energy: 0, onFlick: null,
    settings: { rollAxis: 4, pitchAxis: 5, yawAxis: 3, invertRoll: false, invertPitch: false, invertYaw: false, thresh: 60 },
  };
  let raw = null, zero = { roll: 0, pitch: 0, yaw: 0, energy: 0 };
  try { Object.assign(m.settings, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(m.settings)); } catch (e) {} };
  const cap = a => a[0].toUpperCase() + a.slice(1);

  // Returns fire(value, now): true once when value reaches on(), re-armed when it drops below
  // half of on() and at least `cooldown` ms have passed since the last fire.
  m.trigger = (on, cooldown = 250) => {
    let armed = true, last = -Infinity;
    return (value, now) => {
      const t = on();
      if (armed && value >= t && now - last > cooldown) { armed = false; last = now; return true; }
      if (value < t * 0.5) armed = true;
      return false;
    };
  };
  const flick = m.trigger(() => m.settings.thresh);

  // Parse an OSC message, returning its float args (ints are skipped).
  function parseOsc(view) {
    const str = off => { let end = off; while (end < view.byteLength && view.getUint8(end)) ++end;
      let s = ''; for (let i = off; i < end; ++i) s += String.fromCharCode(view.getUint8(i));
      return [s, (end + 4) & ~3]; };
    let [, off] = str(0);
    let tags; [tags, off] = str(off);
    const floats = [];
    for (const t of tags.slice(1)) {
      if (off + 4 > view.byteLength) break;
      if (t === 'f') floats.push(view.getFloat32(off, false));
      off += 4;
    }
    return floats;
  }

  // Wrap an angle difference into (-180, 180].
  const wrap = a => ((a + 540) % 360) - 180;

  function onPacket(e) {
    const f = parseOsc(e.target.value);
    if (f.length < 6) return;
    const s = m.settings, ax = f[ACC], ay = f[ACC + 1], az = f[ACC + 2];
    raw = { energy: ax * ax + ay * ay + az * az };
    for (const a in AXES) {
      raw[a] = f[s[a + 'Axis']];
      m[a] = wrap(raw[a] - zero[a]) * (s['invert' + cap(a)] ? -1 : 1);
    }
    m.energy = Math.abs(raw.energy - zero.energy);
    if (flick(m.energy, performance.now()) && m.onFlick) m.onFlick();
  }

  m.calibrate = () => { if (raw) zero = { ...raw }; };

  m.connect = async () => {
    if (!navigator.bluetooth) { alert('This browser has no Web Bluetooth — use Chrome or Edge.'); return; }
    try {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'mu' }], optionalServices: [SERVICE] });
      dev.addEventListener('gattserverdisconnected', () => { m.connected = false; status('disconnected', false); });
      const server = await dev.gatt.connect();
      const ch = await (await server.getPrimaryService(SERVICE)).getCharacteristic(DATA_CHAR);
      ch.addEventListener('characteristicvaluechanged', onPacket);
      await ch.startNotifications();
      m.connected = true;
      status('connected: ' + dev.name, true);
      setTimeout(m.calibrate, 500);
    } catch (err) {
      console.error(err); status('connect failed: ' + err.message, false);
    }
  };

  let statusEl = null;
  function status(text, ok) { if (statusEl) { statusEl.textContent = text; statusEl.classList.toggle('ok', ok); } }

  // Render the connect/calibrate bar into `barEl` and the tuning meters into `tuneEl`.
  // `axes` picks which of roll/pitch/yaw the game uses; extraRows are [label, html, valueId] triples.
  m.mountPanel = (barEl, tuneEl, { keys = '', axes = ['roll'], extraRows = [] } = {}) => {
    const axisSel = a => `<select id="mg${cap(a)}Axis"><option value="4">euler Y</option><option value="5">euler Z</option><option value="3">euler X</option></select>`;
    barEl.className = 'mg-bar';
    barEl.innerHTML = `
        <button id="mgConnect">Connect MUGIC</button>
        <button id="mgCal">Calibrate center</button>
        ${axes.map(a => `<label>${AXES[a]} ${axisSel(a)}</label><label><input type="checkbox" id="mgInv${cap(a)}"> invert</label>`).join('')}
        <span id="mgStatus">not connected${keys ? ' — keyboard: ' + keys : ''}</span>`;
    tuneEl.className = 'mg-tuning';
    tuneEl.innerHTML = `
        ${axes.map(a => `<span>${AXES[a]}</span><div class="mg-meter" id="mg${cap(a)}M"><i></i></div><span id="mg${cap(a)}V">0°</span>`).join('')}
        ${extraRows.map(([label, html, id]) => `<span>${label}</span>${html}<span id="${id}"></span>`).join('')}
        <span>Energy</span><div class="mg-meter" id="mgEnergyM"><i></i><b></b></div><span id="mgEnergyV">0</span>
        <span>Flick at</span><input type="range" id="mgThresh" min="5" max="400"><span id="mgThreshV"></span>`;
    statusEl = barEl.querySelector('#mgStatus');
    const $ = id => document.getElementById(id), s = m.settings;
    $('mgConnect').onclick = m.connect;
    $('mgCal').onclick = m.calibrate;
    const bind = (id, key, prop = 'value', num = true) => {
      const e = $(id); if (!e) return;
      e[prop] = s[key];
      e.addEventListener(prop === 'checked' ? 'change' : 'input', () => { s[key] = num ? +e[prop] : e[prop]; save(); });
    };
    bind('mgThresh', 'thresh');
    axes.forEach(a => { bind(`mg${cap(a)}Axis`, a + 'Axis'); bind(`mgInv${cap(a)}`, 'invert' + cap(a), 'checked', false); });

    const bar = (id, v) => { const i = $(id).firstElementChild; i.style.left = (50 + Math.min(0, v) * 50) + '%'; i.style.width = Math.abs(v) * 50 + '%'; };
    const clamp = v => Math.max(-1, Math.min(1, v));
    (function tick() {
      axes.forEach(a => { bar(`mg${cap(a)}M`, clamp(m[a] / 90)); $(`mg${cap(a)}V`).textContent = m[a].toFixed(0) + '°'; });
      const max = 400, em = $('mgEnergyM');
      em.firstElementChild.style.left = 0; em.firstElementChild.style.width = Math.min(100, m.energy / max * 100) + '%';
      em.lastElementChild.style.left = s.thresh / max * 100 + '%';
      $('mgEnergyV').textContent = m.energy.toFixed(0); $('mgThreshV').textContent = s.thresh;
      requestAnimationFrame(tick);
    })();
  };

  return m;
})();
