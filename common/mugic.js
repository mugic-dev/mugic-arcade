// Shared MUGIC input for the arcade: Web Bluetooth connection (BLE output mode, firmware >= 2.2.0),
// OSC parsing, calibration, and a control panel with live meters.
//   Mugic.roll / .pitch / .yaw  degrees from the calibrated pose
//   Mugic.energy                |acc|^2 minus the at-rest baseline
//   Mugic.onFlick               called once per energy spike above settings.thresh
//   Mugic.onFlickDir(d)         called ~150 ms after a flick with d = {roll, pitch, yaw}: the largest angle
//                               change (degrees, signed) over the flick window, to tell which way it went
//   Mugic.trigger(on)           hysteresis + cooldown edge detector (same as the flick) for game inputs
//   Mugic.deviceCode            last 6 hex digits of the device's label MAC (e.g. 'baf234'), once read
const Mugic = (() => {
  const SERVICE = 0x5501, CONFIG_CHAR = 0x113A, DATA_CHAR = 0x113B;
  const ACC = 0;                         // OSC float args: acc xyz, euler xyz, gyro, mag, quat
  const STORE = 'mugicArcade';
  const AXES = { roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' };
  const m = {
    connected: false, deviceCode: null, roll: 0, pitch: 0, yaw: 0, energy: 0, onFlick: null, onFlickDir: null,
    // as mounted in the MUGIC: euler X = yaw, Y = pitch, Z = roll (reversed)
    settings: { rollAxis: 5, pitchAxis: 4, yawAxis: 3, invertRoll: true, invertPitch: false, invertYaw: false, thresh: 60 },
  };
  let raw = null, zero = { roll: 0, pitch: 0, yaw: 0, energy: 0 };
  const FLICK_BEFORE = 100, FLICK_AFTER = 150;   // ms of motion around the energy spike that give its direction
  let history = [];                               // recent { t, roll, pitch, yaw }
  const AXIS_VERSION = 4;                         // bump when the default axes change, to drop stale saved ones
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (saved.axisVersion !== AXIS_VERSION) {
      for (const k in saved) { if (/Axis$|^invert/.test(k)) delete saved[k]; }
    }
    Object.assign(m.settings, saved, { axisVersion: AXIS_VERSION });
  } catch (e) {}
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
    const now = performance.now();
    history.push({ t: now, roll: m.roll, pitch: m.pitch, yaw: m.yaw });
    history = history.filter(h => now - h.t < 500);
    if (flick(m.energy, now)) {
      if (m.onFlick) m.onFlick();
      if (m.onFlickDir) setTimeout(() => m.onFlickDir(flickDelta(now)), FLICK_AFTER);
    }
  }

  // Largest signed change of each angle from just before the flick, over the flick window.
  function flickDelta(t0) {
    const win = history.filter(h => h.t >= t0 - FLICK_BEFORE && h.t <= t0 + FLICK_AFTER);
    const d = { roll: 0, pitch: 0, yaw: 0 };
    if (!win.length) return d;
    for (const a in d) {
      for (const h of win) {
        const v = wrap(h[a] - win[0][a]);
        if (Math.abs(v) > Math.abs(d[a])) d[a] = v;
      }
    }
    return d;
  }

  m.calibrate = () => { if (raw) zero = { ...raw }; };

  // Minimal protobuf walk: the bytes of length-delimited field `num`, or null.
  function pbField(bytes, num) {
    let i = 0;
    const varint = () => { let v = 0, s = 0, b; do { b = bytes[i++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return v; };
    while (i < bytes.length) {
      const tag = varint(), wt = tag & 7;
      if (wt === 0) varint();
      else if (wt === 2) { const n = varint(); if (tag >>> 3 === num) return bytes.subarray(i, i + n); i += n; }
      else if (wt === 5) i += 4;
      else if (wt === 1) i += 8;
      else return null;
    }
    return null;
  }

  // ConfigTaskResponse.get_configuration_response (8) -> GetConfigurationResponse.mac_addr (12)
  function onConfig(e) {
    const resp = pbField(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength), 8);
    const mac = resp && pbField(resp, 12);
    if (!mac || mac.length < 6) return;
    m.deviceCode = String.fromCharCode(...mac).toLowerCase().replace(/[^0-9a-f]/g, '').slice(-6);
    status(`connected: ${devName} (${m.deviceCode})`, true);
  }

  m.connect = async () => {
    if (!navigator.bluetooth) { alert('This browser has no Web Bluetooth — use Chrome or Edge.'); return; }
    try {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'mu' }], optionalServices: [SERVICE] });
      dev.addEventListener('gattserverdisconnected', () => { m.connected = false; m.deviceCode = null; status('disconnected', false); });
      const server = await dev.gatt.connect();
      const ch = await (await server.getPrimaryService(SERVICE)).getCharacteristic(DATA_CHAR);
      ch.addEventListener('characteristicvaluechanged', onPacket);
      await ch.startNotifications();
      m.connected = true; devName = dev.name;
      status('connected: ' + dev.name, true);
      // ask for the configuration (ConfigTaskCommand.get_configuration = field 8, empty) to learn the device code
      const cfg = await (await server.getPrimaryService(SERVICE)).getCharacteristic(CONFIG_CHAR);
      cfg.addEventListener('characteristicvaluechanged', onConfig);
      await cfg.startNotifications();
      await cfg.writeValue(new Uint8Array([0x42, 0x00]));
      setTimeout(m.calibrate, 500);
    } catch (err) {
      console.error(err); status('connect failed: ' + err.message, false);
    }
  };

  let statusEl = null, devName = '';
  function status(text, ok) { if (statusEl) { statusEl.textContent = text; statusEl.classList.toggle('ok', ok); } }

  // Render the connect/calibrate bar into `barEl` and the tuning meters into `tuneEl`.
  // `axes` picks which of roll/pitch/yaw the game uses; extraRows are [label, html, valueId] triples.
  m.mountPanel = (barEl, tuneEl, { keys = '', axes = ['roll'], extraRows = [] } = {}) => {
    const axisSel = a => `<select id="mg${cap(a)}Axis"><option value="3">euler X</option><option value="4">euler Y</option><option value="5">euler Z</option></select>`;
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
