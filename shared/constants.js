export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export const TRACK = {
  outer: { x: 80, y: 60, w: 1040, h: 680 },
  inner: { x: 340, y: 240, w: 520, h: 320 }
};

export const START_LINE = {
  x1: TRACK.outer.x + TRACK.outer.w / 2 - 60,
  y1: TRACK.outer.y + 10,
  x2: TRACK.outer.x + TRACK.outer.w / 2 + 60,
  y2: TRACK.outer.y + 10
};

export const CHECKPOINT_LINE = {
  x1: TRACK.outer.x + TRACK.outer.w / 2 - 60,
  y1: TRACK.outer.y + TRACK.outer.h - 10,
  x2: TRACK.outer.x + TRACK.outer.w / 2 + 60,
  y2: TRACK.outer.y + TRACK.outer.h - 10
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
