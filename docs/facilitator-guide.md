# Durian Rush — Facilitator Guide

This guide is for whoever runs the game in front of an audience.
Two formats are covered: a **45-minute keynote session** and a **90-minute classroom session**.

---

## Before you start — what you need

| Item | Notes |
|------|-------|
| Laptop (presenter) | Connected to projector — open `/admin` full-screen |
| Phones (audience) | Their own devices — Android or iOS, any browser |
| Stable Wi-Fi | Firebase Realtime Database requires a live connection |
| Admin PIN | Default is `demo1234` — change `VITE_ADMIN_PIN` in `.env` before a real session |
| Admin URL | Keep it private — share only with the presenter |

**Test 24 hours before:** do a full end-to-end rehearsal with 2–3 phones. Open `/play`, enter a name and email, tap JOIN — verify the player appears in the lobby counter.

---

## Format A — 45-minute keynote

This is the format used at CargoNOW 2025 (KL). Time is tight — follow the clock.

### Master clock

| Time | Phase | What happens |
|------|-------|-------------|
| 00:00 – 15:00 | Slides | Your intro deck — AI & Supply Chain |
| 15:00 – 20:00 | Lobby | Players scan QR, register, watch the counter fill |
| 20:00 – 25:00 | Round 1 | Humans play 10 weeks |
| 25:00 – 25:15 | Durry intro | Boss reveal cinematic — 15 seconds |
| 25:15 – 26:45 | Round 2 | Durry plays with clean data — ~90 seconds |
| 26:45 – 26:55 | GIGO reveal | SAP corruption cinematic — 10 seconds |
| 26:55 – 28:00 | Round 3 | Durry plays with dirty data — ~60 seconds |
| 28:00 – 30:00 | Results | 3-way podium on screen |
| 30:00 – 35:00 | Debrief | Back to slides |
| 35:00 – 45:00 | Q&A | Results screen stays visible on projector |

---

### Phase by phase — what to do and say

#### LOBBY (15:00 – 20:00)

**Admin action:** Navigate to `/admin` → click **LOBBY**.

**Screen shows:** Giant QR code, live join counter, scrolling player names, game rules.

**Say:**
> "Take out your phone. Open your camera and scan this QR code."
> *(pause 20 seconds)*
> "You'll be asked for your name and email. Tap JOIN — you're in instantly, no code needed."

**While people register, narrate the counter:**
> "We've got 23 in... 41... keep going."

**Rules to verbally confirm before starting:**
- You are the KL retailer — you order durian cans each week
- You see demand. You choose how many to order: A, B, C, or D
- You have 20 seconds per week — then it locks
- Lowest cost wins

**Trigger:** When enough players are in (aim for 70–80% of the room), click **LOCK & START**.
You do not need 100%. Starting with 50 out of 80 is fine.

---

#### ROUND 1 — HUMANS (20:00 – 25:00)

**Admin action:** Click LOCK & START → game moves to `round1`.

**Screen shows:** Week number, demand, event cards, live leaderboard, 20-second countdown.

**Each week:**
1. Demand appears — big number, visible from the back
2. Event card auto-shows (weeks 2, 3, 4, 6) for 5 seconds
3. Players tap A/B/C/D on their phones — locked after 20 seconds
4. Leaderboard updates
5. You click **NEXT WEEK** (or it auto-advances)

**Key moments to narrate:**

| Week | What to say |
|------|------------|
| Week 2 | "Weather alert — Penang farms slowing down. Does that change your order?" |
| Week 3 | "JB Giant promo launching. Cross-border demand is picking up." |
| Week 4 | "Causeway surge. Shah Alam is rationing your allocation to 65%. What do you do?" |
| Week 6 | "Promo's over. Demand is normalising. But your orders from the last three weeks are still in transit…" |

**After week 10:** The bullwhip chart appears automatically for 5 seconds, then the screen advances. No action needed.

---

#### DURRY INTRO (25:00 – 25:15) — 15 seconds

**Admin action:** None — auto-plays after round 1.

**Screen shows:** Human average cost in red → "A NEW CHALLENGER" → Durry slams in → VS screen.

**Say nothing.** Let the cinematic land. Click **FIGHT** immediately when it appears.

---

#### ROUND 2 — DURRY CLEAN DATA (25:15 – 26:45)

**Admin action:** Click FIGHT → Durry runs all 10 weeks automatically.

**Screen shows:** 4 supply chain nodes updating week by week, Durry's reasoning per week, cost counter.

**Narrate 3 moments:**

| Week | What to say |
|------|------------|
| Week 4 | "See that? He saw the Causeway surge coming. Ordered 6 units — not 22. Demand sensing." |
| Week 8 | "Inventory stable. No panic ordering. The bullwhip is flat." |
| Final score | "60% lower cost. Same supply chain. Same demand. Different data quality." |

**When Durry's round ends:** Results appear showing Human avg vs Durry. Click **CORRUPT THE DATA**.

---

#### GIGO REVEAL (26:45 – 26:55) — 10 seconds

**Admin action:** Click CORRUPT THE DATA → auto-plays.

**Screen shows:** Screen flickers → SAP corruption alert → 3 bug cards → Durry glitches → GARBAGE IN — GARBAGE OUT.

**Say nothing.** This is designed to be a gut-punch. Silence works.

---

#### ROUND 3 — DURRY DIRTY DATA (26:55 – 28:00)

**Admin action:** Auto-starts after GIGO reveal.

**Screen shows:** Same nodes, red scanline overlay, SAP values crossed out, costs climbing fast.

**Wait 10 seconds in silence** after Round 3 ends — let the final score land.

**Then say:**
> "Same algorithm. Three wrong fields in SAP. Worse than any human in this room."

*(pause)*

> "An AI that is wrong confidently is more dangerous than a human who is uncertain."

---

#### RESULTS (28:00 – 30:00)

**Admin action:** Click → moves to `results` phase.

**Screen shows:** 3-way podium (AI Clean / Best Human / AI Dirty), full leaderboard, Three Laws of AI in Supply Chain.

**Leave results visible** on the projector through the entire debrief and Q&A. Players see their personal score and rank on their phones.

---

### If something goes wrong — keynote emergency playbook

| Problem | Fix |
|---------|-----|
| Player stuck on JOIN button | Ask them to refresh and try again — no SMS needed, just name + email |
| Leaderboard stuck | Refresh admin tab — Firebase reconnects automatically |
| Week timer auto-locked too fast | Adjust **weekTimer** in admin controls before next week |
| Player dropped mid-game | Their last order stands — no action needed |
| Firebase quota hit | Switch to demo mode (`/`) and narrate manually |
| Projector goes black | Results are still live at `/admin` — reconnect and navigate to results |

---

## Format B — 90-minute classroom session

Designed for professors running this as a teaching exercise. More time for discussion and debrief.

### Suggested timing

| Time | Activity |
|------|---------|
| 00:00 – 10:00 | Intro — beer game context, supply chain fundamentals |
| 10:00 – 20:00 | Lobby + registration |
| 20:00 – 35:00 | Round 1 — humans play (extend to 30 seconds/week) |
| 35:00 – 45:00 | **First debrief** — discuss bullwhip before revealing Durry |
| 45:00 – 55:00 | Rounds 2 + 3 — Durry clean and dirty |
| 55:00 – 75:00 | **Main debrief** — see debrief guide |
| 75:00 – 90:00 | Student presentations / group discussion |

### Adjusting the timer for a classroom

Change `weekTimer` to 30 seconds in `/admin` controls — gives students more time to think and discuss with neighbours.

### First debrief (35:00 – 45:00) — before Durry

Ask these before showing the AI rounds. The goal is to surface the bullwhip pattern the students just created.

1. "Who ordered more than 10 cases in weeks 4 or 5? Keep your hand up."
2. "Who dropped back to under 5 by week 8?"
3. "What caused that oscillation? Was it the demand — or was it you?"
4. "How would a supplier upstream from you have experienced your orders?"

Display the bullwhip chart (visible at end of round 1) during this discussion.

### Extending the scenario

The game config in `src/config/scenario.js` lets you adjust:
- **Demand curve** — flatten it to remove the surge, or add a second spike
- **Lead times** — increase them to make bullwhip worse
- **Event cards** — replace Causeway / JB promo with scenarios relevant to your students
- **Costs** — change holding vs stockout ratio to explore different risk profiles

All these values are in `src/config/scenario.js` — each one is commented with what to change.

---

## Setup checklist — day of

```
□ Firebase project live and database rules deployed
□ Admin PIN working — test login at /admin (set VITE_ADMIN_PIN in .env before your session)
□ Anonymous join test — open /play on your phone, enter name + email, verify you appear in the lobby
□ .env configured — VITE_PLAY_URL matches your deployment
□ QR code tested — scan it yourself, complete registration
□ Projector connected — /admin full screen, browser zoom at 100%
□ Week timer configured — 20s for keynote, 30s for classroom
□ 2-3 test players in lobby — verify counter updates
□ Reset the game — Admin → RESET before going live
```

---

## Learning outcomes

After running this session, participants should be able to:

1. Explain the **bullwhip effect** and how it emerges from individually rational ordering decisions
2. Describe why **demand sensing** and **pipeline visibility** reduce supply chain cost
3. Articulate the **GIGO principle** — that model quality is irrelevant if input data is corrupted
4. Identify at least two **data quality failure modes** common in enterprise ERP systems
5. Distinguish between **AI model failure** and **data governance failure**

See `docs/debrief-guide.md` for discussion questions mapped to each outcome.

---

## About TetriXX

Durian Rush was created by **TetriXX** — an AI-native intelligence company for transport & logistics spend.

| | |
| --- | --- |
| Company | [tetrixx.ai](https://tetrixx.ai) |
| Freight Cost & Performance Intelligence | [fcpi.tetrixx.ai](https://fcpi.tetrixx.ai) |

If this game sparked questions about how AI and data quality play out in real supply chain operations — that's exactly what we work on. Reach out.

---

## Acknowledgements

Durian Rush premiered at CargoNOW 2026, Kuala Lumpur, with the support and patronage of:

- **CargoNOW** — [cargonow.world](https://cargonow.world/) · [LinkedIn](https://www.linkedin.com/company/cargonow-world/posts/?feedView=all)
- **The Logistics & Supply Chain Management Society (LSCMS)** — [lscms.org](https://lscms.org/) · [LinkedIn](https://www.linkedin.com/company/logistics-&-supply-chain-management-society/)
- **LogiSYM** — [logisym.org](https://logisym.org/)
