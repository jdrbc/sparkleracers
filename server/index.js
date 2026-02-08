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
  CLEAN_SPEED_PENALTY,
  TICK_RATE,
  STATE_RATE,
  CAR,
  LAPS
} from "../shared/constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, perMessageDeflate: false });

app.use(express.static(path.join(__dirname, "../client")));
app.use("/shared", express.static(path.join(__dirname, "../shared")));

const players = new Map();
let nextId = 1;
const MAX_PLAYERS = 2;
let raceState = "lobby";
let countdownTimer = null;
let winnerId = null;

const dirt = new Float32Array(GRID_SIZE * GRID_SIZE).fill(1);
const pendingDirtUpdates = new Map();

const startPositions = [
  {
    x: START_LINE.x1 - 70,
    y: START_LINE.y1 + 20,
    angle: 0
  },
  {
    x: START_LINE.x1 - 70,
    y: START_LINE.y2 - 20,
    angle: 0
  }
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

function resetRace() {
  const racers = Array.from(players.values());
  racers.forEach((player, index) => {
    player.car = makeCar(index);
    player.input = { throttle: 0, steer: 0 };
    player.ready = false;
    player.replayReady = false;
  });
  winnerId = null;
  dirt.fill(1);
  pendingDirtUpdates.clear();
}

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const player of players.values()) {
    if (player.socket.readyState === 1) {
      player.socket.send(message);
    }
  }
}

function sendFullDirtAll() {
  for (const player of players.values()) {
    if (player.socket.readyState === 1) {
      sendFullDirt(player.socket);
    }
  }
}

function broadcastLobby() {
  const lobbyPlayers = Array.from(players.values()).map((player) => ({
    id: player.id,
    ready: player.ready
  }));
  broadcast({
    type: "lobby",
    players: lobbyPlayers,
    maxPlayers: MAX_PLAYERS,
    state: raceState
  });
}

function cancelCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (raceState === "countdown") {
    raceState = "lobby";
    broadcast({ type: "countdown", value: -1 });
  }
}

function startCountdown() {
  if (raceState !== "lobby") return;
  raceState = "countdown";
  let count = 3;
  broadcast({ type: "countdown", value: count });
  countdownTimer = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      broadcast({ type: "countdown", value: 0 });
      raceState = "racing";
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    broadcast({ type: "countdown", value: count });
  }, 1000);
}

function tryStartRace() {
  if (players.size !== MAX_PLAYERS) return;
  const everyoneReady = Array.from(players.values()).every((player) => player.ready);
  if (everyoneReady) {
    startCountdown();
  }
}

function ellipseValue(ellipse, x, y) {
  return ((x - ellipse.cx) / ellipse.rx) ** 2 + ((y - ellipse.cy) / ellipse.ry) ** 2;
}

function isOnTrack(x, y) {
  const outerValue = ellipseValue(TRACK.outer, x, y);
  const innerValue = ellipseValue(TRACK.inner, x, y);
  return outerValue <= 1 && innerValue >= 1;
}

function resolveWallCollision(car) {
  const outerValue = ellipseValue(TRACK.outer, car.x, car.y);
  const innerValue = ellipseValue(TRACK.inner, car.x, car.y);
  let boundary = null;
  if (outerValue > 1) {
    boundary = TRACK.outer;
  } else if (innerValue < 1) {
    boundary = TRACK.inner;
  }

  if (!boundary) return;

  const dx = car.x - boundary.cx;
  const dy = car.y - boundary.cy;
  const denom = Math.sqrt((dx / boundary.rx) ** 2 + (dy / boundary.ry) ** 2);
  if (denom === 0) return;
  const scale = 1 / denom;
  car.x = boundary.cx + dx * scale;
  car.y = boundary.cy + dy * scale;

  let nx = dx / (boundary.rx * boundary.rx);
  let ny = dy / (boundary.ry * boundary.ry);
  const nLen = Math.hypot(nx, ny);
  if (nLen === 0) return;
  nx /= nLen;
  ny /= nLen;

  const dot = car.vx * nx + car.vy * ny;
  car.vx = (car.vx - 2 * dot * nx) * 0.45;
  car.vy = (car.vy - 2 * dot * ny) * 0.45;
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
  const radiusCeil = Math.ceil(radius);
  const base = dirtIndexFor(x, y);
  for (let dy = -radiusCeil; dy <= radiusCeil; dy += 1) {
    for (let dx = -radiusCeil; dx <= radiusCeil; dx += 1) {
      const gx = base.gx + dx;
      const gy = base.gy + dy;
      if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) continue;
      const index = gy * GRID_SIZE + gx;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;
      const current = dirt[index];
      if (current <= 0) continue;
      const next = 0;
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
  car.dirtValue = dirtValue;
  const speedBoost = 1 - CLEAN_SPEED_PENALTY + dirtValue * (DIRTY_SPEED_BOOST + CLEAN_SPEED_PENALTY);

  const accel = throttle * CAR.accel * speedBoost;
  const ax = Math.cos(car.angle) * accel;
  const ay = Math.sin(car.angle) * accel;

  car.vx += ax * dt;
  car.vy += ay * dt;

  const speed = Math.hypot(car.vx, car.vy);
  const turnScale = Math.max(0.2, Math.min(1, speed / CAR.maxSpeed));
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

  resolveWallCollision(car);

  if (isOnTrack(car.x, car.y)) {
    applyDirtAt(car.x, car.y);
  }

  updateLap(car);

  if (car.finished && winnerId === null) {
    winnerId = player.id;
    raceState = "finished";
    for (const racer of players.values()) {
      racer.input.throttle = 0;
      racer.input.steer = 0;
    }
  }
}

function broadcastState(includeDirt) {
  const playersState = Array.from(players.values()).map((player) => ({
    id: player.id,
    x: player.car.x,
    y: player.car.y,
    angle: player.car.angle,
    lap: player.car.lap,
    finished: player.car.finished,
    dirt: player.car.dirtValue ?? 0
  }));

  const payload = {
    type: "state",
    players: playersState,
    raceState,
    winnerId
  };

  if (includeDirt && pendingDirtUpdates.size > 0) {
    payload.dirt = Array.from(pendingDirtUpdates.entries());
    pendingDirtUpdates.clear();
  }

  broadcast(payload);
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
  if (socket._socket) {
    socket._socket.setNoDelay(true);
  }
  if (players.size >= MAX_PLAYERS) {
    socket.send(JSON.stringify({ type: "full" }));
    socket.close();
    return;
  }

  const id = nextId++;
  const player = {
    id,
    socket,
    input: { throttle: 0, steer: 0 },
    ready: false,
    replayReady: false,
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
  broadcastLobby();

  socket.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === "ready") {
      player.ready = Boolean(msg.ready);
      if (!player.ready && raceState === "countdown") {
        cancelCountdown();
      }
      broadcastLobby();
      tryStartRace();
    }

    if (msg.type === "input") {
      if (raceState !== "racing") {
        player.input.throttle = 0;
        player.input.steer = 0;
        return;
      }
      player.input.throttle = Math.max(-1, Math.min(1, msg.throttle ?? 0));
      player.input.steer = Math.max(-1, Math.min(1, msg.steer ?? 0));
    }

    if (msg.type === "play-again") {
      if (raceState !== "finished") return;
      player.replayReady = true;
      const allReady = Array.from(players.values()).every((racer) => racer.replayReady);
      if (allReady) {
        resetRace();
        raceState = "lobby";
        sendFullDirtAll();
        broadcastLobby();
        startCountdown();
      }
    }
  });

  socket.on("close", () => {
    players.delete(id);
    if (winnerId === id) {
      winnerId = null;
    }
    cancelCountdown();
    if (players.size < MAX_PLAYERS) {
      raceState = "lobby";
    }
    broadcastLobby();
  });
});

let lastTime = Date.now();
let stateAccumulator = 0;

setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  if (raceState === "racing") {
    for (const player of players.values()) {
      if (!player.car.finished) {
        stepPlayer(player, dt);
      }
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
