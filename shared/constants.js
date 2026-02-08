export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export const TRACK = {
  outer: { cx: 600, cy: 400, rx: 520, ry: 320 },
  inner: { cx: 600, cy: 400, rx: 300, ry: 160 }
};

export const START_LINE = {
  x1: TRACK.outer.cx - 260,
  y1: TRACK.outer.cy - TRACK.outer.ry + 60,
  x2: TRACK.outer.cx + 260,
  y2: TRACK.outer.cy - TRACK.outer.ry + 60
};

export const CHECKPOINT_LINE = {
  x1: TRACK.outer.cx - 260,
  y1: TRACK.outer.cy + TRACK.outer.ry - 60,
  x2: TRACK.outer.cx + 260,
  y2: TRACK.outer.cy + TRACK.outer.ry - 60
};

export const GRID_SIZE = 64;
export const DIRTY_DECAY = 0.008;
export const DIRTY_RADIUS = 2.6;
export const DIRTY_SPEED_BOOST = 0.35;

export const TICK_RATE = 60;
export const STATE_RATE = 20;

export const CAR = {
  width: 32,
  height: 18,
  accel: 900,
  maxSpeed: 420,
  turnRate: 3.2,
  friction: 0.94,
  offTrackFriction: 0.86
};

export const LAPS = 3;
