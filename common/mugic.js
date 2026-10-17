// Shared MUGIC input for the arcade: Web Bluetooth connection (BLE output mode, firmware >= 2.2.0),
// OSC parsing, calibration, and a control panel with live meters.
//   Mugic.roll / .pitch / .yaw  degrees from the calibrated pose
//   Mugic.energy                |acc|^2 minus the at-rest baseline
//   Mugic.onFlick               called once per energy spike above settings.thresh
//   Mugic.onFlickDir(d)         called ~150 ms after a flick with d = {roll, pitch, yaw}: the largest angle
//                               change (degrees, signed) over the flick window, to tell which way it went
//   Mugic.trigger(on)           hysteresis + cooldown edge detector (same as the flick) for game inputs
//   Mugic.deviceCode            last 6 hex digits of the device's label MAC (e.g. 'baf234'), once read
//   Mugic.battery / .batteryVolts  battery percent estimated from the voltage in each packet (as the plugin does
//                               by default), and the voltage; null until a packet with a voltage arrives
// Inside the arcade menu's game frame, a page uses the menu's connection (it survives switching games) and its
// bar keeps only Calibrate (plus Connect while disconnected); opened on its own, a page connects by itself.
const Mugic = (() => {
  const SERVICE = 0x5501, CONFIG_CHAR = 0x113A, DATA_CHAR = 0x113B;
  // OSC float args: acc xyz, euler xyz, gyro, mag, quat, battery volts (the int soc before it is skipped)
  const ACC = 0, BATT_VOLTS = 16;
  const STORE = 'mugicArcade';
  const AXES = { roll: 'Roll', pitch: 'Pitch', yaw: 'Yaw' };
  const m = {
    connected: false, deviceCode: null, battery: null, batteryVolts: null, flicks: 0, lastFlickAt: -Infinity, roll: 0, pitch: 0, yaw: 0, energy: 0, onFlick: null, onFlickDir: null,
    // as mounted in the MUGIC: euler X = yaw, Y = pitch, Z = roll (reversed)
    settings: { rollAxis: 5, pitchAxis: 4, yawAxis: 3, invertRoll: true, invertPitch: false, invertYaw: false, thresh: 60 },
  };
  let raw = null, zero = { roll: 0, pitch: 0, yaw: 0, energy: 0 };
  let hub = null;   // the menu's Mugic when running in its game frame
  try { if (window.parent !== window) hub = window.parent.mugicShared || null; } catch (e) {}
  const subs = new Set();   // game frames sharing this connection: { packet(view), status(text, ok, mugic) }
  const each = fn => subs.forEach(s => { try { fn(s); } catch (e) { subs.delete(s); } });
  m.subscribe = s => { subs.add(s); if (m.connected) s.status(lastStatus.text, true, m); return () => subs.delete(s); };
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

  function onPacket(view) {
    const f = parseOsc(view);
    if (f.length < 6) return;
    if (f.length > BATT_VOLTS && !hub) battery(f[BATT_VOLTS]);
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
      ++m.flicks; m.lastFlickAt = now;
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

  // ConfigTaskResponse.get_diagnostics_response (7) -> GetDiagnosticsResponse.mac_addr (12, the label MAC from NVS;
  // empty on current firmware, so the BLE name is used meanwhile)
  function onConfig(e) {
    const resp = pbField(new Uint8Array(e.target.value.buffer, e.target.value.byteOffset, e.target.value.byteLength), 7);
    const mac = resp && pbField(resp, 12);
    if (!mac || mac.length < 6) return;
    m.deviceCode = String.fromCharCode(...mac).toLowerCase().replace(/[^0-9a-f]/g, '').slice(-6);
    connStatus();
  }

  // Battery percent from voltage, as the MUGIC plug-in and Max app do (zmap 3.7 4.13 5 100): 3.7 V or less
  // reads 5%, 4.13 V or more 100%. No voltage (0) yet shows "…".
  function battery(volts) {
    const pct = volts > 0 ? Math.round(5 + (Math.min(4.13, Math.max(3.7, volts)) - 3.7) / (4.13 - 3.7) * 95) : null;
    const changed = pct !== m.battery || (volts > 0 && Math.abs(volts - (m.batteryVolts || 0)) >= 0.01);
    m.battery = pct; m.batteryVolts = volts > 0 ? volts : null;
    if (changed) connStatus();
  }

  function connStatus() {
    if (!m.connected) return;
    const code = m.deviceCode ? ` (${m.deviceCode})` : '';
    const batt = m.battery == null ? ' · battery …' : ` · battery ≈${m.battery}% · ${m.batteryVolts.toFixed(2)} V`;
    status(`connected: ${devName}${code}${batt}`, true);
  }

  m.connect = async () => {
    if (!navigator.bluetooth) { alert('This browser has no Web Bluetooth — use Chrome or Edge.'); return; }
    try {
      const dev = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'mu' }], optionalServices: [SERVICE] });
      dev.addEventListener('gattserverdisconnected', () => {
        m.connected = false; m.deviceCode = null; m.battery = m.batteryVolts = null; status('disconnected', false);
      });
      const server = await dev.gatt.connect();
      const ch = await (await server.getPrimaryService(SERVICE)).getCharacteristic(DATA_CHAR);
      ch.addEventListener('characteristicvaluechanged', e => { onPacket(e.target.value); each(s => s.packet(e.target.value)); });
      await ch.startNotifications();
      m.connected = true; devName = dev.name;
      // The firmware names each device 'mu' + the last 6 hex digits of its label MAC (e.g. mubaf234); use that
      // as the device code right away. A MAC in the diagnostics reply, when the firmware fills it, takes over.
      const fromName = /^mu([0-9a-f]{6})$/i.exec(dev.name || '');
      if (fromName) m.deviceCode = fromName[1].toLowerCase();
      connStatus();
      // ask for diagnostics (ConfigTaskCommand.get_diagnostics = field 7, empty) for the device code;
      // ask again a couple of times if no answer arrives
      const cfg = await (await server.getPrimaryService(SERVICE)).getCharacteristic(CONFIG_CHAR);
      cfg.addEventListener('characteristicvaluechanged', onConfig);
      await cfg.startNotifications();
      let gotReply = false;
      const onReply = () => { gotReply = true; };
      cfg.addEventListener('characteristicvaluechanged', onReply);
      const askDiagnostics = () => cfg.writeValue(new Uint8Array([0x3a, 0x00])).catch(err => console.warn('device code request failed', err));
      for (let i = 0; i < 3 && !gotReply && m.connected; ++i) {
        await askDiagnostics();
        await new Promise(r => setTimeout(r, 1500));
      }
      if (!m.deviceCode && m.connected) status(`connected: ${devName} (device code not read — scores can't be posted)`, true);
      setTimeout(m.calibrate, 500);
    } catch (err) {
      console.error(err); status('connect failed: ' + err.message, false);
    }
  };

  let statusEl = null, devName = '', lastStatus = { text: '', ok: false };
  function status(text, ok) {
    lastStatus = { text, ok };
    if (statusEl) { statusEl.textContent = text; statusEl.classList.toggle('ok', ok); }
    const btn = hub && statusEl && document.getElementById('mgConnect');
    if (btn) btn.hidden = m.connected;
    each(s => s.status(text, ok, m));
  }
  m.mountStatus = el => { statusEl = el; };

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
        <span id="mgFlickL">Flick at</span><input type="range" id="mgThresh" min="5" max="400"><span id="mgThreshV"></span>`;
    statusEl = barEl.querySelector('#mgStatus');
    if (hub) {   // in the menu's frame: connection and axes are set up there, keep Calibrate
      barEl.querySelectorAll('label').forEach(l => l.remove());
      barEl.querySelector('#mgConnect').hidden = m.connected;
      if (m.connected) status(lastStatus.text, true);
    }
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
      // light up for a moment each time a flick is detected (energy crossing the red line)
      const lit = performance.now() - m.lastFlickAt < 400;
      $('mgFlickL').textContent = m.flicks ? `Flick at (${m.flicks})` : 'Flick at';
      $('mgFlickL').classList.toggle('mg-lit', lit); em.lastElementChild.classList.toggle('mg-lit', lit);
      requestAnimationFrame(tick);
    })();
  };

  window.mugicShared = m;   // for game frames (a top-level const isn't a window property)
  if (hub) {
    m.connect = () => hub.connect();
    m.settings = hub.settings;   // same axes / threshold as the menu
    const unsub = hub.subscribe({
      packet: onPacket,
      status: (text, ok, h) => {
        const was = m.connected;
        Object.assign(m, { connected: h.connected, deviceCode: h.deviceCode, battery: h.battery, batteryVolts: h.batteryVolts });
        status(text, ok);
        if (m.connected && !was) setTimeout(m.calibrate, 500);
      },
    });
    addEventListener('pagehide', unsub);
  }
  return m;
})();
