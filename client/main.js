import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TRACK,
  START_LINE,
  CHECKPOINT_LINE,
  GRID_SIZE,
  CAR,
  LAPS
} from "../shared/constants.js";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const playerIdEl = document.getElementById("playerId");
const lapsEl = document.getElementById("laps");
const statusEl = document.getElementById("status");

const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
const wsHost = location.host;
let socket = null;

if (!wsHost) {
  statusEl.textContent = "Open via http://<host>:3000 (not file://).";
} else {
  socket = new WebSocket(`${wsProtocol}://${wsHost}`);
}

const state = {
  id: null,
  players: new Map(),
  dirt: new Float32Array(GRID_SIZE * GRID_SIZE).fill(1),
  keys: {
    up: false,
    down: false,
    left: false,
    right: false
  },
  lastInput: { throttle: 0, steer: 0 }
};

if (socket) {
  socket.addEventListener("open", () => {
    statusEl.textContent = "Connected. Waiting for another racer...";
  });
}

if (socket) {
  socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    state.id = msg.id;
    playerIdEl.textContent = `Player ${msg.id}`;
    lapsEl.textContent = `Laps: 0 / ${msg.laps}`;
    statusEl.textContent = "Ready. Use WASD or arrows to drive.";
  }

  if (msg.type === "full") {
    statusEl.textContent = "Room full. Open a new tab after a player leaves.";
  }

  if (msg.type === "dirt-full") {
    state.dirt = Float32Array.from(msg.grid);
  }

  if (msg.type === "state") {
    for (const player of msg.players) {
      state.players.set(player.id, player);
      if (player.id === state.id) {
        lapsEl.textContent = `Laps: ${player.lap} / ${LAPS}`;
        if (player.finished) {
          statusEl.textContent = "Finished! Refresh to race again.";
        }
      }
    }

    if (msg.dirt) {
      for (const [index, value] of msg.dirt) {
        state.dirt[index] = value;
      }
    }
  }
  });
}

if (socket) {
  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected. Refresh to reconnect.";
  });

  socket.addEventListener("error", () => {
    statusEl.textContent = "Connection error. Ensure the server is running and open http://<host>:3000.";
  });
}

function sendInput() {
  const throttle = (state.keys.up ? 1 : 0) + (state.keys.down ? -1 : 0);
  const steer = (state.keys.right ? 1 : 0) + (state.keys.left ? -1 : 0);

  if (!socket || socket.readyState !== 1) return;
  if (throttle !== state.lastInput.throttle || steer !== state.lastInput.steer) {
    state.lastInput = { throttle, steer };
    socket.send(
      JSON.stringify({
        type: "input",
        throttle,
        steer
      })
    );
  }
}

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  switch (event.key) {
    case "w":
    case "W":
    case "ArrowUp":
      state.keys.up = true;
      break;
    case "s":
    case "S":
    case "ArrowDown":
      state.keys.down = true;
      break;
    case "a":
    case "A":
    case "ArrowLeft":
      state.keys.left = true;
      break;
    case "d":
    case "D":
    case "ArrowRight":
      state.keys.right = true;
      break;
    default:
      return;
  }
  sendInput();
});

window.addEventListener("keyup", (event) => {
  switch (event.key) {
    case "w":
    case "W":
    case "ArrowUp":
      state.keys.up = false;
      break;
    case "s":
    case "S":
    case "ArrowDown":
      state.keys.down = false;
      break;
    case "a":
    case "A":
    case "ArrowLeft":
      state.keys.left = false;
      break;
    case "d":
    case "D":
    case "ArrowRight":
      state.keys.right = false;
      break;
    default:
      return;
  }
  sendInput();
});

function worldToCanvas(x, y) {
  return {
    x: (x / WORLD_WIDTH) * canvas.width,
    y: (y / WORLD_HEIGHT) * canvas.height
  };
}

function drawTrack() {
  ctx.fillStyle = "#1d242c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const outer = worldToCanvas(TRACK.outer.x, TRACK.outer.y);
  const outerW = (TRACK.outer.w / WORLD_WIDTH) * canvas.width;
  const outerH = (TRACK.outer.h / WORLD_HEIGHT) * canvas.height;

  ctx.fillStyle = "#2a333b";
  ctx.fillRect(outer.x, outer.y, outerW, outerH);

  const inner = worldToCanvas(TRACK.inner.x, TRACK.inner.y);
  const innerW = (TRACK.inner.w / WORLD_WIDTH) * canvas.width;
  const innerH = (TRACK.inner.h / WORLD_HEIGHT) * canvas.height;

  ctx.fillStyle = "#0b0f12";
  ctx.fillRect(inner.x, inner.y, innerW, innerH);

  ctx.strokeStyle = "#394653";
  ctx.lineWidth = 4;
  ctx.strokeRect(outer.x, outer.y, outerW, outerH);
  ctx.strokeRect(inner.x, inner.y, innerW, innerH);

  drawLine(START_LINE, "#f7d154");
  drawLine(CHECKPOINT_LINE, "#56c0f7");
}

function drawLine(line, color) {
  const start = worldToCanvas(line.x1, line.y1);
  const end = worldToCanvas(line.x2, line.y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function drawDirt() {
  const cellW = canvas.width / GRID_SIZE;
  const cellH = canvas.height / GRID_SIZE;
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const index = gy * GRID_SIZE + gx;
      const dirt = state.dirt[index];
      if (dirt <= 0.02) continue;
      const alpha = Math.min(0.7, dirt * 0.7);
      ctx.fillStyle = `rgba(160, 118, 72, ${alpha})`;
      ctx.fillRect(gx * cellW, gy * cellH, cellW, cellH);
    }
  }

  const inner = worldToCanvas(TRACK.inner.x, TRACK.inner.y);
  const innerW = (TRACK.inner.w / WORLD_WIDTH) * canvas.width;
  const innerH = (TRACK.inner.h / WORLD_HEIGHT) * canvas.height;
  ctx.fillStyle = "#0b0f12";
  ctx.fillRect(inner.x, inner.y, innerW, innerH);
}

function drawCars() {
  for (const player of state.players.values()) {
    const pos = worldToCanvas(player.x, player.y);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(player.angle);
    ctx.fillStyle = player.id === state.id ? "#f97316" : "#38bdf8";
    ctx.fillRect(-CAR.width / 2, -CAR.height / 2, CAR.width, CAR.height);
    ctx.restore();
  }
}

function loop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTrack();
  drawDirt();
  drawCars();
  requestAnimationFrame(loop);
}

loop();
