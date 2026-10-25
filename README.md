# MUGIC Arcade

Browser games played with a MUGIC as the controller over Web Bluetooth. `index.html` is the game menu.

**Play:** <https://mugic-dev.github.io/mugic-arcade/> (Chrome or Edge; needs a MUGIC on firmware ≥ 2.2.0 in BLE output mode).
It is served by GitHub Pages straight from `main` (repo root): a push to `main` is live in about a minute.
`.github/workflows/keepalive.yml` reads one score daily so the free Supabase project never pauses for inactivity
(GitHub turns scheduled workflows off after 60 days without commits in a public repo — re-enable it from the Actions tab).

| Game | Folder | Controls |
|---|---|---|
| Alien Attack | `invaders/` | **Roll** → cannon speed, like a proportional joystick (`Full speed at` = roll for max speed, default 15°); **flick** fires |
| Muncher (Pac-Man style) | `pacman/` | **Roll** → left/right, **pitch** → up/down, like a proportional joystick: the dominant axis picks the direction, its tilt the speed (`Full speed at`, default 15°; level = stop); early turns are taken at the next opening |
| Wall Breaker (Breakout style) | `bricks/` | **Roll** → paddle speed, like Alien Attack (`Full speed at`, default 15°); **flick** launches; hit position on the paddle sets the angle |
| Anteater (after Stern/Tago, 1982) | `anteater/` | **Roll** / **pitch** steer the tongue tip like a proportional joystick (dominant axis, tilt = speed); steering back along the tongue retracts it; **flick** snaps it back |
| Space Rocks (Asteroids style) | `asteroids/` | **Roll** → turn rate, **pitch forward** → thrust (both proportional, `Full turn/thrust at`, default 15°); **flick** fires; hyperspace on H (keyboard) |
| Falling Blocks | `tetris/` | **Roll** → slide, repeating faster with more tilt; **pitch forward** → soft drop; **flick** rotates |
| Star Swarm (Galaga style) | `galaga/` | **Roll** → fighter speed (like Alien Attack); **flick** fires (2 shots max) |
| Bug Blaster (Centipede style) | `centipede/` | **Roll** / **pitch** → shooter velocity in the bottom zone (proportional joystick); automatic fire |
| Snake | `snake/` | **Roll** / **pitch** past `Turn at` (8°) turns (dominant axis, 1.4× to switch); constant speed |
| Road Hopper (Frogger style) | `frogger/` | One **flick** = one hop; direction = axis that turned most (**yaw** left/right, **pitch** up/down), snap-back ignored, as in Warehouse |
| Moon Lander (Lunar Lander) | `lander/` | **Roll** → turn rate, **pitch forward** → throttle (proportional); land on a pad upright and slow |
| Grand Prix (Pole Position style) | `racer/` | **Roll** → steering (proportional), **pitch forward** → gas, **pitch back** → brake, **flick** shifts LO/HI. Auto-gear mode is practice only (not posted) |
| Dragon Tower (Kung-Fu Master style) | `kungfu/` | **Roll** → walk speed; hold **pitch down** = crouch, **tip up** = jump; **flick** strikes (standing = punch, crouched = low kick, airborne = jump kick); when grabbed, 4 quick flicks shake them off. Keyboard play not posted |
| Paper Fling | `toss/` | A throwing **flick** throws: **yaw** (just before) aims, **pitch** sets the arc (level 45° → tipped up 25° = 70° lob), **roll** puts curving spin on it, throw strength sets distance (`Full power at`; or `Power from: tilt`). Score = streak |
| Rescue Chopper (Choplifter style) | `chopper/` | **Roll** → horizontal speed, **pitch** → climb/descend (proportional); roll level = hover, chopper faces you and shots drop as bombs; **flick** fires. Land gently near hostages, carry 16 home. Keyboard play not posted |
| Sky Rings (flight sim) | `flight/` | Hold the MUGIC like a model plane: **roll** = bank (banking turns), **pitch** = nose up/down (climb/dive; `Invert pitch` for pilot style), **yaw** = rudder (15° dead zone); **flick** = 3 s boost. Fly the fixed course of 15 rings + finish gate: 100 per ring + time bonus (10/s under 5:00). Keyboard flight is not ranked (W/S throttle is fine) |
| Sky Shield (Missile Command style) | `defense/` | Point the MUGIC like a laser pointer: **yaw** (or roll, selectable) moves the crosshair left/right, **pitch** up/down; **flick** fires from the nearest base with ammo. Waves get faster, with splitting missiles and bombers; bonus for leftover ammo and cities, a bonus city every 10000. Keyboard play is not ranked |
| Fruit Slice (Fruit Ninja style) | `fruit/` | Point the MUGIC (**yaw**/**pitch**) to move the blade; moving it fast (≥ 900 px/s) cuts. 1 per fruit, +n for an n-fruit combo; a bomb ends the game, three dropped fruits too. Mouse works but is not ranked |
| Marble Maze (Labyrinth style) | `maze/` | The MUGIC is the board: **roll** tilts left/right, **pitch** forward/back, the ball rolls downhill. 8 fixed mazes (generated, growing, more holes); a wrong hole costs one of 3 balls; 500 × level + time bonus. Keyboard not ranked |
| Bowling | `bowling/` | **Yaw** aims (±3°), **roll** sets the hook, both read just before the swing and shown on the lane; **swing and flick** to release, the swing strength sets the speed. 2D pin physics with toppling, 10 frames with strike/spare scoring. Keyboard not ranked |
| Slalom (downhill skiing) | `slalom/` | **Roll** carves (sharper with more tilt, and slower), tip **forward** to tuck, **back** to brake, **flick** jumps (clears rocks). Fixed course of 20 gates; a missed gate adds 5 s, trees/rocks/fence knock you down for 2 s. Ranked by time (lower is better; boards show m:ss.cc). Keyboard not ranked |
| Marble Rush (Marble Madness style) | `marble/` | Tilt the MUGIC to roll the marble on an isometric course with ramps, ledges and slinkies; rolling off into the void or dropping more than 3 levels loses the marble back to the last checkpoint. 6 races (Practice, Beginner, Intermediate, Advanced, Expert, Impossible), leftover time carries over; 1000 × race + 100 per second left. Keyboard not ranked |
| Warehouse (Sokoban style) | `sokoban/` | One **flick** = one step; its direction is the axis that turned most: **yaw** → left/right, **pitch** → up/down. Undo/Restart/Quit are on-screen buttons (U/R/Esc); Quit returns to the mode choice. **Hard** mode (chosen at start): no undo, only restart; only Hard scores are saved. `Min turn` sets how far it must turn; the snap back to center is ignored |

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

Warehouse levels are original and were checked solvable with a BFS solver.

## Global scoreboard (Supabase)

Scores are posted with three initials plus the MUGIC's device code (last 6 hex of its label MAC, read over
Bluetooth from `GetConfiguration`), and only while a MUGIC is connected. Alien Attack: highest score. Warehouse: Hard mode
only, fewest moves per level. This is a page-side check — it stops casual fakes, not someone calling the API directly;
device-signed scores (firmware challenge/response) are the planned follow-up.

Setup (once):
1. Create a free project at <https://supabase.com>.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the Project URL and the `anon` public key into `common/config.js`.
