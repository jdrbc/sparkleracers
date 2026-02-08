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
const overlayEl = document.getElementById("overlay");
const lobbyStatusEl = document.getElementById("lobbyStatus");
const lobbyPlayersEl = document.getElementById("lobbyPlayers");
const readyBtn = document.getElementById("readyBtn");
const countdownEl = document.getElementById("countdown");
const countdownTextEl = document.getElementById("countdownText");

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
  lobbyPlayers: [],
  keys: {
    up: false,
    down: false,
    left: false,
    right: false
  },
  lastInput: { throttle: 0, steer: 0 }
};

function setLobbyVisible(visible) {
  overlayEl.classList.toggle("hidden", !visible);
}

function setCountdownVisible(visible) {
  countdownEl.classList.toggle("hidden", !visible);
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
    setLobbyVisible(true);
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
      if (msg.players.length < msg.maxPlayers) {
        lobbyStatusEl.textContent = "Waiting for another racer...";
      } else {
        lobbyStatusEl.textContent = "Both racers connected. Ready up!";
      }
    }
  }

  if (msg.type === "countdown") {
    setLobbyVisible(false);
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
    lobbyStatusEl.textContent = "Disconnected. Refresh to reconnect.";
    readyBtn.disabled = true;
    state.canDrive = false;
    setLobbyVisible(true);
    setCountdownVisible(false);
  });

  socket.addEventListener("error", () => {
    statusEl.textContent = "Connection error. Ensure the server is running and open http://<host>:3000.";
    lobbyStatusEl.textContent = "Connection error. Check the server and refresh.";
    readyBtn.disabled = true;
    state.canDrive = false;
    setLobbyVisible(true);
    setCountdownVisible(false);
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
  ctx.fillStyle = "#1d242c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const outer = ellipseToCanvas(TRACK.outer);
  const inner = ellipseToCanvas(TRACK.inner);

  ctx.fillStyle = "#2a333b";
  ctx.beginPath();
  ctx.ellipse(outer.cx, outer.cy, outer.rx, outer.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#0b0f12";
  ctx.beginPath();
  ctx.ellipse(inner.cx, inner.cy, inner.rx, inner.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#394653";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(outer.cx, outer.cy, outer.rx, outer.ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(inner.cx, inner.cy, inner.rx, inner.ry, 0, 0, Math.PI * 2);
  ctx.stroke();

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
      const worldX = ((gx + 0.5) / GRID_SIZE) * WORLD_WIDTH;
      const worldY = ((gy + 0.5) / GRID_SIZE) * WORLD_HEIGHT;
      if (!isOnTrack(worldX, worldY)) continue;
      const alpha = Math.min(0.7, dirt * 0.7);
      ctx.fillStyle = `rgba(160, 118, 72, ${alpha})`;
      ctx.fillRect(gx * cellW, gy * cellH, cellW, cellH);
    }
  }
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
