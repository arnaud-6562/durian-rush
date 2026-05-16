# Durian Rush — Facilitator Debrief Guide

A practical guide for professors and facilitators running the Durian Rush supply chain game.

---

## What just happened

Players managed inventory for a KL durian retailer over 10 simulated weeks. Demand spiked mid-game (weeks 5–6) due to a Causeway promotion, then collapsed. Most human players over-ordered during the spike and were left holding excess stock when demand fell — the classic bullwhip pattern.

Then Durry, the AI opponent, ran the same game twice: once with clean data (won by roughly 60% lower cost), once with corrupted SAP data (lost — often finishing worse than the average human).

The three-round structure is designed to create a moment of surprise in round 3. Use that surprise as your entry point into the debrief.

---

## Timing

### 45-minute keynote format

The game itself runs 20–28 minutes. Debrief time is tight.

```
00:00 – 15:00  Slides / intro
15:00 – 20:00  Lobby — players register
20:00 – 25:00  Round 1 — humans play
25:00 – 28:00  Rounds 2 & 3 — Durry clean + dirty
28:00 – 30:00  Results on screen
30:00 – 35:00  Debrief (5 min) — pick ONE learning objective, max 2 questions
35:00 – 45:00  Q&A
```

In the keynote format, the results screen stays visible during debrief and Q&A. You do not need to narrate every finding. The podium (AI Clean / Best Human / AI Dirty) carries the argument. Use your five minutes to land the GIGO point and hand over to questions.

### 90-minute classroom format

Run the game in the first 30 minutes. Reserve the remaining time for structured debrief.

```
00:00 – 30:00  Game (lobby + 3 rounds)
30:00 – 45:00  Bullwhip debrief — what players did and why
45:00 – 60:00  AI and data quality debrief — what Durry's two runs reveal
60:00 – 75:00  Data governance discussion — who is responsible, what good looks like
75:00 – 90:00  Synthesis, three laws framework, closing
```

In the classroom format, use the discussion questions below across all four learning areas. Students who played feel the argument in their decisions — lean into that.

---

## Learning objective 1: The bullwhip effect

**What the game shows:** Each upstream tier (retailer → distributor → factory → farm) amplifies the demand signal. The KL retailer ordered 2–3x actual demand at the peak. The farm received orders that bore almost no resemblance to what consumers actually wanted.

**Academic connection:** Forrester (1958) first described supply chain oscillation. Sterman (1989) formalized it with the Beer Game, showing that rational individual decisions create irrational system behavior. Lee, Padmanabhan, and Whang (1997) identified four root causes: demand signal processing, rationing game, order batching, and price variation. Durian Rush isolates the first: players are given demand information but still over-react.

**Discussion questions:**

1. Look at your own orders across 10 weeks. At what week did you order the most? Why did it feel like the right decision at the time?
2. The demand signal peaked at week 6 (18 cases). What was the actual consumer demand at week 10? What does that gap tell you about how the signal travels upstream?
3. The distributor and factory in this game used a fixed amplification formula. In a real supply chain, what human behaviors produce the same effect without a formula?
4. If you had been able to see the farm's inventory in real time, would your decisions have changed? What information would have been most valuable?
5. Some players underordered consistently and still finished near the bottom. Why does both over-ordering and under-ordering hurt? What does that suggest about the cost structure of a supply chain?
6. The Beer Game has been played in classrooms for 35 years and players still over-order. What does that tell us about whether this is a knowledge problem or a system design problem?

---

## Learning objective 2: Demand sensing vs reactive ordering

**What the game shows:** Durry (with clean data) used exponential smoothing to dampen the demand signal, then added a safety stock buffer calibrated to lead time. When the week 6 spike hit, Durry ordered 6 units. Most humans ordered 18–22. At week 9, Durry's inventory was stable. Most humans were still digesting their overstock.

**What Durry does differently with clean data:**

- Smoothing: `0.3 × this_week_demand + 0.7 × previous_smoothed` — recent data counts, but doesn't override the trend.
- Safety stock: `smoothed × lead_time × 0.8` — buffer is proportional to lead time, not to peak demand.
- Order quantity: `safety_stock + smoothed_demand − (on_hand − backlog + on_order)` — accounts for what is already in transit, so Durry never double-orders.

The result is that Durry's order curve is nearly flat when consumer demand is volatile. That is counterintuitive. It is also why most human players lost.

**Discussion questions:**

1. Durry saw the same demand numbers you did. Why did it order less during the peak, not more?
2. What is the difference between responding to this week's demand and responding to the trend in demand? When does each approach fail?
3. Lead time in this game was 1 week (retailer to distributor). What happens to Durry's safety stock formula when lead time doubles? Triple? What does that suggest about the relationship between lead time reduction and AI performance?
4. Several players said they ordered more because they were afraid of stockouts. The stockout penalty in this game is $3/case/week versus $0.50 holding. Given those numbers, was fear of stockout mathematically justified? At what inventory level does it become justified?
5. If you had been shown Durry's order each week alongside your own, do you think you would have followed it? What would have stopped you?

---

## Learning objective 3: GIGO — AI fails because of bad data, not bad models

**What the game shows:** Round 3 uses the same algorithm as round 2. The only difference is three corrupted fields in the data:

- Phantom inventory: +10 cases added to on-hand stock (Durry thinks it has more than it does)
- Lead time error: -1 week (Durry believes supply arrives faster than it does)
- Stale demand: demand signal is 2 weeks old (Durry is reacting to history, not the present)

With these three errors, Durry's cost exceeded the human average. In most runs, Durry finishes last.

**Academic connection:** The GIGO principle (Garbage In, Garbage Out) predates modern AI — it was a critique of early computing in the 1960s. In the context of machine learning and AI planning systems, it describes a specific failure mode: the model is correct, the training is sound, the algorithm is well-designed — and the system still produces harmful output because the input data does not reflect reality. This is distinct from model failure, adversarial attack, or overfitting.

**Discussion questions:**

1. Before round 3, did you expect Durry to lose? What were you expecting? What does that expectation reveal about how we think about AI risk?
2. The three corrupted fields were small — a 10-unit phantom, a 1-week lead time error, 2-week-old demand. None of them looked like a catastrophic failure. Why did they compound into such a large cost difference?
3. In your organization, how confident are you that your inventory system reflects actual on-hand stock? What are three ways that confidence could be wrong?
4. Durry's algorithm was identical in rounds 2 and 3. What does that tell us about where AI accountability belongs — in the model, or in the data infrastructure around it?
5. If you were a supply chain director who saw Durry lose in round 3, what is the first question you would ask your IT team on Monday?
6. "An AI that is wrong confidently is more dangerous than a human who is uncertain." Do you agree? Under what conditions does human uncertainty become an advantage?

---

## Learning objective 4: Data governance as a supply chain survival issue

**What the game shows:** The GIGO reveal cinematic names three specific data errors and shows their source: SAP. This is deliberate. The three corrupted fields in round 3 are not exotic edge cases — phantom inventory, lead time misconfiguration, and stale demand are among the most common data quality failures in enterprise ERP systems.

**Discussion questions:**

1. Who in a typical organization is responsible for the accuracy of inventory data in the ERP? Who should be?
2. Data governance is often framed as a compliance or IT concern. After this game, how would you reframe it for a CFO or COO audience?
3. The three data errors in round 3 were not caused by hackers or system failures. They were caused by normal operational drift — a phantom entry, a misconfigured parameter, a stale feed. What organizational processes allow this drift to go undetected?
4. Durry's performance with clean data shows what is possible. What would need to change in your organization's data practices to reach that baseline?
5. If you had to design a "data quality SLA" for an AI planning system, what would you measure? How frequently? Who would own it?
6. Some organizations delay AI adoption because they know their data is poor. Others deploy AI anyway. What are the risks of each choice?

---

## The three laws of AI in supply chain

These are not citations — they are the three things Durian Rush demonstrates directly. Use them as a closing framework.

---

**Law 1: AI does not improve a broken process — it accelerates it.**

Durry with clean data was faster, cheaper, and more consistent than any human player. Durry with dirty data was faster, more expensive, and more consistent than any human player — including the worst ones. Speed and consistency are neutral. They amplify whatever the underlying data and process produce. Before deploying AI in a supply chain, the question is not "is the model good?" It is "is the process it will accelerate one you want to run faster?"

**Law 2: The gap between AI clean and AI dirty is your data quality score.**

In most Durian Rush runs, Durry clean finishes 50–65% cheaper than Durry dirty. That gap is not a game artifact — it is a measurement. In a real supply chain, the difference in planning outcomes between a system running on accurate data and the same system running on typical enterprise data quality is the cost of data neglect. You can now put a number on it.

**Law 3: Model failure and data failure look identical from the outside.**

When Durry loses in round 3, it does not look broken. It looks like a system making confident decisions that happen to be wrong. There is no error message. There is no alert. The algorithm runs cleanly. This is the dangerous case: not AI that visibly malfunctions, but AI that fails silently because the world it believes in no longer matches the world it is operating in. Detecting this requires data observability, not model monitoring.

---

## Academic connections — further reading

| Concept | Source |
|---------|--------|
| Bullwhip effect — four causes | Lee, H.L., Padmanabhan, V., Whang, S. (1997). "Information Distortion in a Supply Chain: The Bullwhip Effect." *Management Science*, 43(4), 546–558. |
| Beer Game — rational agents, irrational systems | Sterman, J.D. (1989). "Modeling Managerial Behavior: Misperceptions of Feedback in a Dynamic Decision Making Experiment." *Management Science*, 35(3), 321–339. |
| System dynamics and supply chains | Forrester, J.W. (1958). "Industrial Dynamics — A Major Breakthrough for Decision Makers." *Harvard Business Review*, 36(4), 37–66. |
| Exponential smoothing for demand sensing | Holt, C.C. (1957). "Forecasting Seasonals and Trends by Exponentially Weighted Moving Averages." *ONR Research Memorandum* 52. (Reprinted in *International Journal of Forecasting*, 2004.) |
| AI and data quality in operations | This is an emerging research area. Durian Rush is designed to make the mechanism teachable before the literature catches up. |

---

## Game design notes for facilitators

**On the GIGO reveal:** Do not announce it. Do not preview it. The cinematic is designed to be a surprise. If students or participants know it is coming, the emotional impact — and the learning — is diminished. The moment of "wait, Durry lost?" is the learning. Protect it.

**On player scores:** Individual scores vary widely. Some players finish with costs 3–4x the average due to consistent stockouts or over-ordering. This is useful data for the debrief, not a source of embarrassment. Frame it as "your decisions produced this result — let's understand why" rather than ranking individuals.

**On Durry losing:** Some audiences expect the AI to win in round 3 because "AI always wins." Others expect it to lose because they distrust AI. Both reactions are worth unpacking. The correct answer is that neither the model nor the audience's expectations determine the outcome — the data does.

**On the 45-minute format:** If you only have five minutes for debrief, use the three laws as a verbal handout. State them once, briefly. The audience will remember the structure better than an open discussion they did not have time to complete.

---

## If this sparked further questions

Durian Rush was built by [TetriXX](https://tetrixx.ai), an AI-native freight intelligence company based in Singapore. The game demonstrates in 28 minutes what TetriXX sees in real-world freight audit data every day: the gap between what an ERP reports and what is actually happening is where cost leaks, AI failures, and procurement risk live.

If your organization processes freight invoices and you want to see what GIGO looks like in a live P&L, TetriXX's FCPI product (Freight Cost Performance Intelligence) is at [fcpi.tetrixx.ai](https://fcpi.tetrixx.ai).

Durian Rush is open source. The game engine, Firebase schema, and all components are available at [github.com/arnaud-6562/durian-rush-kl](https://github.com/arnaud-6562/durian-rush-kl). Adapt it, run it, break it, and send us what you learn.

---

*Durian Rush — CargoNOW 2025, Kuala Lumpur. Built by TetriXX.*
