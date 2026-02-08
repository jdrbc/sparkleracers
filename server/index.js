import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TRACK,
  START_LINE,
  CHECKPOINT_LINE,
  GRID_SIZE,
  DIRTY_DECAY,
  DIRTY_RADIUS,
  DIRTY_SPEED_BOOST,
  TICK_RATE,
  STATE_RATE,
  CAR,
  LAPS
} from "../shared/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "../client")));
app.use("/shared", express.static(path.join(__dirname, "../shared")));

const players = new Map();
let nextId = 1;

const dirt = new Float32Array(GRID_SIZE * GRID_SIZE).fill(1);
const pendingDirtUpdates = new Map();

const startPositions = [
  { x: TRACK.outer.x + TRACK.outer.w / 2 - 40, y: TRACK.outer.y + 80, angle: Math.PI / 2 },
  { x: TRACK.outer.x + TRACK.outer.w / 2 + 40, y: TRACK.outer.y + 80, angle: Math.PI / 2 }
];

function makeCar(index) {
  const pos = startPositions[index % startPositions.length];
  return {
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    angle: pos.angle,
    lap: 0,
    checkpoint: false,
    finished: false,
    lastX: pos.x,
    lastY: pos.y
  };
}

function isOnTrack(x, y) {
  const inOuter =
    x >= TRACK.outer.x &&
    x <= TRACK.outer.x + TRACK.outer.w &&
    y >= TRACK.outer.y &&
    y <= TRACK.outer.y + TRACK.outer.h;
  const inInner =
    x >= TRACK.inner.x &&
    x <= TRACK.inner.x + TRACK.inner.w &&
    y >= TRACK.inner.y &&
    y <= TRACK.inner.y + TRACK.inner.h;
  return inOuter && !inInner;
}

function segmentIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rPx = bx - ax;
  const rPy = by - ay;
  const sPx = dx - cx;
  const sPy = dy - cy;
  const denom = rPx * sPy - rPy * sPx;
  if (denom === 0) return false;
  const u = ((cx - ax) * rPy - (cy - ay) * rPx) / denom;
  const t = ((cx - ax) * sPy - (cy - ay) * sPx) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function crossedLine(prev, next, line) {
  return segmentIntersect(prev.x, prev.y, next.x, next.y, line.x1, line.y1, line.x2, line.y2);
}

function dirtIndexFor(x, y) {
  const gx = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((x / WORLD_WIDTH) * GRID_SIZE)));
  const gy = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((y / WORLD_HEIGHT) * GRID_SIZE)));
  return { gx, gy, index: gy * GRID_SIZE + gx };
}

function applyDirtAt(x, y) {
  const radius = DIRTY_RADIUS;
  const base = dirtIndexFor(x, y);
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const gx = base.gx + dx;
      const gy = base.gy + dy;
      if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) continue;
      const index = gy * GRID_SIZE + gx;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const current = dirt[index];
      if (current <= 0) continue;
      const next = Math.max(0, current - DIRTY_DECAY * (1 - dist / radius));
      if (next !== current) {
        dirt[index] = next;
        pendingDirtUpdates.set(index, next);
      }
    }
  }
}

function dirtAt(x, y) {
  return dirt[dirtIndexFor(x, y).index];
}

function updateLap(car) {
  const prev = { x: car.lastX, y: car.lastY };
  const next = { x: car.x, y: car.y };
  if (crossedLine(prev, next, CHECKPOINT_LINE)) {
    car.checkpoint = true;
  }
  if (car.checkpoint && crossedLine(prev, next, START_LINE)) {
    car.lap += 1;
    car.checkpoint = false;
    if (car.lap >= LAPS) {
      car.finished = true;
    }
  }
}

function stepPlayer(player, dt) {
  const car = player.car;
  car.lastX = car.x;
  car.lastY = car.y;

  const throttle = player.input.throttle;
  const steer = player.input.steer;

  const dirtValue = dirtAt(car.x, car.y);
  const speedBoost = 1 + dirtValue * DIRTY_SPEED_BOOST;

  const accel = throttle * CAR.accel * speedBoost;
  const ax = Math.cos(car.angle) * accel;
  const ay = Math.sin(car.angle) * accel;

  car.vx += ax * dt;
  car.vy += ay * dt;

  const speed = Math.hypot(car.vx, car.vy);
  const turnScale = Math.min(1, speed / CAR.maxSpeed);
  car.angle += steer * CAR.turnRate * turnScale * dt;

  car.vx *= CAR.friction;
  car.vy *= CAR.friction;

  if (!isOnTrack(car.x, car.y)) {
    car.vx *= CAR.offTrackFriction;
    car.vy *= CAR.offTrackFriction;
  }

  const limitedSpeed = Math.min(CAR.maxSpeed * speedBoost, Math.hypot(car.vx, car.vy));
  if (limitedSpeed > 0) {
    const factor = limitedSpeed / Math.max(0.0001, Math.hypot(car.vx, car.vy));
    car.vx *= factor;
    car.vy *= factor;
  }

  car.x += car.vx * dt;
  car.y += car.vy * dt;

  car.x = Math.max(0, Math.min(WORLD_WIDTH, car.x));
  car.y = Math.max(0, Math.min(WORLD_HEIGHT, car.y));

  if (isOnTrack(car.x, car.y)) {
    applyDirtAt(car.x, car.y);
  }

  updateLap(car);
}

function broadcastState(includeDirt) {
  const playersState = Array.from(players.values()).map((player) => ({
    id: player.id,
    x: player.car.x,
    y: player.car.y,
    angle: player.car.angle,
    lap: player.car.lap,
    finished: player.car.finished
  }));

  const payload = {
    type: "state",
    players: playersState
  };

  if (includeDirt && pendingDirtUpdates.size > 0) {
    payload.dirt = Array.from(pendingDirtUpdates.entries());
    pendingDirtUpdates.clear();
  }

  const message = JSON.stringify(payload);
  for (const player of players.values()) {
    if (player.socket.readyState === 1) {
      player.socket.send(message);
    }
  }
}

function sendFullDirt(socket) {
  socket.send(
    JSON.stringify({
      type: "dirt-full",
      grid: Array.from(dirt)
    })
  );
}

wss.on("connection", (socket) => {
  if (players.size >= 2) {
    socket.send(JSON.stringify({ type: "full" }));
    socket.close();
    return;
  }

  const id = nextId++;
  const player = {
    id,
    socket,
    input: { throttle: 0, steer: 0 },
    car: makeCar(players.size)
  };

  players.set(id, player);

  socket.send(
    JSON.stringify({
      type: "welcome",
      id,
      world: { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      track: TRACK,
      startLine: START_LINE,
      checkpointLine: CHECKPOINT_LINE,
      laps: LAPS
    })
  );

  sendFullDirt(socket);

  socket.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === "input") {
      player.input.throttle = Math.max(-1, Math.min(1, msg.throttle ?? 0));
      player.input.steer = Math.max(-1, Math.min(1, msg.steer ?? 0));
    }
  });

  socket.on("close", () => {
    players.delete(id);
  });
});

let lastTime = Date.now();
let stateAccumulator = 0;

setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  for (const player of players.values()) {
    if (!player.car.finished) {
      stepPlayer(player, dt);
    }
  }

  stateAccumulator += dt;
  if (stateAccumulator >= 1 / STATE_RATE) {
    broadcastState(true);
    stateAccumulator = 0;
  }
}, 1000 / TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`SparkleRacers running on http://localhost:${PORT}`);
});
