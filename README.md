# MUGIC Arcade

Browser games played with a MUGIC as the controller over Web Bluetooth. `index.html` is the game menu.

| Game | Folder | Controls |
|---|---|---|
| Invaders | `invaders/` | **Roll** → cannon speed, like a proportional joystick (`Full speed at` = roll for max speed, default 15°); **flick** fires |
| 倉庫番 Sōkoban | `sokoban/` | One **flick** = one step; its direction is the axis that turned most: **yaw** → left/right, **pitch** → up/down. Undo/Restart are on-screen buttons (U/R). **Hard** mode (chosen at start): no undo, only restart; only Hard scores are saved. `Min turn` sets how far it must turn; the snap back to center is ignored |

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
- `Mugic.onFlickDir(d)` — ~150 ms after a flick, `d = {roll, pitch, yaw}`: largest signed angle change during it
- `Mugic.trigger(() => threshold)` — the same hysteresis (re-arm under half) + 250 ms cooldown edge detector, for your own inputs

OSC float args used: `acc xyz` (0–2), `euler xyz` (3–5, degrees). As the BNO055 is mounted in the MUGIC (checked on
a device): yaw = euler X, pitch = euler Y, roll = euler Z reversed — these are the defaults.

Sokoban levels are original and were checked solvable with a BFS solver.

## Global scoreboard (Supabase)

Scores are posted with three initials plus the MUGIC's device code (last 6 hex of its label MAC, read over
Bluetooth from `GetConfiguration`), and only while a MUGIC is connected. Invaders: highest score. Sōkoban: Hard mode
only, fewest moves per level. This is a page-side check — it stops casual fakes, not someone calling the API directly;
device-signed scores (firmware challenge/response) are the planned follow-up.

Setup (once):
1. Create a free project at <https://supabase.com>.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the Project URL and the `anon` public key into `common/config.js`.
