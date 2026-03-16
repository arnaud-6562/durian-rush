# Durian Rush KL

Live interactive supply chain game for **CargoNOW 2025, Kuala Lumpur**.

~150 supply chain practitioners play on their phones against **Durry**, an AI opponent. The game demonstrates that AI beats humans in supply chain decisions — and that data quality is everything.

## How it works

| Round | What happens | Duration |
|-------|-------------|----------|
| **Lobby** | Players scan QR code, register with SMS OTP | 5 min |
| **Round 1** | Humans play 10 weeks of ordering decisions | 5 min |
| **Round 2** | Durry (AI) plays with clean data | ~90 sec |
| **GIGO Reveal** | SAP data gets corrupted | 10 sec |
| **Round 3** | Durry plays with dirty data — costs explode | ~60 sec |
| **Results** | 3-way podium: AI Clean vs Best Human vs AI Dirty | 2 min |

**Core message:** AI doesn't fail because of bad models. It fails because of bad data.

## URLs

| Environment | URL |
|------------|-----|
| Admin (projector) | https://durian-rush-kl.web.app/admin |
| Player (phones) | https://play.tetrixx.app/play |
| Demo (single-player) | https://durian-rush-kl.web.app |

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + Vite 8 |
| Realtime | Firebase Realtime Database (Singapore) |
| Auth | Firebase Auth SMS OTP |
| Charts | Chart.js + react-chartjs-2 |
| Hosting | Firebase Hosting |
| Deploy | `firebase deploy --only hosting` |

## Project structure

```
src/
  App.jsx              — Router: /admin, /play, / (demo)
  AdminScreen.jsx      — Projector view, 12 phases, presenter controls
  PlayerScreen.jsx     — Mobile: register → OTP → play → watch → results
  GameEngine.js        — Pure functions: demand, costs, AI logic, bullwhip
  firebase.js          — Firebase init
  components/
    DurryIntro.jsx     — Boss reveal cinematic
    GigoReveal.jsx     — SAP corruption cinematic
    NodeCard.jsx       — Per-tier inventory/cost card
    AnimNum.jsx        — Slot-machine number animation
    Leaderboard.jsx    — Live ranked players
    BullwhipChart.jsx  — 4-tier inventory oscillation chart
    MalaysiaMap.jsx    — Animated SVG supply chain map
```

## The supply chain

```
🌾 Penang Farm → ⚙️ Ipoh Factory → 🚛 Shah Alam Hub → 🏪 KL Retailer
   (3 wk)           (2 wk)             (1 wk)
```

Players control the KL Retailer. Holding cost: $0.50/case/week. Stockout penalty: $3.00/case/week.

## Security

- Admin route (`/admin`) is PIN-gated — requires authentication before accessing controls
- Firebase database rules restrict writes to authenticated paths
- Player sessions validated against database on load (prevents ghost players after reset)
- Admin reset broadcasts `resetAt` timestamp — all player phones auto-clear stale sessions

## Development

```bash
npm install
npm run dev          # local dev server
npm run build        # production build
firebase deploy --only hosting   # deploy to Firebase
```

### Environment variables

Create a `.env` file (see Firebase console for values):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Built by

**TetriXX** — Automating complexity, delivering clarity for a sustainable future.

[tetrixx.io](https://tetrixx.io)
