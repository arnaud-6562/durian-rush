# Durian Rush — Claude Code Brief

## What we're building
A live interactive supply chain game for a **45-minute keynote** at **CargoNOW 2026, Kuala Lumpur**.
~150 supply chain practitioners play on their phones against an AI opponent called **Durry**.
Goal: demonstrate that AI beats humans in supply chain decisions — and that data quality is everything.

Presenter: Arnaud (CEO, TetriXX) on stage with a laptop connected to a projector.
Admin URL on big screen. Player URL on phones via QR code.

---

## ══ SESSION TIMING — 45 MINUTES TOTAL ══

This is the master clock. Every UI decision must respect these constraints.

```
00:00 – 15:00  │ SLIDES        │ AI & Supply Chain — 15 min
15:00 – 20:00  │ LOBBY         │ Explain game + players log in via QR — 5 min MAX
20:00 – 25:00  │ ROUND 1       │ Humans play — 5 min MAX
25:00 – 30:00  │ ROUND 2 + 3   │ AI clean + AI dirty data — 5 min TOTAL
30:00 – 35:00  │ DEBRIEF       │ What matters — data strategy & governance — 5 min
35:00 – 45:00  │ Q&A           │ Questions and comments — 10 min
```

### Design constraints from timing

**LOBBY (5 min):**
- QR code must be giant and instant — no loading
- Registration must be under 15 seconds per player (nickname only)
- Admin shows live join counter — presenter narrates while people register
- Presenter can START as soon as enough players are in — doesn't need 100%

**ROUND 1 — HUMANS (5 min = 300 seconds for 10 weeks):**
- Max 25 seconds per week including narration and advance
- Order buttons must be 1-tap — no confirmation dialog
- Auto-lock after 20 seconds if presenter doesn't click (configurable)
- Week advance must be instant — no long animations between weeks
- Leaderboard updates must be fast — 1-2 seconds max

**ROUND 2 + 3 — AI (5 min TOTAL):**
- Durry intro cinematic: MAX 15 seconds (not 25) — keep it punchy
- Round 2 (clean data): AI runs all 10 weeks in ~90 seconds — presenter commentates 3-4 highlights
- GIGO reveal cinematic: MAX 10 seconds
- Round 3 (dirty data): AI runs all 10 weeks in ~60 seconds — show cost exploding
- Total: 15s intro + 90s clean + 10s GIGO + 60s dirty = ~3 min, leaves 2 min buffer

**DEBRIEF (5 min):**
- 3 slides worth of content — already prepared in the deck
- Results screen must be self-explanatory — no clicking through menus
- TetriXX CTA must be visible on screen during Q&A

---

## ══ LIVE EVENT SEQUENCE — PHASE BY PHASE ══

### PHASE 0 — SLIDES (00:00–15:00)
External PowerPoint/Keynote deck — not part of the app.
App is open on laptop at /admin but showing INTRO screen (Durry hero image).
Players not yet directed to the URL.

---

### PHASE 1 — LOBBY (15:00–20:00) — 5 min
**Presenter says:** "Take out your phone. Scan this QR code."

**Admin shows (big screen):**
- Giant QR code → your-project-id.web.app/play
- Live counter: "47 players joined" — updates every second
- Scrolling feed of player names joining
- Game rules summary (3 bullet points max — visible while people register)

**Player phone flow — must complete in under 15 seconds:**
1. Scan QR → land on /play
2. Type a nickname (single autofocused field) — nothing else is asked for
3. Tap JOIN (or hit Enter)
4. "[Nickname]! You're in. Watch the big screen."

**Admin controls:**
- See live count
- LOCK & START button (disables new registrations, starts Round 1)

**→ At ~19:30 presenter clicks LOCK & START → phase: "round1"**

---

### PHASE 2 — ROUND 1: HUMANS PLAY (20:00–25:00) — 5 min
**10 weeks × 25 seconds = ~4 min + 1 min results**

**Admin shows (big screen):**
- Week number (1–10) + progress dots
- THIS WEEK'S DEMAND — big number, visible from back of room
- Event card overlay at weeks 2, 3, 4, 6 (auto-appears, auto-dismisses after 5s)
- Live leaderboard — top 10 players + average cost
- AUTO-LOCK TIMER — 20-second countdown per week (configurable)
- ADVANCE WEEK button (or auto-advance when all players locked)

**Player phone (per week):**
1. See demand + event card if any
2. 4 big order buttons — tap once, locked
3. Brief result flash: "Week X cost: $Y"
4. Wait for next week

**Presenter narrates 2–3 key moments:**
- Week 4 JB surge: "Causeway weekend — distributor is rationing. What do you do?"
- Week 7–8: "The surge is over. But your orders haven't come back yet."

**After week 10 → auto-shows results:**
- Human average cost: big red number
- Bullwhip chart: 4-tier inventory oscillation (5 seconds, then moves on)
**→ phase: "durry_intro" (skip separate debrief — go straight to Durry)**

---

### PHASE 3 — DURRY INTRO (25:00–25:15) — 15 seconds MAX
**Full-screen cinematic — punchy, fast:**
1. Human cost in red (2s)
2. "A NEW CHALLENGER" + Durry slams in with sound (5s)
3. VS screen — THE CROWD vs DURRY (5s)
4. FIGHT button (presenter clicks immediately — 3s)

**→ Presenter clicks FIGHT → phase: "ai_running", aiMode: "clean"**

---

### PHASE 4 — ROUND 2: DURRY CLEAN DATA (25:15–26:45) — ~90 seconds
**AI runs all 10 weeks automatically — presenter commentates.**

**Admin shows:**
- 4 node cards updating week by week (auto-advances every 6 seconds)
- Durry's reasoning: "Smoothed: 8.2 → Order: 6 ✓" — one line per week
- Cost counter: ticking up slowly
- Final: side-by-side Human vs Durry cost — Durry wins

**Presenter hits 3 moments:**
1. Week 4 (JB surge): "He saw it. He smoothed it. Ordered 6 units. Not 22."
2. Week 8 (post-surge): "Inventory stable. No panic ordering."
3. Final score: "60% lower cost. Same chain. Same demand."

**→ Presenter clicks CORRUPT THE DATA → phase: "gigo_reveal"**

---

### PHASE 5 — GIGO REVEAL (26:45–26:55) — 10 seconds
**NEVER announced. Full-screen cinematic:**
1. Screen flickers — "⚠ SAP DATA CORRUPTION DETECTED" (2s)
2. Three bug cards slam in fast:
   - PHANTOM INVENTORY +10 units (2s)
   - LEAD TIME ERROR -1 week (2s)
   - STALE DEMAND 2 weeks old (2s)
3. Durry glitches + "GARBAGE IN — GARBAGE OUT" (2s)

**→ auto-transitions → phase: "ai_dirty", aiMode: "dirty"**

---

### PHASE 6 — ROUND 3: DURRY DIRTY DATA (26:55–28:00) — ~60 seconds
**AI runs all 10 weeks automatically — fast.**

**Admin shows:**
- Same cards with red scanline overlay
- SAP value ~~crossed out~~ vs actual value
- Costs climbing fast — passes human score
- Final 3-way podium: AI Clean 🥇 / Best Human 🥈 / AI Dirty 💀

**Presenter (10 seconds of silence first — let it land):**
"Same algorithm. Three wrong fields in SAP. Worse than any human in this room."
"An AI that is wrong confidently is more dangerous than a human who is uncertain."

**→ Presenter clicks → phase: "results"**

---

### PHASE 7 — RESULTS (28:00–30:00) — 2 min
**Admin shows (stays on screen through debrief and Q&A):**
- Podium: AI Clean / Best Human / AI Dirty
- Full leaderboard — all players with rank + score + badge
- Three Laws of AI in Supply Chain (visible, not narrated)
- TetriXX logo + contact — stays visible

**Players see:** Personal score, rank, badge, TetriXX CTA

---

### PHASE 8 — DEBRIEF (30:00–35:00) — 5 min (back to slides)
Back to PowerPoint. Results screen stays on screen or presenter toggles.
- Data quality is not an IT problem — it is a supply chain survival problem
- 95% of enterprise AI pilots fail — the gap is almost always data, not model
- What good data governance looks like in practice
- TetriXX positioning

---

### PHASE 9 — Q&A (35:00–45:00) — 10 min
Results screen stays on projector.
TetriXX contact visible.

---

## Admin phase sequence
```
intro → lobby → round1 → durry_intro → ai_running → gigo_reveal → ai_dirty → results
```
Note: No separate "debrief" phase between round1 and durry_intro — timing doesn't allow it.
The bullwhip chart appears inline at the end of round1 for ~5 seconds before auto-advancing.

## Player phone states
```
register → waiting → playing → watching
```
- `playing`: ONLY during round1 — shows order buttons + auto-lock timer
- `watching`: all other phases — shows phase content + Durry

---

## The game: Durian Rush

**Supply chain (west coast Malaysia):**
- 🌾 Penang Farm — Balik Pulau, Penang
- ⚙️ Ipoh Factory — Kinta Valley, Perak
- 🚛 Shah Alam Hub — Shah Alam, Selangor
- 🏪 KL Retailer — Bangsar, KL (audience plays this)

**Lead times:** Farm→Factory 3wk · Factory→Distributor 2wk · Distributor→Retailer 1wk
**Costs:** Holding $0.50/case/week · Stockout $3.00/case/week

**Demand curve:**
```
Week:   1  2  3  4   5   6  7  8  9  10
Demand: 4  4  4  6  12  18  8  4  4   4
```

**Events:**
```
Week 2: Penang monsoon alert (blue)
Week 3: JB Giant promo launches (amber)
Week 4: Causeway surge — distributor rationing, KL cut 35% (red)
Week 6: JB promo ends — bullwhip trap (green)
```

---

## Durry — the AI opponent
Boss character. Armored durian warrior. Gold armor, green AI-brain chest core, green lightning.
Tagline: *"Born in Penang. Built in Ipoh. Running your chain from Shah Alam."*
Assets: `public/durry_intro.mp4` · `public/durry_market.jpg` · `public/durry_command.jpg` · `public/durry_staredown.jpg`

## Core message
> AI doesn't fail because of bad models. It fails because of bad data. GIGO.

TetriXX: *"Automating complexity, delivering clarity for a sustainable future."*

---

## Tech stack
| Layer | Tech |
|-------|------|
| Frontend | React + Vite |
| Realtime | Firebase Realtime Database (Singapore) |
| Hosting | Firebase Hosting → your-project-id.web.app |
| Auth | None — nickname only, no sign-in |
| Deploy | GitHub Actions on push to main |

## Project structure
```
src/
  App.jsx              — router: /admin → AdminScreen, /play → PlayerScreen
  DurianRush.jsx       — single-player demo (all 3 rounds, no Firebase)
  firebase.js          — Firebase init, exports db
  AdminScreen.jsx      — big screen, 8 phases, presenter controls
  PlayerScreen.jsx     — mobile: register / waiting / playing / watching
  GameEngine.js        — pure functions: stepGame, aiOrder, costs (no React)
  components/
    DurryIntro.jsx     — boss reveal cinematic (15s max)
    GigoReveal.jsx     — SAP corruption cinematic (10s, auto-advances)
    NodeCard.jsx       — per-tier inventory/cost card
    AnimNum.jsx        — slot-machine number animation
    Countdown.jsx      — per-week timer (20s default, configurable)
    Leaderboard.jsx    — live ranked players
    BullwhipChart.jsx  — 4-tier inventory chart (shows 5s at end of round1)
    QRCode.jsx         — generates /play QR code
```

## Firebase schema
```
/game/
  phase: string
  locked: boolean
  currentWeek: 0–9
  aiMode: "clean" | "dirty"
  weekTimer: 20          ← seconds per week (admin configurable)

/players/{uid}/
  name                   ← nickname
  emoji                  ← randomly assigned
  run1: { orders:[], costs:[], total }
  bestCost: number
  joinedAt: timestamp

/ai/
  week: 0–9
  mode: "clean" | "dirty"
  tiers: { retailer, distributor, factory, farm }
  reasoning: { smoothed, safetyStock, order, note }
  totalCost: number
```

## AI engine
```javascript
smoothed    = 0.3 * demand + 0.7 * prevSmoothed
safetyStock = Math.round(smoothed * leadTime * 0.8)
order       = Math.max(0, safetyStock + Math.round(smoothed) - (inv - backlog + onOrder))
```
**Dirty bugs:** phantomStock +10 · leadTimeDelta -1 · demandLag 2 weeks

## Bullwhip engine (upstream tiers)
```javascript
order = Math.round(received * (1.4 + tierIdx * 0.2) + Math.max(0, 14 - inv) * 1.15)
```

---

## Status
- [x] DurianRush.jsx — single-player demo
- [x] DurryIntro.jsx — boss reveal component
- [x] Firebase project (durian-rush-kl, Singapore)
- [x] GitHub repo (arnaud-6562/durian-rush-kl)
- [x] GitHub Actions auto-deploy
- [x] CLAUDE.md

## Build order
1. [ ] GameEngine.js — pure logic, no React
2. [ ] AdminScreen.jsx — 8 phases, Firebase writes, timing controls
3. [ ] PlayerScreen.jsx — register/play/watch
4. [ ] App.jsx — React Router /admin /play
5. [ ] Firebase realtime wiring — onValue + set()
6. [ ] Security rules
7. [ ] Durry assets in /public
8. [ ] End-to-end rehearsal with real phones

## URLs
- Live: https://your-project-id.web.app
- Admin: https://your-project-id.web.app/admin
- Player: https://your-project-id.web.app/play
- GitHub: https://github.com/arnaud-6562/durian-rush-kl