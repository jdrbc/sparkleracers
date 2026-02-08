Plan: Implement SparkleRacers

1) Define core rules & scope
	- Confirm: 2 players, local network (LAN) web-based, 2D top-down, 3 laps, pressure washer vehicles.
	- Movement: steering, acceleration, friction; speed boost on dirty track.
	- Track dirt system: dirty areas provide speed boost; driving cleans/dirties?
	- Win condition: first to 3 laps.

2) Choose tech stack & project structure
	- Client: HTML5 Canvas + JS/TS for rendering and input.
	- Server: small Node.js/WS server for LAN matchmaking & state sync.
	- Repo layout: /client, /server, /shared (shared constants/types).

3) Build gameplay prototype (offline single screen)
	- Implement track as polygon + dirt mask (grid or texture).
	- Implement physics: position, velocity, steering.
	- Implement lap checkpoints & lap counter.
	- Implement dirt speed modifier and visual dirt overlay.

4) Add 2-player local input & split camera
	- Keyboard/controller mapping for 2 players.
	- Shared camera or split-screen (decide based on track size).
	- HUD: lap counter, current speed, leader indicator.

5) Add LAN networking
	- Host/join flow on LAN (display IP, simple lobby).
	- Authoritative server simulation or client prediction + reconciliation.
	- Sync: player state, lap count, dirt mask updates.

6) Game loop, UX, and polish
	- Start countdown, finish banner, restart.
	- Basic SFX for spraying/movement; simple sprites.
	- Performance tuning for dirt grid updates and network bandwidth.

7) Test & iterate
	- Test lap detection edge cases.
	- Balance dirt speed boost vs. track cleanliness.
	- LAN latency tolerance and disconnect handling.
