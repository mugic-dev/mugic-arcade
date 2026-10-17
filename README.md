# MUGIC Arcade

Browser games played with a MUGIC as the controller over Web Bluetooth. `index.html` is the game menu.

| Game | Folder | Controls |
|---|---|---|
| Invaders | `invaders/` | **Roll** → cannon position (`Range` = degrees for full travel); **flick** fires |
| 倉庫番 Sōkoban | `sokoban/` | **Yaw** → left/right, **pitch** → up/down: one step per impulse to ±`Step at` (30°); **flick** undoes |

Every game also plays with the keyboard.

## Requirements

- MUGIC firmware ≥ 2.2.0 in **BLE output mode** (`SetOutputMode` = 2) with **OSC** data format.
  The device notifies each OSC packet on characteristic `0x113B` of service `0x5501`.
- Chrome or Edge (Web Bluetooth). Safari / iOS are not supported.
- Served over `https://` or `http://localhost` (Web Bluetooth requirement), e.g.

      python3 -m http.server 8000   # then open http://localhost:8000

## Use

1. Connect MUGIC → pick the device.
2. Hold it in the neutral pose and click **Calibrate center** (zeroes the angles and the energy baseline).
3. If a direction is on the wrong axis or reversed, change its axis / **invert**.
4. Tune **Flick at** against the live energy meter. Settings persist in localStorage.

## Adding a game

Create `<game>/index.html`, include `../common/arcade.css` and `../common/mugic.js`, and add a card to `index.html`.
`common/mugic.js` provides:

- `Mugic.mountPanel(barEl, tuneEl, { axes, keys, extraRows })` — connect/calibrate bar and live meters
- `Mugic.roll`, `.pitch`, `.yaw` (degrees from center), `.energy` (`ax²+ay²+az²` minus the rest baseline, as in `udp_socket.py`)
- `Mugic.onFlick` — called once per energy spike
- `Mugic.trigger(() => threshold)` — the same hysteresis (re-arm under half) + 250 ms cooldown edge detector, for your own inputs

OSC float args used: `acc xyz` (0–2), `euler xyz` (3–5, degrees). The BNO055 orders euler as heading, roll, pitch,
so the defaults are yaw = euler X, roll = euler Y, pitch = euler Z.

Sokoban levels are original and were checked solvable with a BFS solver.
