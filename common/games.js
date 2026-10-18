// The arcade's games, in menu order: folder/scoreboard id, display name, one-line blurb.
// board: heading for its scores (default 'TOP 10'); levels: per-level records (fewest moves, hard mode).
const GAMES = [
  { id: 'invaders', name: 'Alien Attack', blurb: 'Roll to steer the cannon, flick to fire.' },
  { id: 'pacman', name: 'Muncher', blurb: 'Pac-Man-style maze: roll and pitch steer like a joystick, tilt sets speed.' },
  { id: 'bricks', name: 'Wall Breaker', blurb: 'Roll steers the paddle like a joystick, flick launches the ball.' },
  { id: 'anteater', name: 'Anteater', blurb: 'Steer the tongue through the anthill with roll and pitch, flick to pull it back.' },
  { id: 'asteroids', name: 'Space Rocks', blurb: 'Asteroids-style: roll to turn, tip forward to thrust, flick to fire.' },
  { id: 'tetris', name: 'Falling Blocks', blurb: 'Stack the falling blocks: roll slides, tip forward drops, flick rotates.' },
  { id: 'galaga', name: 'Star Swarm', blurb: 'Galaga-style: roll steers the fighter, flick fires at the diving swarm.' },
  { id: 'centipede', name: 'Bug Blaster', blurb: 'Centipede-style: roll and pitch steer the shooter, auto-fire.' },
  { id: 'snake', name: 'Snake', blurb: "Tilt to turn; eat, grow, don't bite yourself." },
  { id: 'frogger', name: 'Road Hopper', blurb: 'Frogger-style: each flick is a hop (yaw left/right, pitch up/down).' },
  { id: 'lander', name: 'Moon Lander', blurb: 'Lunar Lander-style: roll to turn, tip forward to throttle, land softly.' },
  { id: 'racer', name: 'Grand Prix', blurb: 'Pole Position-style: roll steers, pitch is gas/brake, flick shifts LO/HI.' },
  { id: 'kungfu', name: 'Dragon Tower', blurb: 'Kung-Fu Master-style: roll walks, tip down crouch / up jump, flick strikes, shake off grabbers.' },
  { id: 'toss', name: 'Paper Fling', blurb: 'Throw for real: point to aim, tip up to lob, twist for spin, throw harder to go further.', board: 'LONGEST STREAK' },
  { id: 'chopper', name: 'Rescue Chopper', blurb: 'Choplifter-style: roll and pitch fly, hover to bomb, flick fires; land to rescue hostages.' },
  { id: 'flight', name: 'Sky Rings', blurb: 'Flight sim: hold the MUGIC like a plane — roll banks, nose up climbs, yaw is the rudder. Fly the ring course.' },
  { id: 'sokoban', name: 'Warehouse', short: 'WAREHOUSE HARD', blurb: 'Flick left/right/up/down to step and push crates, undo with a button.', board: 'LEVEL RECORDS', levels: 25 },
];
