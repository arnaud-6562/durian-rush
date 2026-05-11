import { useState, useCallback, useEffect, useRef } from "react";
import { ref, set, update, onValue } from "firebase/database";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { db, auth } from "./firebase";
import {
  NODES, DEMAND, N_WEEKS, EVENTS,
  HOLD, BACK,
  stepGame, newGame, chainCost, retailerCost,
} from "./GameEngine";
import DurryIntro from "./components/DurryIntro";
import MalaysiaMap from "./components/MalaysiaMap";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

// ══ PHASE SEQUENCE ══════════════════════════════════════════════
const PHASES = ["intro","lobby","round1","round1_results","durry_intro","ai_running","ai_clean_results","gigo_reveal","ai_dirty","ai_dirty_results","results","ended"];
const ROUND_DURATION = 5 * 60 * 1000; // 5 minutes total for round 1

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL || "admin@durianrush.app";

function writePhase(phase) { set(ref(db, "game/phase"), phase); }
function writeWeek(week) { set(ref(db, "game/currentWeek"), week); }
function writeDeadline(ts) { set(ref(db, "game/weekDeadline"), ts); }

// ══ PLAYER COST CALC ════════════════════════════════════════════
function playerCost(decisions) {
  if (!decisions) return 0;
  let inv = 12, backlog = 0, cost = 0, pipeline = [4];
  for (let w = 0; w < N_WEEKS; w++) {
    const d = decisions[`week${w}`];
    const order = d ? d.quantity : 0;
    inv += pipeline[0] || 0;
    pipeline.shift();
    const demand = DEMAND[w];
    const due = demand + backlog;
    const ship = Math.min(due, inv);
    inv -= ship;
    backlog = Math.max(0, due - ship);
    pipeline.push(order);
    cost += inv * HOLD + backlog * BACK;
  }
  return cost;
}

function buildLeaderboard(playersData) {
  if (!playersData) return [];
  return Object.entries(playersData)
    .map(([uid, p]) => {
      const dec = p.decisions || {};
      const cw = p.currentWeek ?? 0;
      return {
        uid,
        name: p.name || "???",
        emoji: p.emoji || "👤",
        cost: playerCost(dec),
        currentWeek: cw,
        done: cw >= N_WEEKS,
      };
    })
    .sort((a, b) => {
      // Done players first, then by furthest week, then by cost
      if (b.done !== a.done) return b.done ? 1 : -1;
      if (b.currentWeek !== a.currentWeek) return b.currentWeek - a.currentWeek;
      return a.cost - b.cost;
    });
}

// ══ COUNTDOWN HOOK ══════════════════════════════════════════════
function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!deadline) { setRemaining(0); return; }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}

function formatTime(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ══ SUB-COMPONENTS ══════════════════════════════════════════════

function CostMeter({ cost, color = "#F59E0B", label = "CHAIN COST" }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#555", letterSpacing: 3, fontFamily: "monospace", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: "clamp(28px, 6vw, 52px)", fontWeight: 900,
        color, fontFamily: "monospace", lineHeight: 1,
        textShadow: `0 0 30px ${color}55`,
      }}>
        ${cost.toFixed(0)}
      </div>
    </div>
  );
}

function RoundBadge({ round, color }) {
  return (
    <div style={{
      display: "inline-block",
      background: `${color}22`, border: `2px solid ${color}`,
      color, borderRadius: 40, padding: "4px 18px",
      fontFamily: "monospace", fontSize: 11, fontWeight: 900,
      letterSpacing: 2, textTransform: "uppercase",
    }}>
      {round}
    </div>
  );
}

function WeekTrack({ week }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {DEMAND.map((d, i) => (
        <div key={i} style={{
          width: 28, height: 28, borderRadius: "50%",
          background: i < week ? "#F59E0B" : i === week ? "#fff" : "#1a1a1a",
          border: i === week ? "3px solid #F59E0B" : "2px solid #333",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 900,
          color: i < week ? "#000" : i === week ? "#F59E0B" : "#333",
          transition: "all 0.3s",
          boxShadow: i === week ? "0 0 12px #F59E0B66" : "none",
        }}>
          {i + 1}
        </div>
      ))}
    </div>
  );
}

function TierCard({ tier, node, showAI, dirty }) {
  const col = node.color;
  const r   = tier.aiReasoning;
  const pct = Math.max(0, Math.min(100, (tier.inventory / 20) * 100));
  return (
    <div style={{
      background: "#0a0a0a", border: `1px solid ${col}33`,
      borderRadius: 12, padding: 14, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: col, borderRadius: "12px 0 0 12px" }} />
      <div style={{ paddingLeft: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: col, letterSpacing: 1 }}>{node.emoji} {node.name}</div>
            <div style={{ fontSize: 10, color: "#444" }}>{node.city}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#555" }}>COST</div>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "#888" }}>${tier.totalCost.toFixed(0)}</div>
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#555", marginBottom: 3 }}>
            <span>STOCK</span>
            <span style={{ color: tier.inventory > 0 ? "#fff" : "#EF4444", fontWeight: 900 }}>{tier.inventory} cases</span>
          </div>
          <div style={{ height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: tier.inventory === 0 ? "#EF4444" : tier.inventory < 4 ? "#F59E0B" : col,
              transition: "width 0.4s ease", borderRadius: 3,
            }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tier.backlog > 0 && <span style={{ background: "#EF44441a", border: "1px solid #EF444433", color: "#EF4444", borderRadius: 4, padding: "2px 7px", fontSize: 10 }}>⚠ {tier.backlog} BACKLOG</span>}
          {tier._order > 0 && <span style={{ background: `${col}11`, border: `1px solid ${col}33`, color: col, borderRadius: 4, padding: "2px 7px", fontSize: 10 }}>📦 ORDER: {tier._order}</span>}
          {tier.pipeline.length > 0 && <span style={{ color: "#444", fontSize: 10 }}>🚚 {tier.pipeline.join("→")} in transit</span>}
        </div>
        {showAI && r && (
          <div style={{ marginTop: 10, background: "#050505", border: `1px solid ${dirty ? "#EF444422" : "#10B98122"}`, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ fontFamily: "monospace", fontSize: 8, color: dirty ? "#EF4444" : "#10B981", marginBottom: 4 }}>{dirty ? "⚠ AI (DIRTY DATA)" : "✦ AI REASONING"}</div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", lineHeight: 1.8 }}>
              <span style={{ color: "#333" }}>EMA: </span>{r.smooth} &nbsp;
              <span style={{ color: "#333" }}>SAFETY: </span>{r.safety} &nbsp;
              <span style={{ color: "#333" }}>ORDER: </span>
              <span style={{ color: dirty ? "#EF4444" : "#10B981", fontWeight: 900 }}>{r.order}</span>
            </div>
            {dirty && r.dirty && (
              <div style={{ marginTop: 4, borderTop: "1px solid #EF444422", paddingTop: 4 }}>
                {r.dirty.invNote && <div style={{ fontSize: 8, color: "#EF4444", lineHeight: 1.7 }}>⚠ {r.dirty.invNote}</div>}
                {r.dirty.ltNote  && <div style={{ fontSize: 8, color: "#EF4444", lineHeight: 1.7 }}>⚠ {r.dirty.ltNote}</div>}
                {r.dirty.demNote && <div style={{ fontSize: 8, color: "#EF4444", lineHeight: 1.7 }}>⚠ {r.dirty.demNote}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══ LOBBY SLIDES — auto-advancing educational deck ══════════════
const LOBBY_SLIDES = [
  {
    icon: "🎮",
    title: "DURIAN RUSH",
    body: "You are the Bangsar KL retailer.\nYour job: order the right amount of\nDurian Rush cans each week.\n\nToo much = wasted stock.\nToo little = lost sales.\nFind the balance.",
  },
  {
    icon: "🔗",
    title: "THE MALAYSIAN SUPPLY CHAIN",
    map: true,
    body: "Every order takes 2-4 weeks to arrive.",
  },
  {
    icon: "📱",
    title: "ON YOUR PHONE",
    body: "Each week you choose:\nA — LEAN: match demand exactly\nB — SAFE: small buffer\nC — BIG: summer is coming lah!\nD — MIN: ultra lean mode\n\nYou have 5 minutes total.\nLowest total cost wins. 🏆",
  },
  {
    icon: "⚡",
    title: "MEET DURRY",
    image: "durry",
    body: "An AI trained on perfect\nsupply chain data.\n\nAfter you play Round 1...\nDurry plays the same chain.\nCan you beat an AI?",
    badge: { text: "ROUND 2 COMING", color: "#F59E0B" },
  },
  {
    icon: "⚠️",
    title: "BUT WHAT IF THE DATA IS WRONG?",
    image: "glitch",
    body: "95% of AI pilots fail.\nNot because of bad models.\nBecause of bad data.\n\nRound 3 will show you why.",
    badge: { text: "GIGO INCOMING", color: "#EF4444" },
  },
];

function LobbySlides() {
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % LOBBY_SLIDES.length);
        setFade(true);
      }, 300);
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  const slide = LOBBY_SLIDES[idx];

  return (
    <div style={{
      background: "#0a0a0aee", border: "1px solid #222",
      borderRadius: 16, padding: "32px 28px", width: "100%",
      maxWidth: 460, minHeight: 420,
      display: "flex", flexDirection: "column", alignItems: "center",
      textAlign: "center", position: "relative",
      transition: "opacity 0.3s ease",
      opacity: fade ? 1 : 0,
    }}>
      {/* Icon or image */}
      {slide.image === "durry" && (
        <img src="/durry.jpg" alt="Durry" style={{ width: 100, height: 100, objectFit: "contain", marginBottom: 12 }} />
      )}
      {slide.image === "glitch" && (
        <img src="/durry.jpg" alt="Glitch" style={{
          width: 100, height: 100, objectFit: "contain", marginBottom: 12,
          filter: "hue-rotate(120deg) saturate(300%) brightness(0.8)",
        }} />
      )}
      {!slide.image && (
        <div style={{ fontSize: 56, marginBottom: 12, lineHeight: 1 }}>{slide.icon}</div>
      )}

      {/* Title */}
      <div style={{
        fontFamily: "monospace", fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 900,
        background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        letterSpacing: 2, marginBottom: 16, lineHeight: 1.2,
      }}>
        {slide.title}
      </div>

      {/* Animated Malaysia map (slide 2) */}
      {slide.map && (
        <div style={{ width: "100%", marginBottom: 8 }}>
          <MalaysiaMap height={280} />
        </div>
      )}

      {/* Body */}
      <div style={{
        fontFamily: "monospace", fontSize: "clamp(14px, 2vw, 17px)", color: "#bbb",
        lineHeight: 1.8, whiteSpace: "pre-line", flex: 1,
      }}>
        {slide.body}
      </div>

      {/* Badge */}
      {slide.badge && (
        <div style={{
          marginTop: 16,
          background: `${slide.badge.color}22`, border: `1px solid ${slide.badge.color}66`,
          color: slide.badge.color, borderRadius: 20, padding: "5px 16px",
          fontFamily: "monospace", fontSize: 11, fontWeight: 900, letterSpacing: 2,
        }}>
          {slide.badge.text}
        </div>
      )}

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {LOBBY_SLIDES.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 24 : 8, height: 8, borderRadius: 4,
            background: i === idx ? "#F59E0B" : "#333",
            transition: "all 0.3s ease",
          }} />
        ))}
      </div>
    </div>
  );
}

// ══ ADMIN SCREEN — PROJECTOR GAME SHOW ══════════════════════════
export default function AdminScreen() {
  // ── Admin auth gate ──
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminChecking, setAdminChecking] = useState(true);
  const [adminPin, setAdminPin] = useState("");
  const [adminError, setAdminError] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);

  // Auto-restore admin session on mount
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.email === ADMIN_EMAIL) {
        setAdminAuthed(true);
      }
      setAdminChecking(false);
    });
    return unsub;
  }, []);

  const handleAdminLogin = async () => {
    if (!adminPin) { setAdminError("Enter PIN"); return; }
    setAdminLoading(true);
    setAdminError(null);
    try {
      await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPin);
      setAdminAuthed(true);
    } catch {
      setAdminError("Wrong PIN");
    } finally {
      setAdminLoading(false);
    }
  };

  // ── Game state ──
  const [phase, setPhaseLocal] = useState("intro");
  const [deadline, setDeadline] = useState(null);
  const [aiGoodGame, setAiGoodGame] = useState(null);
  const [aiDirtyGame, setAiDirtyGame] = useState(null);
  const [savedGood, setSavedGood] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [playersData, setPlayersData] = useState(null);
  const [prevWeeks, setPrevWeeks] = useState({}); // track week changes for flash
  const [flashUids, setFlashUids] = useState(new Set());
  const [joinFeed, setJoinFeed] = useState([]); // recent player joins for lobby
  const aiTimer = useRef(null);
  const forceEndedRef = useRef(false);

  const remaining = useCountdown(deadline);

  const setPhase = useCallback((p) => {
    console.log("PHASE TRANSITION →", p);
    setPhaseLocal(p);
    writePhase(p);
  }, []);

  // Listen for players
  useEffect(() => {
    const unsub = onValue(ref(db, "players"), (snap) => {
      const val = snap.val();
      setPlayersData(val);
      setPlayerCount(val ? Object.keys(val).length : 0);
    });
    return unsub;
  }, []);

  // Track new player joins for lobby feed
  const prevPlayerUids = useRef(new Set());
  useEffect(() => {
    if (!playersData) return;
    const currentUids = new Set(Object.keys(playersData));
    const newJoins = [];
    for (const uid of currentUids) {
      if (!prevPlayerUids.current.has(uid)) {
        const p = playersData[uid];
        const phone = p.phone || "";
        const masked = phone.length > 4
          ? phone.slice(0, phone.length - 4).replace(/./g, "•") + phone.slice(-4)
          : phone;
        newJoins.push({ uid, emoji: p.emoji || "👤", name: p.name || "???", phone: masked, ts: Date.now() });
      }
    }
    if (newJoins.length > 0) {
      setJoinFeed(prev => [...newJoins, ...prev].slice(0, 20));
    }
    prevPlayerUids.current = currentUids;
  }, [playersData]);

  // Flash green when a player advances a week
  useEffect(() => {
    if (!playersData) return;
    const newFlash = new Set();
    for (const [uid, p] of Object.entries(playersData)) {
      const cw = p.currentWeek ?? 0;
      const prev = prevWeeks[uid] ?? 0;
      if (cw > prev) newFlash.add(uid);
    }
    if (newFlash.size > 0) {
      setFlashUids(newFlash);
      setTimeout(() => setFlashUids(new Set()), 1200);
    }
    const snap = {};
    for (const [uid, p] of Object.entries(playersData)) snap[uid] = p.currentWeek ?? 0;
    setPrevWeeks(snap);
  }, [playersData]);

  // Start round timer (single timer for entire round)
  const startRoundTimer = useCallback(() => {
    const dl = Date.now() + ROUND_DURATION;
    setDeadline(dl);
    writeDeadline(dl);
    forceEndedRef.current = false;
    set(ref(db, "game/forceEnded"), false);
  }, []);

  const addTime = (ms) => {
    const newDl = (deadline || Date.now()) + ms;
    setDeadline(newDl);
    writeDeadline(newDl);
  };

  // Force-end: auto-submit LEAN for all unfinished players, then advance to durry_intro
  const forceEndRound = useCallback(async () => {
    if (forceEndedRef.current) return;
    forceEndedRef.current = true;
    // Signal players to stop
    await set(ref(db, "game/forceEnded"), true);
    await set(ref(db, "game/roundActive"), false);
    // Auto-fill LEAN for every missing week on every player
    if (playersData) {
      const updates = {};
      for (const [uid, p] of Object.entries(playersData)) {
        const cw = p.currentWeek ?? 0;
        for (let w = cw; w < N_WEEKS; w++) {
          if (!p.decisions?.[`week${w}`]) {
            const demand = DEMAND[w];
            updates[`players/${uid}/decisions/week${w}`] = {
              choice: "A", quantity: demand, timestamp: Date.now(), auto: true,
            };
          }
        }
        if (cw < N_WEEKS) {
          updates[`players/${uid}/currentWeek`] = N_WEEKS;
        }
      }
      // Write all auto-fills
      for (const [path, val] of Object.entries(updates)) {
        await set(ref(db, path), val);
      }
    }
    setDeadline(null);
    writeDeadline(null);
    setPhase("round1_results");
  }, [playersData, setPhase]);

  const reset = () => {
    if (!window.confirm("This will delete all player data. Are you sure?")) return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    set(ref(db, "players"), null);
    set(ref(db, "ai"), null);
    set(ref(db, "game"), { phase: "intro", currentWeek: 0, locked: false, forceEnded: false, roundActive: false, weekDeadline: null, resetAt: Date.now() });
    setPhaseLocal("intro");
    setDeadline(null);
    setAiGoodGame(null);
    setAiDirtyGame(null);
    setSavedGood(null);
    setShowAI(false);
    setAiRunning(false);
    setPlayerCount(0);
    setPlayersData(null);
    setJoinFeed([]);
    prevPlayerUids.current = new Set();
    setPrevWeeks({});
    setFlashUids(new Set());
    forceEndedRef.current = false;
  };

  const cleanSnaps = useRef([]);
  const dirtySnaps = useRef([]);

  const startAIGood = () => {
    setAiRunning(true);
    cleanSnaps.current = [];
    let g = newGame();
    let w = 0;
    const tick = () => {
      if (w >= N_WEEKS) {
        setAiGoodGame(g); setSavedGood(g); setAiRunning(false);
        set(ref(db, "game/aiCleanCost"), retailerCost(g));
        // 2-second pause before showing results
        aiTimer.current = setTimeout(() => setPhase("ai_clean_results"), 2000);
        return;
      }
      g = stepGame(g, 0, "ai_clean");
      cleanSnaps.current.push({
        week: w + 1, demand: DEMAND[w],
        order: g.tiers[0]._order, inventory: g.tiers[0].inventory,
        backlog: g.tiers[0].backlog, cost: retailerCost(g),
        reasoning: g.tiers[0].aiReasoning,
      });
      setAiGoodGame({...g});
      w++;
      aiTimer.current = setTimeout(tick, 400);
    };
    tick();
  };

  const startAIDirty = () => {
    setAiRunning(true);
    dirtySnaps.current = [];
    let g = newGame();
    let w = 0;
    const tick = () => {
      if (w >= N_WEEKS) {
        setAiDirtyGame(g); setAiRunning(false);
        set(ref(db, "game/aiDirtyCost"), retailerCost(g));
        // 2-second pause before showing results
        aiTimer.current = setTimeout(() => setPhase("ai_dirty_results"), 2000);
        return;
      }
      g = stepGame(g, 0, "ai_dirty");
      dirtySnaps.current.push({
        week: w + 1, demand: DEMAND[w],
        order: g.tiers[0]._order, inventory: g.tiers[0].inventory,
        backlog: g.tiers[0].backlog, cost: retailerCost(g),
        reasoning: g.tiers[0].aiReasoning,
      });
      setAiDirtyGame({...g});
      w++;
      aiTimer.current = setTimeout(tick, 400);
    };
    tick();
  };

  const aiGoodDone = aiGoodGame && aiGoodGame.week >= N_WEEKS;
  const dirtyDone  = aiDirtyGame && aiDirtyGame.week >= N_WEEKS;

  // Self-paced stats
  const playersFinished = playersData
    ? Object.values(playersData).filter(p => (p.currentWeek ?? 0) >= N_WEEKS).length
    : 0;

  const avgPlayerCost = playersData
    ? (() => {
        const entries = Object.values(playersData);
        if (entries.length === 0) return 0;
        return entries.reduce((sum, p) => sum + playerCost(p.decisions), 0) / entries.length;
      })()
    : 0;

  const allDone = playersFinished >= playerCount && playerCount > 0;
  const timerRed = remaining > 0 && remaining < 30_000;
  const timerWarn = remaining > 0 && remaining < 60_000;

  // Auto-force-end when timer expires.
  // Use a ref for forceEndRound so the effect only re-runs on phase/deadline changes.
  const forceEndRef = useRef(forceEndRound);
  forceEndRef.current = forceEndRound;

  useEffect(() => {
    if (phase !== "round1") return;
    if (!deadline) return;
    if (forceEndedRef.current) return;
    const ms = deadline - Date.now();
    console.log("FORCE END scheduled for:", new Date(deadline).toLocaleTimeString(), "that is", Math.round(ms / 1000), "seconds from now");
    if (ms <= 0) {
      // Deadline already in the past — do NOT auto-force, this is stale data
      console.warn("STALE DEADLINE detected, ignoring. deadline:", deadline, "now:", Date.now());
      return;
    }
    const id = setTimeout(() => {
      if (!forceEndedRef.current) forceEndRef.current();
    }, ms);
    return () => clearTimeout(id);
  }, [phase, deadline]);

  // ── Admin PIN gate ───────────────────────────────────────────
  if (adminChecking) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: "monospace", fontSize: 14, color: "#555" }}>Loading…</div>
      </div>
    );
  }

  if (!adminAuthed) {
    return (
      <div style={{
        minHeight: "100vh", background: "#050505", color: "#fff",
        fontFamily: "system-ui, sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
        <h1 style={{
          fontSize: 36, fontWeight: 900, margin: "0 0 8px",
          background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          ADMIN ACCESS
        </h1>
        <p style={{ fontFamily: "monospace", fontSize: 14, color: "#555", letterSpacing: 2, marginBottom: 32 }}>
          DURIAN RUSH CONTROL PANEL
        </p>
        <div style={{ maxWidth: 320, width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="password"
            placeholder="Enter PIN"
            value={adminPin}
            onChange={e => setAdminPin(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
            autoFocus
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 10, padding: "16px", fontSize: 24, color: "#fff",
              fontFamily: "monospace", textAlign: "center", letterSpacing: 8,
              outline: "none", width: "100%", boxSizing: "border-box",
            }}
          />
          {adminError && (
            <div style={{ color: "#EF4444", fontSize: 13, fontFamily: "monospace", textAlign: "center" }}>
              {adminError}
            </div>
          )}
          <button
            onClick={handleAdminLogin}
            disabled={adminLoading}
            style={{
              background: "linear-gradient(135deg, #F59E0B, #D97706)",
              color: "#000", border: "none", borderRadius: 12,
              padding: "14px", fontSize: 16, fontWeight: 900,
              cursor: "pointer", fontFamily: "monospace", letterSpacing: 2,
              opacity: adminLoading ? 0.5 : 1, width: "100%",
            }}
          >
            {adminLoading ? "VERIFYING…" : "🔓 UNLOCK"}
          </button>
        </div>
      </div>
    );
  }

  // ── Phase bar ─────────────────────────────────────────────────
  const PhaseBar = () => (
    <div style={{
      background: "#0a0a0a", borderBottom: "1px solid #222",
      padding: "6px 16px", display: "flex", gap: 6, alignItems: "center",
      overflowX: "auto", fontSize: 9, fontFamily: "monospace",
    }}>
      {PHASES.map(p => (
        <span key={p} style={{
          padding: "3px 10px", borderRadius: 4,
          background: p === phase ? "#F59E0B" : "#111",
          color: p === phase ? "#000" : "#444",
          fontWeight: p === phase ? 900 : 400,
          whiteSpace: "nowrap",
        }}>
          {p.toUpperCase()}
        </span>
      ))}
      <span style={{ marginLeft: "auto", color: "#555", marginRight: 8 }}>
        👥 {playerCount}
      </span>
      <button onClick={reset} style={{
        background: "#1a0000", border: "1px solid #EF444433", color: "#EF4444",
        borderRadius: 4, padding: "2px 8px", cursor: "pointer",
        fontFamily: "monospace", fontSize: 8, fontWeight: 700, letterSpacing: 1,
        flexShrink: 0,
      }}>
        ↺ RESET
      </button>
    </div>
  );

  // ── INTRO — dramatic welcome with Durry vs Glitch ─────────────
  if (phase === "intro") {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <PhaseBar />
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "90vh",
          padding: "24px 24px 40px", textAlign: "center",
        }}>
          {/* Title block */}
          <h1 style={{
            fontSize: "clamp(52px, 12vw, 80px)", fontWeight: 900, margin: "0 0 6px",
            background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            lineHeight: 0.95, letterSpacing: -2,
          }}>
            DURIAN RUSH
          </h1>
          <div style={{ fontFamily: "monospace", fontSize: 24, color: "#fff", letterSpacing: 3, margin: "8px 0 6px", fontWeight: 700 }}>
            THE SUPPLY CHAIN CHALLENGE
          </div>
          <div style={{
            background: "#F59E0B22", border: "1px solid #F59E0B66",
            color: "#F59E0B", borderRadius: 30, padding: "5px 18px",
            fontFamily: "monospace", fontSize: 11, letterSpacing: 3, marginBottom: 36,
            textTransform: "uppercase",
          }}>
            CARGONOW 2025 · KUALA LUMPUR
          </div>

          {/* Character cards */}
          <div style={{ display: "flex", gap: 32, justifyContent: "center", flexWrap: "wrap", marginBottom: 36 }}>
            {/* DURRY — clean AI */}
            <div style={{
              background: "#0a0a0a", border: "2px solid #F59E0B66",
              borderRadius: 16, padding: "24px 28px", width: 240,
              textAlign: "center", position: "relative",
            }}>
              <img src="/durry.jpg" alt="Durry" style={{ width: 150, height: 150, objectFit: "contain", marginBottom: 12 }} />
              <div style={{
                fontSize: 28, fontWeight: 900, letterSpacing: 4,
                background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                marginBottom: 4,
              }}>
                DURRY
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#888", letterSpacing: 2, marginBottom: 12 }}>
                THE AI
              </div>
              <div style={{
                background: "#10B98122", border: "1px solid #10B98166", color: "#10B981",
                borderRadius: 20, padding: "4px 14px", display: "inline-block",
                fontFamily: "monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2,
              }}>
                CLEAN DATA MODE
              </div>
            </div>

            {/* GLITCH — corrupted AI */}
            <div style={{
              background: "#0a0a0a", border: "2px solid #EF444466",
              borderRadius: 16, padding: "24px 28px", width: 240,
              textAlign: "center", position: "relative",
              opacity: 0.7,
            }}>
              <img
                src="/durry.jpg" alt="Glitch"
                style={{
                  width: 150, height: 150, objectFit: "contain", marginBottom: 12,
                  filter: "hue-rotate(120deg) saturate(200%)",
                }}
              />
              <div style={{
                fontSize: 28, fontWeight: 900, letterSpacing: 4,
                color: "#EF4444", marginBottom: 4,
              }}>
                GLITCH
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 13, color: "#888", letterSpacing: 2, marginBottom: 12 }}>
                THE AI
              </div>
              <div style={{
                background: "#EF444422", border: "1px solid #EF444466", color: "#EF4444",
                borderRadius: 20, padding: "4px 14px", display: "inline-block",
                fontFamily: "monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2,
              }}>
                CORRUPTED DATA MODE
              </div>
            </div>
          </div>

          {/* Open lobby button */}
          <button onClick={() => setPhase("lobby")} style={{
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: "#000", border: "none", borderRadius: 14,
            padding: "18px 48px", fontSize: 20, fontWeight: 900,
            cursor: "pointer", letterSpacing: 3, fontFamily: "monospace",
            boxShadow: "0 0 40px #F59E0B44, 0 4px 20px #00000088",
          }}>
            OPEN LOBBY →
          </button>
          <div style={{ marginTop: 12, color: "#333", fontSize: 11, fontFamily: "monospace" }}>Presenter control</div>
        </div>
      </div>
    );
  }

  // ── LOBBY — QR left + educational slides right ─────────────────
  if (phase === "lobby") {
    const PLAY_URL = "https://play.tetrixx.app/play";
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(PLAY_URL)}&color=D97706&bgcolor=000000&format=png`;
    return (
      <div style={{
        minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif",
        backgroundImage: "url(/can1.jpg)", backgroundSize: "cover", backgroundPosition: "center",
        position: "relative",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>
          <PhaseBar />
          <div style={{
            flex: 1, display: "flex", gap: 0, alignItems: "stretch",
            padding: "0", overflow: "hidden",
          }}>
            {/* ── LEFT 60%: QR + counter ─────────────────── */}
            <div style={{
              width: "60%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: "24px 32px", textAlign: "center",
            }}>
              <div style={{
                fontFamily: "monospace", fontSize: 18, color: "#F59E0B", letterSpacing: 6,
                fontWeight: 700, marginBottom: 20, textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}>
                SCAN QR CODE TO JOIN
              </div>
              <div style={{
                background: "#000", padding: 16, borderRadius: 16, marginBottom: 16,
                border: "3px solid #F59E0B66", boxShadow: "0 0 40px #F59E0B22",
              }}>
                <img src={qrSrc} alt="QR Code" style={{ width: 280, height: 280, display: "block", borderRadius: 8 }} />
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 15, color: "#F59E0B", letterSpacing: 2,
                marginBottom: 24, fontWeight: 700, textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              }}>
                play.tetrixx.app/play
              </div>
              <div style={{
                fontSize: "clamp(56px, 14vw, 100px)", fontWeight: 900,
                color: "#10B981", fontFamily: "monospace", lineHeight: 1,
                textShadow: "0 0 40px #10B98144",
              }}>
                {playerCount}
              </div>
              <div style={{
                fontFamily: "monospace", fontSize: 15, color: "#aaa", letterSpacing: 4, marginBottom: 12, fontWeight: 700,
              }}>
                PLAYERS JOINED
              </div>

              {/* Live join feed */}
              {joinFeed.length > 0 && (
                <div style={{
                  width: "100%", maxWidth: 340, maxHeight: 140, overflow: "hidden",
                  marginBottom: 16, display: "flex", flexDirection: "column", gap: 4,
                }}>
                  {joinFeed.slice(0, 6).map((j, i) => {
                    const ago = Math.max(0, Math.round((Date.now() - j.ts) / 1000));
                    const agoStr = ago < 5 ? "just now" : ago < 60 ? `${ago}s ago` : `${Math.floor(ago / 60)}m ago`;
                    return (
                      <div key={j.uid} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "4px 10px", borderRadius: 8,
                        background: "rgba(16,185,129,0.08)",
                        border: i === 0 ? "1px solid #10B98133" : "1px solid transparent",
                        animation: i === 0 ? "slideIn 0.4s ease-out" : "none",
                        opacity: 1 - i * 0.12,
                      }}>
                        <span style={{ fontSize: 18 }}>{j.emoji}</span>
                        <span style={{
                          flex: 1, fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                          color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {j.name}
                        </span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>{j.phone}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#10B981" }}>{agoStr}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <button onClick={() => {
                // Reset all player game state before starting
                if (playersData) {
                  const resets = {};
                  Object.keys(playersData).forEach(uid => {
                    resets[`players/${uid}/currentWeek`] = 0;
                    resets[`players/${uid}/done`] = false;
                    resets[`players/${uid}/decisions`] = null;
                    resets[`players/${uid}/totalCost`] = 0;
                  });
                  update(ref(db), resets);
                }
                set(ref(db, "game/locked"), true);
                set(ref(db, "game/roundActive"), true);
                set(ref(db, "game/forceEnded"), false);
                startRoundTimer();
                setPhase("round1");
              }} style={{
                background: "linear-gradient(135deg, #10B981, #059669)",
                color: "#000", border: "none", borderRadius: 14,
                padding: "16px 40px", fontSize: 18, fontWeight: 900,
                cursor: "pointer", letterSpacing: 3, fontFamily: "monospace",
                boxShadow: "0 0 30px #10B98144",
              }}>
                LOCK & START ROUND 1
              </button>
            </div>

            {/* ── RIGHT 40%: Auto-advancing slides ───────── */}
            <div style={{
              width: "40%", display: "flex", alignItems: "center", justifyContent: "center",
              padding: "24px 24px 24px 0",
            }}>
              <LobbySlides />
            </div>
          </div>
        </div>
        <style>{`@keyframes slideIn{0%{transform:translateY(-20px);opacity:0}100%{transform:translateY(0);opacity:1}}`}</style>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ── ROUND 1: SELF-PACED RACE ─────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  if (phase === "round1") {
    const lb = buildLeaderboard(playersData);

    return (
      <div style={{
        minHeight: "100vh", background: "#050505", color: "#fff",
        fontFamily: "system-ui, sans-serif",
        display: "flex", flexDirection: "column",
      }}>
        {/* ── TOP BAR ─────────────────────────────────────────── */}
        <div style={{
          background: "#0a0a0a", borderBottom: "2px solid #F59E0B33",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Left: Round info */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              background: "#F59E0B", color: "#000", borderRadius: 8,
              padding: "6px 16px", fontFamily: "monospace", fontWeight: 900,
              fontSize: "clamp(16px, 3vw, 24px)", letterSpacing: 2,
            }}>
              ROUND 1
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 13, color: "#888" }}>
              SELF-PACED · 10 WEEKS
            </div>
          </div>

          {/* Center: Timer */}
          <div style={{
            fontFamily: "monospace", fontWeight: 900,
            fontSize: "clamp(32px, 5vw, 56px)",
            color: timerRed ? "#EF4444" : timerWarn ? "#F59E0B" : "#fff",
            textShadow: timerRed ? "0 0 20px #EF4444" : timerWarn ? "0 0 20px #F59E0B66" : "none",
            letterSpacing: 4,
            animation: timerRed ? "blink 0.5s infinite" : "none",
          }}>
            {remaining > 0 ? formatTime(remaining) : "0:00"}
          </div>

          {/* Right: Finished count */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#888", fontWeight: 900 }}>
              👥 {playerCount} players
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 16, fontWeight: 900,
              color: allDone ? "#10B981" : "#F59E0B",
              marginTop: 2,
            }}>
              🏁 {playersFinished}/{playerCount} finished {allDone ? "✓" : ""}
            </div>
          </div>
        </div>

        {/* ── MAIN: LEADERBOARD ───────────────────────────────── */}
        <div style={{ flex: 1, padding: "16px 24px", overflow: "auto" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            {/* Column headers */}
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 12px", marginBottom: 4,
              fontFamily: "monospace", fontSize: 10, color: "#555",
              letterSpacing: 2, textTransform: "uppercase",
            }}>
              <div style={{ width: 40 }}>RANK</div>
              <div style={{ width: 36 }}></div>
              <div style={{ flex: 1 }}>PLAYER</div>
              <div style={{ width: 120, textAlign: "center" }}>PROGRESS</div>
              <div style={{ width: 90, textAlign: "right" }}>COST</div>
            </div>

            {lb.map((p, idx) => {
              const isFlashing = flashUids.has(p.uid);
              const isTop3 = idx < 3;
              const rankColors = ["#F59E0B", "#C0C0C0", "#CD7F32"];
              const rankIcons = ["🥇", "🥈", "🥉"];
              const pct = Math.round((p.currentWeek / N_WEEKS) * 100);

              return (
                <div key={p.uid} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 3,
                  background: isFlashing ? "#10B98122"
                    : isTop3 ? `${rankColors[idx]}0a` : "transparent",
                  borderLeft: isTop3 ? `4px solid ${rankColors[idx]}` : "4px solid transparent",
                  transition: "background 0.3s",
                  animation: isFlashing ? "flashGreen 1.2s ease-out" : "none",
                }}>
                  {/* Rank */}
                  <div style={{
                    fontFamily: "monospace", fontSize: isTop3 ? 22 : 16,
                    fontWeight: 900, width: 40, textAlign: "center",
                    color: isTop3 ? rankColors[idx] : "#444",
                  }}>
                    {isTop3 ? rankIcons[idx] : `${idx + 1}`}
                  </div>

                  {/* Emoji */}
                  <div style={{ fontSize: 28, width: 36, textAlign: "center" }}>
                    {p.emoji}
                  </div>

                  {/* Name */}
                  <div style={{
                    flex: 1, fontWeight: 700,
                    fontSize: isTop3 ? 18 : 15,
                    color: isTop3 ? "#fff" : "#bbb",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.name}
                  </div>

                  {/* Progress bar + week */}
                  <div style={{ width: 120, textAlign: "center" }}>
                    {p.done ? (
                      <span style={{
                        background: "#10B98122", border: "1px solid #10B98144",
                        color: "#10B981", borderRadius: 6, padding: "3px 12px",
                        fontFamily: "monospace", fontWeight: 900, fontSize: 12,
                      }}>
                        ✓ DONE
                      </span>
                    ) : (
                      <div>
                        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#888", marginBottom: 3 }}>
                          Week {p.currentWeek + 1}/{N_WEEKS}
                        </div>
                        <div style={{ height: 4, background: "#1a1a1a", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{
                            width: `${pct}%`, height: "100%",
                            background: pct > 60 ? "#10B981" : "#F59E0B",
                            transition: "width 0.3s",
                          }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cost */}
                  <div style={{
                    width: 90, textAlign: "right",
                    fontFamily: "monospace", fontWeight: 900,
                    fontSize: isTop3 ? 18 : 15,
                    color: isTop3 ? rankColors[idx] : "#666",
                  }}>
                    ${p.cost.toFixed(0)}
                  </div>
                </div>
              );
            })}

            {lb.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: "#333", fontFamily: "monospace" }}>
                Waiting for players…
              </div>
            )}
          </div>
        </div>

        {/* ── BOTTOM BAR ──────────────────────────────────────── */}
        <div style={{
          background: "#0a0a0a", borderTop: "2px solid #F59E0B22",
          padding: "10px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* Demand curve */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555" }}>DEMAND CURVE:</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 28 }}>
              {DEMAND.map((d, i) => (
                <div key={i} style={{
                  width: 14,
                  background: "#F59E0B",
                  opacity: 0.3 + (d / 18) * 0.7,
                  height: `${(d / 18) * 100}%`, borderRadius: "2px 2px 0 0", minHeight: 3,
                  display: "flex", alignItems: "flex-end", justifyContent: "center",
                }}>
                  <span style={{ fontSize: 7, color: "#000", fontWeight: 900 }}>{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Admin controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => addTime(60_000)} style={{
              background: "#111", border: "1px solid #333", color: "#888",
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontFamily: "monospace", fontSize: 11, fontWeight: 700,
            }}>
              +1 MIN
            </button>
            <button onClick={forceEndRound} style={{
              background: allDone ? "linear-gradient(135deg, #F59E0B, #D97706)" : "#1a1a1a",
              border: allDone ? "2px solid #F59E0B" : "2px solid #333",
              color: allDone ? "#000" : "#666",
              borderRadius: 8, padding: "8px 20px", cursor: "pointer",
              fontFamily: "monospace", fontSize: 12, fontWeight: 900, letterSpacing: 1,
              boxShadow: allDone ? "0 0 20px #F59E0B44" : "none",
              transition: "all 0.3s",
            }}>
              {allDone ? "🏁 ALL DONE → ROUND 2" : "⏭ FORCE END ROUND 1"}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes flashGreen {
            0% { background: #10B98144; }
            100% { background: transparent; }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.3; }
          }
        `}</style>
      </div>
    );
  }

  // ── ROUND 1 RESULTS — locked leaderboard ──────────────────────
  if (phase === "round1_results") {
    const lb = buildLeaderboard(playersData);

    return (
      <div style={{
        minHeight: "100vh", background: "#050505", color: "#fff",
        fontFamily: "system-ui, sans-serif",
        display: "flex", flexDirection: "column",
      }}>
        {/* Top bar */}
        <div style={{
          background: "#0a0a0a", borderBottom: "2px solid #10B98133",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              background: "#10B981", color: "#000", borderRadius: 8,
              padding: "6px 16px", fontFamily: "monospace", fontWeight: 900,
              fontSize: "clamp(16px, 3vw, 24px)", letterSpacing: 2,
            }}>
              ROUND 1 RESULTS
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#10B981", fontWeight: 900 }}>
              🏁 {playerCount} players · AVG ${avgPlayerCost.toFixed(0)}
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{ flex: 1, padding: "16px 24px", overflow: "auto" }}>
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "8px 12px", marginBottom: 4,
              fontFamily: "monospace", fontSize: 10, color: "#555",
              letterSpacing: 2, textTransform: "uppercase",
            }}>
              <div style={{ width: 40 }}>RANK</div>
              <div style={{ width: 36 }}></div>
              <div style={{ flex: 1 }}>PLAYER</div>
              <div style={{ width: 100, textAlign: "center" }}>WEEKS</div>
              <div style={{ width: 90, textAlign: "right" }}>TOTAL COST</div>
            </div>

            {lb.map((p, idx) => {
              const isTop3 = idx < 3;
              const rankColors = ["#F59E0B", "#C0C0C0", "#CD7F32"];
              const rankIcons = ["🥇", "🥈", "🥉"];
              return (
                <div key={p.uid} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 10, marginBottom: 3,
                  background: isTop3 ? `${rankColors[idx]}0a` : "transparent",
                  borderLeft: isTop3 ? `4px solid ${rankColors[idx]}` : "4px solid transparent",
                }}>
                  <div style={{
                    fontFamily: "monospace", fontSize: isTop3 ? 22 : 16,
                    fontWeight: 900, width: 40, textAlign: "center",
                    color: isTop3 ? rankColors[idx] : "#444",
                  }}>
                    {isTop3 ? rankIcons[idx] : `${idx + 1}`}
                  </div>
                  <div style={{ fontSize: 28, width: 36, textAlign: "center" }}>{p.emoji}</div>
                  <div style={{
                    flex: 1, fontWeight: 700,
                    fontSize: isTop3 ? 18 : 15,
                    color: isTop3 ? "#fff" : "#bbb",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {p.name}
                  </div>
                  <div style={{ width: 100, textAlign: "center" }}>
                    {p.done ? (
                      <span style={{
                        background: "#10B98122", border: "1px solid #10B98144",
                        color: "#10B981", borderRadius: 6, padding: "3px 12px",
                        fontFamily: "monospace", fontWeight: 900, fontSize: 12,
                      }}>✓ DONE</span>
                    ) : (
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "#888" }}>
                        {p.currentWeek}/{N_WEEKS}
                      </span>
                    )}
                  </div>
                  <div style={{
                    width: 90, textAlign: "right",
                    fontFamily: "monospace", fontWeight: 900,
                    fontSize: isTop3 ? 18 : 15,
                    color: isTop3 ? rankColors[idx] : "#666",
                  }}>
                    ${p.cost.toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div style={{
          background: "#0a0a0a", borderTop: "2px solid #10B98122",
          padding: "12px 24px", textAlign: "center",
        }}>
          <button onClick={() => setPhase("durry_intro")} style={{
            background: "linear-gradient(135deg, #F59E0B, #D97706)",
            color: "#000", border: "none", borderRadius: 14,
            padding: "16px 48px", fontSize: 18, fontWeight: 900,
            cursor: "pointer", letterSpacing: 3, fontFamily: "monospace",
            boxShadow: "0 0 30px #F59E0B44",
          }}>
            MEET DURRY →
          </button>
        </div>
      </div>
    );
  }

  // ── DURRY INTRO — cinematic boss reveal ────────────────────────
  if (phase === "durry_intro") {
    return (
      <DurryIntro
        humanCost={Math.round(avgPlayerCost)}
        onComplete={() => {
          set(ref(db, "game/avgHumanCost"), avgPlayerCost);
          setAiGoodGame(newGame());
          setPhase("ai_running");
          startAIGood();
        }}
      />
    );
  }

  // ── AI RUNNING (CLEAN) — Fast playback ─────────────────────────
  if (phase === "ai_running") {
    const AG = aiGoodGame ?? newGame();
    const snaps = cleanSnaps.current;
    const currentSnap = snaps.length > 0 ? snaps[snaps.length - 1] : null;

    return (
        <div style={{
          minHeight: "100vh", background: "#050505", color: "#fff",
          fontFamily: "system-ui, sans-serif",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center" }}>
            <RoundBadge round="ROUND 2 · DURRY · CLEAN DATA" color="#10B981" />
          </div>
          <img src="/durry.jpg" alt="Durry" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 16, opacity: 0.8 }} />
          <div style={{
            fontFamily: "monospace", fontSize: "clamp(80px, 20vw, 160px)", fontWeight: 900,
            color: "#F59E0B", lineHeight: 1, textShadow: "0 0 60px #F59E0B44",
            animation: "weekPulse 0.4s ease-out",
          }}>
            W{AG.week}
          </div>
          {currentSnap && (
            <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>ORDERED</div>
                <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#10B981" }}>{currentSnap.order}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>DEMAND</div>
                <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#888" }}>{currentSnap.demand}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>COST</div>
                <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#F59E0B" }}>${currentSnap.cost}</div>
              </div>
            </div>
          )}
          {/* Running total bottom-right */}
          <div style={{
            position: "absolute", bottom: 24, right: 32,
            fontFamily: "monospace", textAlign: "right",
          }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2 }}>TOTAL COST</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#F59E0B", textShadow: "0 0 20px #F59E0B33" }}>
              ${retailerCost(AG)}
            </div>
          </div>
          <style>{`@keyframes weekPulse{0%{transform:scale(1.3);opacity:0}100%{transform:scale(1);opacity:1}}`}</style>
        </div>
      );
  }

  // ── AI CLEAN RESULTS — Strategy chart ─────────────────────────
  if (phase === "ai_clean_results") {
    const AG = aiGoodGame ?? newGame();
    const snaps = cleanSnaps.current;

    const cleanWhys = [
      "Pipeline full — draining buffer",
      "Stable signal, coast on stock",
      "Stock lean — match demand exactly",
      "Spike ahead — demand sensing kicks in",
      "Peak demand — full coverage ordered",
      "Past peak — controlled scale down",
      "Demand normalizing — lean orders",
      "Steady state — match baseline",
      "Baseline demand — stay the course",
      "Final week — lean finish",
    ];

    const chartData = {
      labels: snaps.map(s => `W${s.week}`),
      datasets: [
        {
          label: "Durry's Order",
          data: snaps.map(s => s.order),
          backgroundColor: "#F59E0B",
          borderRadius: 4,
          barPercentage: 0.4,
          categoryPercentage: 0.8,
          order: 2,
        },
        {
          label: "Actual Demand",
          data: snaps.map(s => s.demand),
          backgroundColor: "#333",
          borderRadius: 4,
          barPercentage: 0.4,
          categoryPercentage: 0.8,
          order: 3,
        },
        {
          type: "line",
          label: "Inventory",
          data: snaps.map(s => s.inventory),
          borderColor: "#10B981",
          backgroundColor: "#10B98133",
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#10B981",
          tension: 0.3,
          fill: true,
          order: 1,
        },
      ],
    };

    const chartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#888", font: { family: "monospace", size: 11 } } },
        title: { display: false },
      },
      scales: {
        x: { ticks: { color: "#888", font: { family: "monospace" } }, grid: { color: "#1a1a1a" } },
        y: { ticks: { color: "#888", font: { family: "monospace" } }, grid: { color: "#1a1a1a" }, beginAtZero: true },
      },
    };

    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <PhaseBar />
        <div style={{ padding: "16px 24px", maxWidth: 1000, margin: "0 auto" }}>
          {/* Header with Durry + total */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img src="/durry.jpg" alt="Durry" style={{ width: 60, height: 60, objectFit: "contain" }} />
              <div>
                <RoundBadge round="ROUND 2 · DURRY" color="#10B981" />
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", marginTop: 4 }}>CLEAN DATA · ALL 10 WEEKS</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>DURRY TOTAL</div>
              <div style={{
                fontFamily: "monospace", fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 900,
                color: "#F59E0B", lineHeight: 1, textShadow: "0 0 30px #F59E0B55",
              }}>
                ${retailerCost(AG)}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div style={{
            background: "#0a0a0a", border: "1px solid #222", borderRadius: 12,
            padding: 16, marginBottom: 16, height: 260,
          }}>
            <Bar data={chartData} options={chartOpts} />
          </div>

          {/* Week-by-week logic table */}
          <div style={{
            background: "#0a0a0a", border: "1px solid #222", borderRadius: 12,
            padding: "12px 16px", marginBottom: 16, overflowX: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  {["Week", "Demand", "Durry Ordered", "Why"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: "#555", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snaps.map((s, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #111" }}>
                    <td style={{ padding: "6px", color: "#888" }}>{s.week}</td>
                    <td style={{ padding: "6px", color: "#666" }}>{s.demand}</td>
                    <td style={{ padding: "6px", color: "#F59E0B", fontWeight: 900 }}>{s.order}</td>
                    <td style={{ padding: "6px", color: "#10B981", fontSize: 11 }}>{cleanWhys[i] ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Durry quote */}
          <div style={{
            background: "#10B98108", border: "1px solid #10B98122", borderRadius: 12,
            padding: "20px 24px", marginBottom: 20, textAlign: "center",
          }}>
            <img src="/durry.jpg" alt="Durry" style={{ width: 48, height: 48, objectFit: "contain", marginBottom: 8, opacity: 0.7 }} />
            <div style={{
              fontFamily: "monospace", fontSize: 15, color: "#10B981",
              lineHeight: 2, fontWeight: 700, fontStyle: "italic",
            }}>
              "I read the demand signal 2 weeks ahead.<br />
              You reacted. I anticipated.<br />
              Clean data makes the difference."
            </div>
          </div>

          {/* Comparison + Next button */}
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 20, flexWrap: "wrap" }}>
            <CostMeter cost={avgPlayerCost} color="#EF4444" label="HUMAN AVG" />
            <CostMeter cost={retailerCost(AG)} color="#10B981" label="DURRY" />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontFamily: "monospace", marginBottom: 2 }}>SAVINGS</div>
              <div style={{ fontSize: "clamp(28px,5vw,44px)", fontWeight: 900, color: "#10B981", fontFamily: "monospace" }}>
                {avgPlayerCost > 0 ? (((avgPlayerCost - retailerCost(AG)) / avgPlayerCost) * 100).toFixed(0) : 0}%
              </div>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <button onClick={() => setPhase("gigo_reveal")} style={{
              background: "linear-gradient(135deg, #EF4444, #B91C1C)", color: "#fff", border: "none", borderRadius: 14,
              padding: "18px 48px", fontSize: 18, fontWeight: 900, cursor: "pointer", letterSpacing: 3, fontFamily: "monospace",
              boxShadow: "0 0 30px #EF444444",
            }}>
              NOW MEET GLITCH →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── GIGO REVEAL ────────────────────────────────────────────────
  if (phase === "gigo_reveal") {
    return (
      <div style={{
        minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "32px 20px", textAlign: "center", position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", width: 400, height: 400, background: "#EF444422", borderRadius: "50%", filter: "blur(80px)", top: "20%", left: "50%", transform: "translateX(-50%)" }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 580 }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>☠️</div>
          <div style={{ fontFamily: "monospace", fontSize: 11, color: "#EF4444", letterSpacing: 4, marginBottom: 16 }}>
            ⚠ SAP DATA CORRUPTION DETECTED
          </div>
          <h2 style={{ fontSize: "clamp(28px, 7vw, 60px)", fontWeight: 900, color: "#fff", lineHeight: 1.1, margin: "0 0 20px" }}>
            GARBAGE IN — GARBAGE OUT
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 32 }}>
            {[
              { icon: "👻", col: "#EF4444", title: "PHANTOM INVENTORY", detail: "+15 units in SAP" },
              { icon: "🌉", col: "#F59E0B", title: "WRONG LEAD TIME", detail: "-1 week in master data" },
              { icon: "⏳", col: "#888",    title: "STALE DEMAND DATA", detail: "3 weeks delayed" },
            ].map(bug => (
              <div key={bug.title} style={{
                background: `${bug.col}11`, border: `1px solid ${bug.col}33`, borderRadius: 12, padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 14, textAlign: "left",
              }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{bug.icon}</div>
                <div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: bug.col, fontWeight: 900 }}>{bug.title}</div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>{bug.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { setAiDirtyGame(newGame()); setPhase("ai_dirty"); startAIDirty(); }} style={{
            background: "linear-gradient(135deg, #EF4444, #991B1B)", color: "#fff", border: "none", borderRadius: 14,
            padding: "18px 40px", fontSize: 16, fontWeight: 900, cursor: "pointer", letterSpacing: 2, fontFamily: "monospace",
          }}>
            ☠️ RUN ROUND 3: GIGO →
          </button>
        </div>
      </div>
    );
  }

  // ── AI DIRTY — Fast playback ───────────────────────────────────
  if (phase === "ai_dirty") {
    const DG = aiDirtyGame ?? newGame();
    const dSnaps = dirtySnaps.current;
    const currentSnap = dSnaps.length > 0 ? dSnaps[dSnaps.length - 1] : null;
    const isErrorWeek = currentSnap && currentSnap.week >= 4 && currentSnap.week <= 6;

    return (
        <div style={{
          minHeight: "100vh", background: "#050505", color: "#fff",
          fontFamily: "system-ui, sans-serif",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <div style={{ position: "absolute", top: 24, left: 0, right: 0, textAlign: "center" }}>
            <RoundBadge round="ROUND 3 · GLITCH · CORRUPTED DATA" color="#EF4444" />
          </div>
          <img
            src="/durry.jpg" alt="Glitch"
            style={{
              width: 120, height: 120, objectFit: "contain", marginBottom: 16,
              filter: "hue-rotate(120deg) saturate(300%) brightness(0.8)",
              animation: "glitchShake 0.3s infinite",
            }}
          />
          {isErrorWeek && (
            <div style={{
              position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)",
              background: "#EF4444", color: "#fff", fontFamily: "monospace", fontWeight: 900,
              fontSize: 18, padding: "8px 24px", borderRadius: 6, letterSpacing: 3,
              animation: "flashError 0.5s ease-out",
            }}>
              DATA ERROR
            </div>
          )}
          <div style={{
            fontFamily: "monospace", fontSize: "clamp(80px, 20vw, 160px)", fontWeight: 900,
            color: "#EF4444", lineHeight: 1, textShadow: "0 0 60px #EF444444",
            animation: "weekPulse 0.4s ease-out",
          }}>
            W{DG.week}
          </div>
          {currentSnap && (
            <div style={{ display: "flex", gap: 40, marginTop: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>ORDERED</div>
                <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#EF4444" }}>{currentSnap.order}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>DEMAND</div>
                <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#888" }}>{currentSnap.demand}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>COST</div>
                <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#EF4444" }}>${currentSnap.cost}</div>
              </div>
            </div>
          )}
          {/* Running total bottom-right */}
          <div style={{
            position: "absolute", bottom: 24, right: 32,
            fontFamily: "monospace", textAlign: "right",
          }}>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: 2 }}>TOTAL COST</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#EF4444", textShadow: "0 0 20px #EF444433" }}>
              ${retailerCost(DG)}
            </div>
          </div>
          <style>{`
            @keyframes weekPulse{0%{transform:scale(1.3);opacity:0}100%{transform:scale(1);opacity:1}}
            @keyframes glitchShake{0%{transform:translate(0,0)}25%{transform:translate(-3px,1px)}50%{transform:translate(3px,-1px)}75%{transform:translate(-1px,3px)}100%{transform:translate(0,0)}}
            @keyframes flashError{0%{opacity:0;transform:translateX(-50%) scale(1.5)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
          `}</style>
        </div>
      );
  }

  // ── AI DIRTY RESULTS — Failure chart ──────────────────────────
  if (phase === "ai_dirty_results") {
    const DG = aiDirtyGame ?? newGame();
    const dSnaps = dirtySnaps.current;

    const dirtyErrors = [
      "Phantom stock masks real depletion",
      "SAP says 23 — actual 8. Coasting blind",
      "Inventory hits 4, SAP still says 19",
      "SAP says 15 in stock — actual 0. Missed demand spike",
      "Finally sensing gap — too late, backlog exploding",
      "Panic reorder — demand 18, backlog already deep",
      "Overcorrecting — demand already falling",
      "Still catching up from the hole",
      "Stale demand reads 10 — actual demand 4",
      "Damage done — $240 total",
    ];

    const dirtyChartData = {
      labels: dSnaps.map(s => `W${s.week}`),
      datasets: [
        {
          label: "Glitch's Order",
          data: dSnaps.map(s => s.order),
          backgroundColor: dSnaps.map(s => s.week >= 4 && s.week <= 6 ? "#EF4444" : "#EF444488"),
          borderRadius: 4,
          barPercentage: 0.3,
          categoryPercentage: 0.8,
          order: 2,
        },
        {
          label: "Actual Demand",
          data: dSnaps.map(s => s.demand),
          backgroundColor: "#333",
          borderRadius: 4,
          barPercentage: 0.3,
          categoryPercentage: 0.8,
          order: 3,
        },
        {
          label: "SAP Thought (Smoothed)",
          data: dSnaps.map(s => s.reasoning?.smooth ?? 0),
          backgroundColor: "transparent",
          borderColor: "#F59E0B",
          borderWidth: 2,
          borderDash: [6, 4],
          type: "line",
          pointRadius: 4,
          pointBackgroundColor: "#F59E0B",
          tension: 0.3,
          order: 1,
        },
        {
          type: "line",
          label: "Real Inventory",
          data: dSnaps.map(s => s.inventory),
          borderColor: "#EF4444",
          backgroundColor: "#EF444422",
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: "#EF4444",
          tension: 0.3,
          fill: true,
          order: 0,
        },
      ],
    };

    const dirtyChartOpts = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#888", font: { family: "monospace", size: 11 } } },
      },
      scales: {
        x: { ticks: { color: "#888", font: { family: "monospace" } }, grid: { color: "#1a1a1a" } },
        y: { ticks: { color: "#888", font: { family: "monospace" } }, grid: { color: "#1a1a1a" }, beginAtZero: true },
      },
    };

    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <PhaseBar />
        <div style={{ padding: "16px 24px", maxWidth: 1000, margin: "0 auto" }}>
          {/* Header with Glitch + total */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <img
                src="/durry.jpg" alt="Glitch"
                style={{
                  width: 60, height: 60, objectFit: "contain",
                  filter: "hue-rotate(120deg) saturate(300%) brightness(0.8)",
                  animation: "glitchShake 0.3s infinite",
                }}
              />
              <div>
                <RoundBadge round="ROUND 3 · GLITCH" color="#EF4444" />
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", marginTop: 4 }}>CORRUPTED DATA · ALL 10 WEEKS</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#555", letterSpacing: 2 }}>GLITCH TOTAL</div>
              <div style={{
                fontFamily: "monospace", fontSize: "clamp(36px, 8vw, 64px)", fontWeight: 900,
                color: "#EF4444", lineHeight: 1, textShadow: "0 0 30px #EF444455",
              }}>
                ${retailerCost(DG)}
              </div>
            </div>
          </div>

          {/* SAP bugs banner */}
          <div style={{
            background: "#EF44440a", border: "1px solid #EF444422", borderRadius: 10,
            padding: "10px 14px", marginBottom: 16, fontFamily: "monospace", fontSize: 11,
            color: "#EF4444", display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center",
          }}>
            <span>👻 PHANTOM +15 UNITS</span>
            <span>🌉 LEAD TIME -1WK</span>
            <span>⏳ DEMAND 3WKS STALE</span>
          </div>

          {/* Chart */}
          <div style={{
            background: "#0a0a0a", border: "1px solid #EF444422", borderRadius: 12,
            padding: 16, marginBottom: 16, height: 260,
          }}>
            <Bar data={dirtyChartData} options={dirtyChartOpts} />
          </div>

          {/* Week-by-week error table */}
          <div style={{
            background: "#0a0a0a", border: "1px solid #EF444422", borderRadius: 12,
            padding: "12px 16px", marginBottom: 16, overflowX: "auto",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "monospace", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333" }}>
                  {["Week", "Real Demand", "SAP Smoothed", "Glitch Ordered", "Error"].map(h => (
                    <th key={h} style={{ padding: "8px 6px", textAlign: "left", color: "#555", fontWeight: 700, fontSize: 10, letterSpacing: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dSnaps.map((s, i) => {
                  const isErr = s.week >= 4 && s.week <= 8;
                  return (
                    <tr key={i} style={{
                      borderBottom: "1px solid #111",
                      background: isErr ? "#EF44440a" : "transparent",
                    }}>
                      <td style={{ padding: "6px", color: isErr ? "#EF4444" : "#888" }}>
                        {s.week} {isErr ? "🔴" : ""}
                      </td>
                      <td style={{ padding: "6px", color: "#666" }}>{s.demand}</td>
                      <td style={{ padding: "6px", color: "#F59E0B" }}>{s.reasoning?.smooth ?? "—"}</td>
                      <td style={{ padding: "6px", color: "#EF4444", fontWeight: 900 }}>{s.order}</td>
                      <td style={{ padding: "6px", color: isErr ? "#EF4444" : "#666", fontSize: 11 }}>{dirtyErrors[i] ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Glitch quote */}
          <div style={{
            background: "#EF44440a", border: "1px solid #EF444422", borderRadius: 12,
            padding: "20px 24px", marginBottom: 20, textAlign: "center",
          }}>
            <img
              src="/durry.jpg" alt="Glitch"
              style={{
                width: 48, height: 48, objectFit: "contain", marginBottom: 8,
                filter: "hue-rotate(120deg) saturate(300%) brightness(0.8)",
                animation: "glitchShake 0.3s infinite",
              }}
            />
            <div style={{
              fontFamily: "monospace", fontSize: 15, color: "#EF4444",
              lineHeight: 2, fontWeight: 700, fontStyle: "italic",
              animation: "glitchText 3s infinite",
            }}>
              "The model was perfect.<br />
              The data was garbage.<br />
              GIGO: Garbage In, Garbage Out."
            </div>
          </div>

          {/* 3-way comparison + button */}
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 20, flexWrap: "wrap" }}>
            <CostMeter cost={retailerCost(savedGood ?? aiGoodGame)} color="#10B981" label="DURRY (CLEAN)" />
            <CostMeter cost={avgPlayerCost} color="#F59E0B" label="HUMAN AVG" />
            <CostMeter cost={retailerCost(DG)} color="#EF4444" label="GLITCH (DIRTY)" />
          </div>

          <div style={{ textAlign: "center" }}>
            <button onClick={() => setPhase("results")} style={{
              background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", border: "none", borderRadius: 14,
              padding: "18px 48px", fontSize: 18, fontWeight: 900, cursor: "pointer", letterSpacing: 3, fontFamily: "monospace",
              boxShadow: "0 0 30px #F59E0B44",
            }}>
              SEE FINAL RESULTS →
            </button>
          </div>
        </div>
        <style>{`
          @keyframes glitchShake{0%{transform:translate(0,0)}25%{transform:translate(-3px,1px)}50%{transform:translate(3px,-1px)}75%{transform:translate(-1px,3px)}100%{transform:translate(0,0)}}
          @keyframes glitchText{0%,90%,100%{transform:none;opacity:1}92%{transform:translate(-2px,1px) skewX(-1deg);opacity:0.8}94%{transform:translate(2px,-1px) skewX(1deg);opacity:0.9}96%{transform:none;opacity:1}}
        `}</style>
      </div>
    );
  }

  // ── RESULTS ────────────────────────────────────────────────────
  if (phase === "results") {
    const gg = savedGood ?? aiGoodGame;
    const dg = aiDirtyGame;
    const hc = avgPlayerCost;
    const gc = retailerCost(gg);
    const dc = retailerCost(dg);
    const savings = hc - gc;
    const gigoLoss = dc - hc;

    const scores = [
      { label: "👤 HUMAN", sublabel: "Round 1", cost: hc, col: "#EF4444", note: "Panic orders · Bullwhip", rank: hc > dc ? 3 : 2 },
      { label: "⚡ AI CLEAN", sublabel: "Round 2", cost: gc, col: "#10B981", note: `${hc > 0 ? ((savings/hc)*100).toFixed(0) : 0}% cheaper`, rank: 1 },
      { label: "☠️ AI DIRTY", sublabel: "Round 3", cost: dc, col: "#F59E0B", note: gigoLoss > 0 ? `$${gigoLoss.toFixed(0)} worse` : "Close", rank: dc > hc ? 3 : 2 },
    ].sort((a, b) => a.cost - b.cost);

    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif", position: "relative" }}>
        <PhaseBar />
        <div style={{ position: "relative", zIndex: 1, padding: "32px 20px", maxWidth: 700, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#F59E0B", letterSpacing: 4, marginBottom: 12 }}>
              🏆 FINAL VERDICT · DURIAN RUSH
            </div>
            <h2 style={{ fontSize: "clamp(24px, 6vw, 52px)", fontWeight: 900, margin: "0 0 8px" }}>
              Three rounds. One lesson.
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 28 }}>
            {scores.map(({ label, sublabel, cost, col, note }, idx) => (
              <div key={label} style={{
                background: `${col}09`, border: `2px solid ${col}${idx === 0 ? "88" : "33"}`,
                borderRadius: 14, padding: "18px 12px", textAlign: "center",
                transform: idx === 0 ? "scale(1.04)" : "scale(1)",
                boxShadow: idx === 0 ? `0 0 30px ${col}33` : "none",
              }}>
                {idx === 0 && <div style={{ fontFamily: "monospace", fontSize: 9, color: col, letterSpacing: 2, marginBottom: 8 }}>🥇 WINNER</div>}
                <div style={{ fontFamily: "monospace", fontSize: 9, color: col, letterSpacing: 1, marginBottom: 4 }}>{sublabel}</div>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#fff", marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: "clamp(24px,5vw,40px)", fontWeight: 900, color: col, fontFamily: "monospace", lineHeight: 1 }}>${cost.toFixed(0)}</div>
                <div style={{ color: "#444", fontSize: 10, marginTop: 8, lineHeight: 1.5 }}>{note}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "#0a0a0a", border: "1px solid #F59E0B22", borderRadius: 14, padding: 22, marginBottom: 20 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#F59E0B", letterSpacing: 3, marginBottom: 16 }}>
              THE THREE LAWS OF AI IN SUPPLY CHAIN
            </div>
            {[
              { icon: "🎯", col: "#10B981", title: "Signal beats instinct", body: "EMA smoothing vs panic ordering." },
              { icon: "🗺️", col: "#3B82F6", title: "Pipeline beats memory", body: "No human tracks 4 tiers simultaneously." },
              { icon: "🗑️", col: "#EF4444", title: "Garbage In = Garbage Out", body: "Same algorithm, wrong data, worse than human." },
            ].map(l => (
              <div key={l.title} style={{ display: "flex", gap: 14, marginBottom: 16, borderBottom: "1px solid #111", paddingBottom: 16 }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{l.icon}</div>
                <div>
                  <div style={{ color: l.col, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{l.title}</div>
                  <div style={{ color: "#555", fontSize: 12, lineHeight: 1.7 }}>{l.body}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => setPhase("ended")} style={{
              background: "linear-gradient(135deg, #F59E0B, #D97706)",
              color: "#000", border: "none", borderRadius: 10,
              padding: "14px 36px", cursor: "pointer", fontFamily: "monospace",
              fontSize: 14, fontWeight: 900, letterSpacing: 2,
              boxShadow: "0 0 20px #F59E0B33",
            }}>
              END SESSION
            </button>
            <button onClick={() => {
              const lb = buildLeaderboard(playersData);
              const escCSV = (v) => {
                const s = String(v ?? "");
                return s.includes(",") || s.includes('"') || s.includes("\n")
                  ? '"' + s.replace(/"/g, '""') + '"' : s;
              };
              const rows = [["Rank","Name","Email","Phone","TotalCost","JoinedAt"]];
              lb.forEach((p, i) => {
                const raw = playersData[p.uid] || {};
                rows.push([
                  i + 1,
                  escCSV(p.name),
                  escCSV(raw.email || ""),
                  escCSV(raw.phone || ""),
                  p.cost.toFixed(2),
                  raw.joinedAt ? new Date(raw.joinedAt).toISOString() : "",
                ]);
              });
              const csv = rows.map(r => r.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "durian-rush-leads.csv"; a.click();
              URL.revokeObjectURL(url);
            }} style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              color: "#000", border: "none", borderRadius: 8,
              padding: "10px 24px", cursor: "pointer", fontFamily: "monospace",
              fontSize: 11, fontWeight: 900, letterSpacing: 1,
            }}>
              📥 EXPORT LEADS
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 16, color: "#1a1a1a", fontSize: 10, fontFamily: "monospace" }}>
            powered by TetriXX · automating complexity, delivering clarity
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED — session over ──────────────────────────────────────
  if (phase === "ended") {
    return (
      <div style={{
        minHeight: "100vh", background: "#050505", color: "#fff",
        fontFamily: "system-ui, sans-serif",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "32px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 80, marginBottom: 16 }}>🏁</div>
        <h1 style={{
          fontSize: "clamp(32px, 8vw, 56px)", fontWeight: 900, margin: "0 0 12px",
          background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          SESSION ENDED
        </h1>
        <div style={{
          fontFamily: "monospace", fontSize: 20, color: "#888",
          letterSpacing: 2, marginBottom: 32,
        }}>
          {playerCount} players participated
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={() => {
            const lb = buildLeaderboard(playersData);
            const escCSV = (v) => {
              const s = String(v ?? "");
              return s.includes(",") || s.includes('"') || s.includes("\n")
                ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const rows = [["Rank","Name","Email","Phone","TotalCost","JoinedAt"]];
            lb.forEach((p, i) => {
              const raw = playersData[p.uid] || {};
              rows.push([
                i + 1, escCSV(p.name), escCSV(raw.email || ""),
                escCSV(raw.phone || ""), p.cost.toFixed(2),
                raw.joinedAt ? new Date(raw.joinedAt).toISOString() : "",
              ]);
            });
            const csv = rows.map(r => r.join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = "durian-rush-leads.csv"; a.click();
            URL.revokeObjectURL(url);
          }} style={{
            background: "linear-gradient(135deg, #10B981, #059669)",
            color: "#000", border: "none", borderRadius: 12,
            padding: "14px 32px", cursor: "pointer", fontFamily: "monospace",
            fontSize: 14, fontWeight: 900, letterSpacing: 1,
          }}>
            📥 EXPORT LEADS
          </button>
          <button onClick={reset} style={{
            background: "linear-gradient(135deg, #EF4444, #B91C1C)",
            color: "#fff", border: "none", borderRadius: 12,
            padding: "14px 32px", cursor: "pointer", fontFamily: "monospace",
            fontSize: 14, fontWeight: 900, letterSpacing: 1,
          }}>
            ↺ RESET FOR NEXT RUN
          </button>
        </div>

        <div style={{ marginTop: 40, color: "#333", fontSize: 11, fontFamily: "monospace" }}>
          powered by TetriXX · automating complexity, delivering clarity
        </div>
      </div>
    );
  }

  return null;
}
