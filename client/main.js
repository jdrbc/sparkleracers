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

const trackCanvas = document.createElement("canvas");
trackCanvas.width = canvas.width;
trackCanvas.height = canvas.height;
const trackCtx = trackCanvas.getContext("2d");

const dirtCanvas = document.createElement("canvas");
dirtCanvas.width = canvas.width;
dirtCanvas.height = canvas.height;
const dirtCtx = dirtCanvas.getContext("2d");

const playerIdEl = document.getElementById("playerId");
const lapsEl = document.getElementById("laps");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const lobbyStatusEl = document.getElementById("lobbyStatus");
const lobbyPlayersEl = document.getElementById("lobbyPlayers");
const readyBtn = document.getElementById("readyBtn");
const countdownEl = document.getElementById("countdown");
const countdownTextEl = document.getElementById("countdownText");
const finishEl = document.getElementById("finish");
const finishTitleEl = document.getElementById("finishTitle");
const finishSubtitleEl = document.getElementById("finishSubtitle");
const playAgainBtn = document.getElementById("playAgainBtn");

const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
const wsHost = location.host;
let socket = null;

if (!wsHost) {
  statusEl.textContent = "Open via http://<host>:3000 (not file://).";
  lobbyStatusEl.textContent = "Open via http://<host>:3000 (not file://).";
  readyBtn.disabled = true;
} else {
  socket = new WebSocket(`${wsProtocol}://${wsHost}`);
}

const state = {
  id: null,
  players: new Map(),
  dirt: new Float32Array(GRID_SIZE * GRID_SIZE).fill(1),
  ready: false,
  canDrive: false,
  replayReady: false,
  lobbyPlayers: [],
  keys: {
    up: false,
    down: false,
    left: false,
    right: false
  },
  lastInput: { throttle: 0, steer: 0 }
};

const particles = [];
const lastPlayerPositions = new Map();
const sprayIntensity = new Map();
let lastFrameTime = performance.now();
const dirtCellsOnTrack = new Uint8Array(GRID_SIZE * GRID_SIZE);
const pendingDirtCells = new Set();
let dirtFullRebuild = true;

function setLobbyVisible(visible) {
  overlayEl.classList.toggle("hidden", !visible);
}

function setCountdownVisible(visible) {
  countdownEl.classList.toggle("hidden", !visible);
}

function setFinishVisible(visible) {
  finishEl.classList.toggle("hidden", !visible);
}

function renderLobby() {
  lobbyPlayersEl.innerHTML = "";
  for (const player of state.lobbyPlayers) {
    const row = document.createElement("div");
    row.className = "lobby-row";
    const name = document.createElement("span");
    const isYou = player.id === state.id;
    name.textContent = isYou ? `Player ${player.id} (You)` : `Player ${player.id}`;
    const status = document.createElement("span");
    status.textContent = player.ready ? "Ready" : "Not Ready";
    status.className = player.ready ? "lobby-ready" : "lobby-waiting";
    row.appendChild(name);
    row.appendChild(status);
    lobbyPlayersEl.appendChild(row);
  }
}

function updateReadyButton() {
  readyBtn.textContent = state.ready ? "Cancel" : "Ready";
}

function updatePlayAgainButton() {
  playAgainBtn.textContent = state.replayReady ? "Waiting..." : "Play Again";
  playAgainBtn.disabled = state.replayReady;
}

function sendReady() {
  if (!socket || socket.readyState !== 1) return;
  socket.send(
    JSON.stringify({
      type: "ready",
      ready: state.ready
    })
  );
}

readyBtn.addEventListener("click", () => {
  state.ready = !state.ready;
  updateReadyButton();
  sendReady();
});

playAgainBtn.addEventListener("click", () => {
  if (!socket || socket.readyState !== 1) return;
  state.replayReady = true;
  updatePlayAgainButton();
  socket.send(
    JSON.stringify({
      type: "play-again"
    })
  );
});

if (socket) {
  socket.addEventListener("open", () => {
    statusEl.textContent = "Connected. Waiting for another racer...";
    lobbyStatusEl.textContent = "Connected. Waiting for another racer...";
    readyBtn.disabled = false;
  });
}

if (socket) {
  socket.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "welcome") {
    state.id = msg.id;
    playerIdEl.textContent = `Player ${msg.id}`;
    lapsEl.textContent = `Laps: 0 / ${msg.laps}`;
    statusEl.textContent = "Press Ready in the lobby to start.";
    lobbyStatusEl.textContent = "Connected. Press Ready when you are set.";
    updateReadyButton();
    updatePlayAgainButton();
    setLobbyVisible(true);
    setFinishVisible(false);
  }

  if (msg.type === "full") {
    statusEl.textContent = "Room full. Open a new tab after a player leaves.";
    lobbyStatusEl.textContent = "Room full. Open a new tab after a player leaves.";
    readyBtn.disabled = true;
  }

  if (msg.type === "lobby") {
    state.lobbyPlayers = msg.players;
    renderLobby();
    if (msg.state === "lobby") {
      setLobbyVisible(true);
      setCountdownVisible(false);
      setFinishVisible(false);
      state.replayReady = false;
      updatePlayAgainButton();
      if (msg.players.length < msg.maxPlayers) {
        lobbyStatusEl.textContent = "Waiting for another racer...";
      } else {
        lobbyStatusEl.textContent = "Both racers connected. Ready up!";
      }
    }
  }

  if (msg.type === "countdown") {
    setLobbyVisible(false);
    setFinishVisible(false);
    if (msg.value < 0) {
      setCountdownVisible(false);
      state.canDrive = false;
      return;
    }
    setCountdownVisible(true);
    if (msg.value > 0) {
      countdownTextEl.textContent = `${msg.value}`;
      state.canDrive = false;
      state.lastInput = { throttle: 0, steer: 0 };
    } else {
      countdownTextEl.textContent = "GO!";
      state.canDrive = true;
      setTimeout(() => {
        setCountdownVisible(false);
      }, 700);
      sendInput();
    }
  }

  if (msg.type === "dirt-full") {
    state.dirt = Float32Array.from(msg.grid);
    dirtFullRebuild = true;
  }

  if (msg.type === "state") {
    for (const player of msg.players) {
      state.players.set(player.id, player);
      if (player.id === state.id) {
        lapsEl.textContent = `Laps: ${player.lap} / ${LAPS}`;
        if (player.finished) {
          statusEl.textContent = "Finished!";
        }
      }
    }

    if (msg.raceState === "finished") {
      state.canDrive = false;
      const winnerId = msg.winnerId;
      if (winnerId === state.id) {
        finishTitleEl.textContent = "You win!";
      } else if (winnerId) {
        finishTitleEl.textContent = `Player ${winnerId} wins!`;
      } else {
        finishTitleEl.textContent = "Race finished!";
      }
      finishSubtitleEl.textContent = "Press Play Again to rematch.";
      setFinishVisible(true);
      setCountdownVisible(false);
      setLobbyVisible(false);
      statusEl.textContent = "Race finished. Play again?";
    } else {
      setFinishVisible(false);
      state.replayReady = false;
      updatePlayAgainButton();
    }

    if (msg.dirt) {
      for (const [index, value] of msg.dirt) {
        state.dirt[index] = value;
        pendingDirtCells.add(index);
      }
    }
  }
  });
}

if (socket) {
  socket.addEventListener("close", () => {
    statusEl.textContent = "Disconnected. Refresh to reconnect.";
    lobbyStatusEl.textContent = "Disconnected. Refresh to reconnect.";
    readyBtn.disabled = true;
    state.canDrive = false;
    setLobbyVisible(true);
    setCountdownVisible(false);
    setFinishVisible(false);
  });

  socket.addEventListener("error", () => {
    statusEl.textContent = "Connection error. Ensure the server is running and open http://<host>:3000.";
    lobbyStatusEl.textContent = "Connection error. Check the server and refresh.";
    readyBtn.disabled = true;
    state.canDrive = false;
    setLobbyVisible(true);
    setCountdownVisible(false);
    setFinishVisible(false);
  });
}

function sendInput() {
  if (!state.canDrive) return;
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

function ellipseToCanvas(ellipse) {
  return {
    cx: (ellipse.cx / WORLD_WIDTH) * canvas.width,
    cy: (ellipse.cy / WORLD_HEIGHT) * canvas.height,
    rx: (ellipse.rx / WORLD_WIDTH) * canvas.width,
    ry: (ellipse.ry / WORLD_HEIGHT) * canvas.height
  };
}

function isOnTrack(x, y) {
  const outer = TRACK.outer;
  const inner = TRACK.inner;
  const outerValue =
    ((x - outer.cx) / outer.rx) ** 2 + ((y - outer.cy) / outer.ry) ** 2;
  const innerValue =
    ((x - inner.cx) / inner.rx) ** 2 + ((y - inner.cy) / inner.ry) ** 2;
  return outerValue <= 1 && innerValue >= 1;
}

function drawTrack() {
  trackCtx.fillStyle = "#1d242c";
  trackCtx.fillRect(0, 0, trackCanvas.width, trackCanvas.height);

  const outer = ellipseToCanvas(TRACK.outer);
  const inner = ellipseToCanvas(TRACK.inner);

  trackCtx.fillStyle = "#2a333b";
  trackCtx.beginPath();
  trackCtx.ellipse(outer.cx, outer.cy, outer.rx, outer.ry, 0, 0, Math.PI * 2);
  trackCtx.fill();

  trackCtx.fillStyle = "#0b0f12";
  trackCtx.beginPath();
  trackCtx.ellipse(inner.cx, inner.cy, inner.rx, inner.ry, 0, 0, Math.PI * 2);
  trackCtx.fill();

  trackCtx.strokeStyle = "#394653";
  trackCtx.lineWidth = 4;
  trackCtx.beginPath();
  trackCtx.ellipse(outer.cx, outer.cy, outer.rx, outer.ry, 0, 0, Math.PI * 2);
  trackCtx.stroke();
  trackCtx.beginPath();
  trackCtx.ellipse(inner.cx, inner.cy, inner.rx, inner.ry, 0, 0, Math.PI * 2);
  trackCtx.stroke();

  drawLine(START_LINE, "#f7d154", trackCtx);
  drawLine(CHECKPOINT_LINE, "#56c0f7", trackCtx);
}

function drawLine(line, color, targetCtx = ctx) {
  const start = worldToCanvas(line.x1, line.y1);
  const end = worldToCanvas(line.x2, line.y2);
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = 4;
  targetCtx.beginPath();
  targetCtx.moveTo(start.x, start.y);
  targetCtx.lineTo(end.x, end.y);
  targetCtx.stroke();
}

function buildTrackMask() {
  for (let gy = 0; gy < GRID_SIZE; gy += 1) {
    for (let gx = 0; gx < GRID_SIZE; gx += 1) {
      const worldX = ((gx + 0.5) / GRID_SIZE) * WORLD_WIDTH;
      const worldY = ((gy + 0.5) / GRID_SIZE) * WORLD_HEIGHT;
      dirtCellsOnTrack[gy * GRID_SIZE + gx] = isOnTrack(worldX, worldY) ? 1 : 0;
    }
  }
}

function drawDirtCell(index) {
  const cellW = canvas.width / GRID_SIZE;
  const cellH = canvas.height / GRID_SIZE;
  const gx = index % GRID_SIZE;
  const gy = Math.floor(index / GRID_SIZE);
  dirtCtx.clearRect(gx * cellW, gy * cellH, cellW, cellH);
  const dirt = state.dirt[index];
  if (dirt <= 0.02) return;
  if (!dirtCellsOnTrack[index]) return;
  const alpha = Math.min(0.7, dirt * 0.7);
  dirtCtx.fillStyle = `rgba(160, 118, 72, ${alpha})`;
  dirtCtx.fillRect(gx * cellW, gy * cellH, cellW, cellH);
}

function rebuildDirtLayer() {
  dirtCtx.clearRect(0, 0, dirtCanvas.width, dirtCanvas.height);
  for (let index = 0; index < state.dirt.length; index += 1) {
    if (!dirtCellsOnTrack[index]) continue;
    const dirt = state.dirt[index];
    if (dirt <= 0.02) continue;
    drawDirtCell(index);
  }
}

function updateDirtLayer() {
  if (dirtFullRebuild) {
    rebuildDirtLayer();
    dirtFullRebuild = false;
    pendingDirtCells.clear();
    return;
  }
  if (pendingDirtCells.size === 0) return;
  for (const index of pendingDirtCells) {
    drawDirtCell(index);
  }
  pendingDirtCells.clear();
}

function dirtAt(x, y) {
  const gx = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((x / WORLD_WIDTH) * GRID_SIZE)));
  const gy = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((y / WORLD_HEIGHT) * GRID_SIZE)));
  return state.dirt[gy * GRID_SIZE + gx];
}

function emitSpray(player, speed, dt, intensity, mode) {
  if (speed < 25) return;

  const isDirty = mode === "dirty";
  const intensityScale = isDirty ? 4.2 : 0.6;
  const baseCount = (speed / 150 + intensity * intensityScale) * dt * 60;
  const count = Math.min(16, Math.max(isDirty ? 3 : 1, Math.floor(baseCount)));
  const backAngle = player.angle + Math.PI;
  const originDistance = CAR.height * 0.35;
  const originX = player.x + Math.cos(backAngle) * originDistance;
  const originY = player.y + Math.sin(backAngle) * originDistance;

  for (let i = 0; i < count; i += 1) {
    const spread = (Math.random() - 0.5) * 0.9;
    const angle = backAngle + spread;
    const velocity = (isDirty ? 130 : 60) + Math.random() * 140 + speed * (isDirty ? 0.5 : 0.2);
    particles.push({
      x: originX + (Math.random() - 0.5) * 8,
      y: originY + (Math.random() - 0.5) * 8,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0,
      ttl: (isDirty ? 0.55 : 0.25) + Math.random() * 0.35,
      size: (isDirty ? 3.5 : 1.1) + Math.random() * (isDirty ? 4 : 1.2),
      alpha: (isDirty ? 0.8 : 0.3) + Math.random() * (isDirty ? 0.25 : 0.15),
      mode
    });
  }
}

function updateParticles(dt) {
  const activeIds = new Set();
  for (const player of state.players.values()) {
    activeIds.add(player.id);
    const last = lastPlayerPositions.get(player.id) ?? { x: player.x, y: player.y };
    const dx = player.x - last.x;
    const dy = player.y - last.y;
    const speed = dt > 0 ? Math.hypot(dx, dy) / dt : 0;
    lastPlayerPositions.set(player.id, { x: player.x, y: player.y });
    const dirtSample = player.dirt ?? dirtAt(player.x, player.y);
    const prevIntensity = sprayIntensity.get(player.id) ?? 0;
    const nextIntensity = Math.max(dirtSample, prevIntensity * 0.9);
    sprayIntensity.set(player.id, nextIntensity);
    if (nextIntensity > 0.05) {
      emitSpray(player, speed, dt, nextIntensity, "dirty");
    } else {
      emitSpray(player, speed, dt, 0.12, "clean");
    }
  }

  for (const id of lastPlayerPositions.keys()) {
    if (!activeIds.has(id)) {
      lastPlayerPositions.delete(id);
      sprayIntensity.delete(id);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.ttl) {
      particles.splice(i, 1);
      continue;
    }
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function drawParticles() {
  if (particles.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of particles) {
    const pos = worldToCanvas(p.x, p.y);
    const lifeRatio = 1 - p.life / p.ttl;
    const alpha = p.alpha * lifeRatio;
    if (p.mode === "dirty") {
      ctx.fillStyle = `rgba(120, 90, 60, ${alpha})`;
    } else {
      ctx.fillStyle = `rgba(110, 200, 255, ${alpha})`;
    }
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, p.size * lifeRatio, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCars() {
  for (const player of state.players.values()) {
    const pos = worldToCanvas(player.x, player.y);
    const dirtBoost = player.dirt ?? dirtAt(player.x, player.y);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(player.angle);
    if (dirtBoost > 0.05) {
      ctx.fillStyle = `rgba(255, 220, 120, ${Math.min(0.35, dirtBoost * 0.6)})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, CAR.width * 0.9, CAR.height * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = player.id === state.id ? "#f97316" : "#38bdf8";
    ctx.fillRect(-CAR.width / 2, -CAR.height / 2, CAR.width, CAR.height);
    ctx.restore();
  }
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  updateDirtLayer();
  ctx.drawImage(trackCanvas, 0, 0);
  ctx.drawImage(dirtCanvas, 0, 0);
  updateParticles(dt);
  drawParticles();
  drawCars();
  requestAnimationFrame(loop);
}

buildTrackMask();
drawTrack();
loop();
