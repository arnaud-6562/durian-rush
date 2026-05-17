# Durian Rush

A live multiplayer supply chain game for keynotes and classrooms.

~150 players on their phones compete against **Durry**, an AI opponent, across three rounds of inventory ordering decisions. The game demonstrates the bullwhip effect, demand sensing, and — through a simulated SAP data corruption — why AI fails when data quality fails.

**Core message:** AI doesn't fail because of bad models. It fails because of bad data.

---

## Live demo

| URL | Purpose |
| --- | ------- |
| [durian-rush-kl.web.app](https://durian-rush-kl.web.app) | Single-player demo — no Firebase required |
| [/play](https://durian-rush-kl.web.app/play) | Player entry point (mobile) — try it on your phone |

---

## How the game works

### The supply chain

```text
🌾 Penang Farm  →  ⚙️ Ipoh Factory  →  🚛 Shah Alam Hub  →  🏪 KL Retailer
   (3 wk lead)        (2 wk lead)           (1 wk lead)        ← players
```

Players control the KL Retailer. Each week they see demand and choose an order quantity (A/B/C/D). Holding cost: $0.50/case/week. Stockout penalty: $3.00/case/week. Lowest total cost wins.

### Three rounds

| Round | Who plays | Data |
| ----- | --------- | ---- |
| **Round 1** | Humans — 10 weeks, 20 seconds per week | Real demand |
| **Round 2** | Durry (AI) — all 10 weeks in ~90 seconds | Clean data |
| **Round 3** | Durry (AI) — all 10 weeks in ~60 seconds | Corrupted SAP data |

Round 3 uses three injected data bugs: phantom inventory (+15 cases), stale demand (3 weeks old), and a lead time error (-1 week). Durry's cost explodes — often worse than every human in the room.

### The GIGO reveal

Between Round 2 and Round 3, the screen shows a simulated SAP data corruption alert. It's never announced in advance. The silence after Round 3's result is the moment the lesson lands.

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Firebase project with Realtime Database and Anonymous Auth enabled (both free)

### Option A — Deploy with Claude Code (recommended for educators)

If you have [Claude Code](https://claude.ai/code) installed, the fastest path is to paste the ready-made prompt from [docs/deploy-with-claude.md](docs/deploy-with-claude.md) into your terminal. Claude will guide you through Firebase setup, `.env` configuration, and deployment step by step — no prior Firebase experience needed. Estimated time: 20 minutes.

### Option B — Manual setup

See [docs/firebase-setup.md](docs/firebase-setup.md) for step-by-step Firebase setup without Claude.

```bash
git clone https://github.com/arnaud-6562/durian-rush.git
cd durian-rush
npm install
cp .env.example .env   # fill in your Firebase values
npm run build
firebase deploy --only hosting
```

Open `http://localhost:5173` locally or your Firebase Hosting URL for the live version.

---

## Running the game

See [docs/facilitator-guide.md](docs/facilitator-guide.md) for:

- **45-minute keynote format** — timing, what to say at each phase, emergency playbook
- **90-minute classroom format** — extended timer, debrief before Durry, discussion structure
- **Day-of setup checklist**

See [docs/debrief-guide.md](docs/debrief-guide.md) for discussion questions, learning outcomes, and academic references (Beer Game, bullwhip effect, GIGO).

---

## Localizing your scenario

The game is built around durian supply in west coast Malaysia, but the mechanics work for any product and region. All scenario-specific content lives in one file: [`src/config/scenario.js`](src/config/scenario.js).

To adapt the game:

1. **Change the supply chain** — edit `NODES` with your tier names, cities, and icons
2. **Change the demand curve** — edit `DEMAND` (10-week array, units/week)
3. **Change the disruption events** — edit `EVENTS` (week number → title, body, color)
4. **Change the cost structure** — edit `HOLD` (holding cost) and `BACK` (stockout penalty)
5. **Change the lead times** — edit `LEAD_TIMES` (one value per tier, weeks)
6. **Change the data bugs** — edit `SAP_BUGS` for different GIGO magnitudes
7. **Set your player URL** — set `VITE_PLAY_URL` in your `.env`
8. **Swap Durry assets** — replace `/public/durry_intro.mp4` and `/public/durry_*.jpg` with your own character

The TetriXX branding in the results screen is intentional — this game is a showcase of what data quality intelligence looks like in practice. You're welcome to replace it with your own institution's branding.

---

## Project structure

```text
src/
  config/
    scenario.js          — all game parameters (demand, events, costs, nodes)
  App.jsx                — router: /admin, /play, / (demo)
  AdminScreen.jsx        — projector view, 8 phases, presenter controls
  PlayerScreen.jsx       — mobile: register → OTP → play → watch → results
  GameEngine.js          — pure functions: AI logic, bullwhip, costs
  firebase.js            — Firebase init (reads from .env)
  components/
    DurryIntro.jsx       — boss reveal cinematic
    GigoReveal.jsx       — SAP corruption cinematic
    NodeCard.jsx         — per-tier inventory/cost card
    Leaderboard.jsx      — live ranked players
    BullwhipChart.jsx    — 4-tier inventory oscillation chart
    MalaysiaMap.jsx      — animated SVG supply chain map
docs/
  facilitator-guide.md   — how to run the game (keynote + classroom)
  debrief-guide.md       — discussion questions, learning outcomes
  firebase-setup.md      — Firebase project setup, step by step
```

---

## Tech stack

| Layer | Tech |
| ----- | ---- |
| Frontend | React 19 + Vite |
| Realtime | Firebase Realtime Database (Singapore region) |
| Auth | Firebase Auth — SMS OTP |
| Charts | Chart.js + react-chartjs-2 |
| Hosting | Firebase Hosting |

---

## Security

- Admin route (`/admin`) is PIN-gated
- Firebase database rules restrict writes to authenticated paths
- Player sessions validated against the database on load — prevents ghost players after reset
- SMS OTP via Firebase Auth — no custom auth server required

---

## License

MIT — free to use, adapt, and run in any academic or professional context.

---

## Built by

[TetriXX](https://tetrixx.ai) — Automating complexity, delivering clarity for a sustainable future.

Premiered at **CargoNOW 2026, Kuala Lumpur** on May 15th, 2026 with ~150 supply chain practitioners.

---

## Acknowledgements

Durian Rush was made possible by the support and patronage of:

**CargoNOW** — the platform that brought the game to its premiere audience in Kuala Lumpur.
[cargonow.world](https://cargonow.world/) · [LinkedIn](https://www.linkedin.com/company/cargonow-world/posts/?feedView=all)

**The Logistics & Supply Chain Management Society (LSCMS)** — for their patronage and commitment to advancing supply chain education.
[lscms.org](https://lscms.org/) · [LinkedIn](https://www.linkedin.com/company/logistics-&-supply-chain-management-society/)

**LogiSYM** — for their support in bringing this initiative to the supply chain community.
[logisym.org](https://logisym.org/)
