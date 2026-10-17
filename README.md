# MUGIC Invaders

Classic Space Invaders in one HTML page, played with a MUGIC as the controller over Web Bluetooth.

- **Roll** → cannon left/right (position-mapped; `Range` sets the degrees for full travel)
- **Energy** (`ax²+ay²+az²` minus the at-rest baseline, as in `udp_socket.py`) → fire on a flick above `Fire at`
- Keyboard fallback: ← → move, space fires, Enter starts

## Requirements

- MUGIC firmware ≥ 2.2.0 in **BLE output mode** (`SetOutputMode` = 2) with **OSC** data format.
  The device notifies each OSC packet on characteristic `0x113B` of service `0x5501`.
- Chrome or Edge (Web Bluetooth). Safari / iOS are not supported.
- Served over `https://` or `http://localhost` (Web Bluetooth requirement), e.g.

      python3 -m http.server 8000   # then open http://localhost:8000

## Use

1. Connect MUGIC → pick the device.
2. Hold it level and click **Calibrate level** (also zeroes the energy baseline).
3. If left/right is on the wrong axis or reversed, change **Roll axis** / **invert**.
4. Tune **Fire at** against the live energy meter. Settings persist in localStorage.

OSC float args used: `acc xyz` (0–2), `euler xyz` (3–5, degrees). The BNO055 orders euler as
heading, roll, pitch, so roll defaults to euler Y.
