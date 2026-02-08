# SparkleRacers — Improvement Ideas

## ✅ Implementing Now

- [x] **Countdown** — 3-2-1-GO overlay after both players connect; server freezes input until countdown ends
- [x] **Start menu / lobby** — Title screen with ready-up; replace bare HUD text
- [x] **Shaped track** — Polygon/spline-based track with curves instead of two rectangles
- [x] **Track boundaries / walls** — Collision with track edges; bounce or slide along walls
- [x] **Finish screen + play again** — Winner banner with final time, "Play Again" button (no refresh)
- [x] **Clean** — Dirty areas supply speed boost, and are cleaned away as the players drive over them
- [x] **Spray particles** — Pressure-washer water spray trailing behind the car on dirty patches

## 🛣️ Track & World

- [ ] **Multiple tracks** — Several layouts selectable from lobby; stored as JSON definitions
- [ ] **Track decorations** — Grandstands, trees, puddles, cones as static sprites
- [ ] **Minimap** — Small corner overview showing both cars on the full track

## 🚗 Car & Physics

- [ ] **Drift / skid mechanics** — Separate front/rear grip; skid marks on canvas
- [ ] **Car sprites** — Pixel-art or SVG pressure washers instead of colored rectangles
- [ ] **Camera follow** — Smooth camera tracking your car with slight zoom (needed for bigger tracks)
- [ ] **Speed lines / boost effect** — Visual feedback when hitting dirty patches
- [ ] **Collision between cars** — Bump physics for jostling over position

## 🎮 Gameplay Depth

- [ ] **Dirt regrowth** — Dirt slowly returns so cleaned paths re-dirty between laps
- [ ] **Power-ups** — Turbo boost, oil slick (re-dirties), super spray (wider clean radius)
- [ ] **Ghost replay** — After finishing, show ghost of your best lap
- [ ] **Reverse / mirror mode** — Run the track in the opposite direction
- [ ] **Qualifying lap** — Solo timed lap to determine grid position
- [ ] **Race timer** — Elapsed time and per-lap split times on HUD

## 🎨 Polish & Juice

- [ ] **Sound effects** — Engine hum, spray sound, countdown beeps, finish fanfare (Web Audio API)
- [ ] **Screen shake** — Subtle shake on collisions or boost activation
- [ ] **Trail rendering** — Fading trail showing the path each car has cleaned
- [ ] **Animated dirt** — Shimmer/grain texture instead of flat color blocks
- [ ] **Day / night / weather** — Rain makes dirt muddier, night adds headlight cones

## 🌐 Networking & Infrastructure

- [ ] **Client-side prediction** — Interpolate/predict local car so it feels instant despite network ticks
- [ ] **Reconnect handling** — Let disconnected players rejoin mid-race
- [ ] **More than 2 players** — Expand to 4+ racers
- [ ] **Mobile touch controls** — On-screen steering for phones on the same LAN
- [ ] **Spectator mode** — Extra connections watch instead of being rejected
