import { useState, useCallback, useEffect, useRef } from "react";
import { ref, set, onValue } from "firebase/database";
import { db } from "./firebase";
import {
  NODES, DEMAND, N_WEEKS, EVENTS,
  HOLD, BACK,
  stepGame, newGame, chainCost, retailerCost,
} from "./GameEngine";
import DurryIntro from "./components/DurryIntro";

// ══ PHASE SEQUENCE ══════════════════════════════════════════════
const PHASES = ["intro","lobby","round1","durry_intro","ai_running","gigo_reveal","ai_dirty","results"];
const WEEK_DURATION = 30_000; // 30s per week

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

function buildLeaderboard(playersData, currentWeek) {
  if (!playersData) return [];
  return Object.entries(playersData)
    .map(([uid, p]) => {
      const dec = p.decisions || {};
      return {
        uid,
        name: p.name || "???",
        emoji: p.emoji || "👤",
        cost: playerCost(dec),
        currentChoice: dec[`week${currentWeek}`]?.choice ?? null,
        currentQty: dec[`week${currentWeek}`]?.quantity ?? null,
      };
    })
    .sort((a, b) => a.cost - b.cost);
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

// ══ ADMIN SCREEN — PROJECTOR GAME SHOW ══════════════════════════
export default function AdminScreen() {
  const [phase, setPhaseLocal] = useState("intro");
  const [week, setWeekLocal] = useState(0);
  const [deadline, setDeadline] = useState(null);
  const [aiGoodGame, setAiGoodGame] = useState(null);
  const [aiDirtyGame, setAiDirtyGame] = useState(null);
  const [savedGood, setSavedGood] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [playersData, setPlayersData] = useState(null);
  const [prevDecisions, setPrevDecisions] = useState({}); // track who just submitted
  const [flashUids, setFlashUids] = useState(new Set());
  const aiTimer = useRef(null);
  const advancedRef = useRef(false); // prevent double auto-advance

  const remaining = useCountdown(deadline);

  const setPhase = useCallback((p) => {
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

  // Flash green when a new decision arrives
  useEffect(() => {
    if (!playersData) return;
    const newFlash = new Set();
    for (const [uid, p] of Object.entries(playersData)) {
      const key = `week${week}`;
      const hasNow = p.decisions?.[key];
      const hadBefore = prevDecisions[uid]?.[key];
      if (hasNow && !hadBefore) newFlash.add(uid);
    }
    if (newFlash.size > 0) {
      setFlashUids(newFlash);
      setTimeout(() => setFlashUids(new Set()), 1200);
    }
    const snap = {};
    for (const [uid, p] of Object.entries(playersData)) snap[uid] = p.decisions || {};
    setPrevDecisions(snap);
  }, [playersData, week]);

  // Start deadline for a week
  const startWeekTimer = useCallback(() => {
    const dl = Date.now() + WEEK_DURATION;
    setDeadline(dl);
    writeDeadline(dl);
    advancedRef.current = false;
  }, []);

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (phase !== "round1" || !deadline) return;
    if (remaining > 0 || advancedRef.current) return;
    advancedRef.current = true;
    doAdvance();
  }, [remaining, phase, deadline]);

  const doAdvance = useCallback(() => {
    const nextWeek = week + 1;
    if (nextWeek >= N_WEEKS) {
      setWeekLocal(nextWeek);
      setDeadline(null);
      writeDeadline(null);
      setPhase("durry_intro");
    } else {
      setWeekLocal(nextWeek);
      writeWeek(nextWeek);
      const dl = Date.now() + WEEK_DURATION;
      setDeadline(dl);
      writeDeadline(dl);
      advancedRef.current = false;
    }
  }, [week, setPhase]);

  const forceAdvance = () => {
    advancedRef.current = true;
    doAdvance();
  };

  const addTime = (ms) => {
    const newDl = (deadline || Date.now()) + ms;
    setDeadline(newDl);
    writeDeadline(newDl);
  };

  const reset = () => {
    if (!window.confirm("This will delete all player data. Are you sure?")) return;
    if (aiTimer.current) clearTimeout(aiTimer.current);
    set(ref(db, "players"), null);
    set(ref(db, "game"), { phase: "intro", currentWeek: 0, locked: false });
    setPhaseLocal("intro");
    setWeekLocal(0);
    setDeadline(null);
    setAiGoodGame(null);
    setAiDirtyGame(null);
    setSavedGood(null);
    setShowAI(false);
    setAiRunning(false);
    setPlayerCount(0);
    setPlayersData(null);
    setPrevDecisions({});
    setFlashUids(new Set());
    advancedRef.current = false;
  };

  const startAIGood = () => {
    setAiRunning(true);
    let g = newGame();
    let w = 0;
    const tick = () => {
      if (w >= N_WEEKS) {
        setAiGoodGame(g); setSavedGood(g); setAiRunning(false);
        set(ref(db, "game/aiCleanCost"), retailerCost(g));
        return;
      }
      g = stepGame(g, 0, "ai_clean");
      setAiGoodGame({...g});
      w++;
      aiTimer.current = setTimeout(tick, 800);
    };
    tick();
  };

  const startAIDirty = () => {
    setAiRunning(true);
    let g = newGame();
    let w = 0;
    const tick = () => {
      if (w >= N_WEEKS) {
        setAiDirtyGame(g); setAiRunning(false);
        set(ref(db, "game/aiDirtyCost"), retailerCost(g));
        return;
      }
      g = stepGame(g, 0, "ai_dirty");
      setAiDirtyGame({...g});
      w++;
      aiTimer.current = setTimeout(tick, 800);
    };
    tick();
  };

  const demand = DEMAND[Math.min(week, N_WEEKS - 1)];
  const currentEvent = EVENTS[week];
  const humanDone = week >= N_WEEKS;
  const aiGoodDone = aiGoodGame && aiGoodGame.week >= N_WEEKS;
  const dirtyDone  = aiDirtyGame && aiDirtyGame.week >= N_WEEKS;

  const decisionsThisWeek = playersData
    ? Object.values(playersData).filter(p => p.decisions && p.decisions[`week${week}`]).length
    : 0;

  const avgPlayerCost = playersData
    ? (() => {
        const entries = Object.values(playersData);
        if (entries.length === 0) return 0;
        return entries.reduce((sum, p) => sum + playerCost(p.decisions), 0) / entries.length;
      })()
    : 0;

  const allIn = decisionsThisWeek >= playerCount && playerCount > 0;
  const timerRed = remaining > 0 && remaining < 10_000;
  const timerWarn = remaining > 0 && remaining < 30_000;

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
              <img src="/durry.png" alt="Durry" style={{ width: 150, height: 150, objectFit: "contain", marginBottom: 12 }} />
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
                src="/durry.png" alt="Glitch"
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

  // ── LOBBY ──────────────────────────────────────────────────────
  if (phase === "lobby") {
    const PLAY_URL = "https://durian-rush-kl.web.app/play";
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(PLAY_URL)}&color=D97706&bgcolor=000000&format=png`;
    return (
      <div style={{
        minHeight: "100vh", color: "#fff", fontFamily: "system-ui, sans-serif",
        backgroundImage: "url(/can1.png)", backgroundSize: "cover", backgroundPosition: "center",
        position: "relative",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 0 }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <PhaseBar />
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", minHeight: "85vh",
            padding: "24px 24px", textAlign: "center",
          }}>
            <div style={{
              fontFamily: "monospace", fontSize: 18, color: "#F59E0B", letterSpacing: 6,
              fontWeight: 700, marginBottom: 20, textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              SCAN QR CODE TO JOIN
            </div>
            <div style={{
              background: "#000", padding: 16, borderRadius: 16, marginBottom: 16,
              border: "3px solid #F59E0B66",
              boxShadow: "0 0 40px #F59E0B22",
            }}>
              <img src={qrSrc} alt="QR Code" style={{ width: 300, height: 300, display: "block", borderRadius: 8 }} />
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 16, color: "#F59E0B", letterSpacing: 2,
              marginBottom: 28, fontWeight: 700,
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              durian-rush-kl.web.app/play
            </div>
            <div style={{
              fontSize: "clamp(64px, 16vw, 120px)", fontWeight: 900,
              color: "#10B981", fontFamily: "monospace", lineHeight: 1,
              textShadow: "0 0 40px #10B98144",
            }}>
              {playerCount}
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 16, color: "#aaa", letterSpacing: 4, marginBottom: 32,
              fontWeight: 700,
            }}>
              PLAYERS JOINED
            </div>
            <button onClick={() => {
              set(ref(db, "game/locked"), true);
              writeWeek(0);
              startWeekTimer();
              setPhase("round1");
            }} style={{
              background: "linear-gradient(135deg, #10B981, #059669)",
              color: "#000", border: "none", borderRadius: 14,
              padding: "18px 48px", fontSize: 20, fontWeight: 900,
              cursor: "pointer", letterSpacing: 3, fontFamily: "monospace",
              boxShadow: "0 0 30px #10B98144",
            }}>
              🔒 LOCK & START ROUND 1
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // ── ROUND 1: LIVE GAME SHOW PROJECTOR ─────────────────────────
  // ══════════════════════════════════════════════════════════════
  if (phase === "round1") {
    const lb = buildLeaderboard(playersData, week);

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
          {/* Left: Week */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              background: "#F59E0B", color: "#000", borderRadius: 8,
              padding: "6px 16px", fontFamily: "monospace", fontWeight: 900,
              fontSize: "clamp(16px, 3vw, 24px)", letterSpacing: 2,
            }}>
              WEEK {week + 1} / {N_WEEKS}
            </div>
            <WeekTrack week={week} />
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

          {/* Right: Player count + decisions */}
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#888", fontWeight: 900 }}>
              👥 {playerCount} players
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 16, fontWeight: 900,
              color: allIn ? "#10B981" : "#F59E0B",
              marginTop: 2,
            }}>
              📊 {decisionsThisWeek}/{playerCount} {allIn ? "✓" : ""}
            </div>
          </div>
        </div>

        {/* ── EVENT BANNER ────────────────────────────────────── */}
        {currentEvent && (
          <div style={{
            background: currentEvent.bg, borderBottom: `2px solid ${currentEvent.border}`,
            padding: "8px 24px",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>{currentEvent.emoji}</span>
            <span style={{ fontWeight: 900, fontSize: 14, color: "#fff" }}>{currentEvent.title}</span>
            <span style={{ color: "#bbb", fontSize: 12 }}>— {currentEvent.body}</span>
          </div>
        )}

        {/* ── MAIN: LEADERBOARD ───────────────────────────────── */}
        <div style={{ flex: 1, padding: "16px 24px", overflow: "auto" }}>
          <div style={{
            maxWidth: 1000, margin: "0 auto",
          }}>
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
              <div style={{ width: 80, textAlign: "center" }}>WEEK {week + 1}</div>
              <div style={{ width: 90, textAlign: "right" }}>TOTAL COST</div>
            </div>

            {lb.map((p, idx) => {
              const isFlashing = flashUids.has(p.uid);
              const isTop3 = idx < 3;
              const rankColors = ["#F59E0B", "#C0C0C0", "#CD7F32"];
              const rankIcons = ["🥇", "🥈", "🥉"];

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

                  {/* This week choice */}
                  <div style={{
                    width: 80, textAlign: "center",
                    fontFamily: "monospace", fontWeight: 900,
                    fontSize: 14,
                  }}>
                    {p.currentChoice ? (
                      <span style={{
                        background: "#10B98122", border: "1px solid #10B98144",
                        color: "#10B981", borderRadius: 6, padding: "3px 10px",
                      }}>
                        {p.currentChoice}
                      </span>
                    ) : (
                      <span style={{ color: "#F59E0B", fontSize: 18 }}>⏳</span>
                    )}
                  </div>

                  {/* Total cost */}
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
                Waiting for players to join…
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
          {/* Demand info */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>
              WEEK {week + 1} DEMAND:
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 28, fontWeight: 900,
              color: "#F59E0B",
            }}>
              {demand}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: "#555" }}>cases</div>

            {/* Mini demand curve */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 24, marginLeft: 8 }}>
              {DEMAND.map((d, i) => (
                <div key={i} style={{
                  width: 8, background: i < week ? "#F59E0B88" : i === week ? "#F59E0B" : "#222",
                  height: `${(d / 18) * 100}%`, borderRadius: "2px 2px 0 0", minHeight: 2,
                }} />
              ))}
            </div>
          </div>

          {/* Admin controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => addTime(30_000)} style={{
              background: "#111", border: "1px solid #333", color: "#888",
              borderRadius: 8, padding: "6px 14px", cursor: "pointer",
              fontFamily: "monospace", fontSize: 11, fontWeight: 700,
            }}>
              +30s
            </button>
            <button onClick={forceAdvance} style={{
              background: allIn ? "linear-gradient(135deg, #F59E0B, #D97706)" : "#1a1a1a",
              border: allIn ? "2px solid #F59E0B" : "2px solid #333",
              color: allIn ? "#000" : "#666",
              borderRadius: 8, padding: "8px 20px", cursor: "pointer",
              fontFamily: "monospace", fontSize: 12, fontWeight: 900, letterSpacing: 1,
              boxShadow: allIn ? "0 0 20px #F59E0B44" : "none",
              transition: "all 0.3s",
            }}>
              {week + 1 >= N_WEEKS ? "🏁 END ROUND 1" : `▶ NEXT WEEK`}
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

  // ── AI RUNNING (CLEAN) ─────────────────────────────────────────
  if (phase === "ai_running") {
    const AG = aiGoodGame ?? newGame();
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <PhaseBar />
        <div style={{ background: "#0a0a0a", borderBottom: "1px solid #10B98122", padding: "10px 16px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <RoundBadge round={`ROUND 2 · AI CLEAN${aiRunning ? " · ⚡ COMPUTING…" : aiGoodDone ? " · DONE" : ""}`} color="#10B981" />
              <CostMeter cost={retailerCost(AG)} color="#10B981" />
            </div>
            <WeekTrack week={AG.week} />
          </div>
        </div>
        <div style={{ padding: "14px 16px", maxWidth: 900, margin: "0 auto" }}>
          {aiRunning && (
            <div style={{ background: "#10B98111", border: "1px solid #10B98133", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontFamily: "monospace", fontSize: 12, color: "#10B981" }}>
              ⚡ AI processing — EMA smoothing, pipeline tracking…
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button onClick={() => setShowAI(!showAI)} style={{
              background: showAI ? "#10B98122" : "transparent",
              border: `1px solid ${showAI ? "#10B981" : "#222"}`, color: showAI ? "#10B981" : "#444",
              borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontFamily: "monospace", fontSize: 10,
            }}>
              {showAI ? "▾ HIDE AI LOGIC" : "▸ SHOW AI LOGIC"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {NODES.map((n, i) => <TierCard key={n.id} tier={AG.tiers[i]} node={n} showAI={showAI} dirty={false} />)}
          </div>
          {aiGoodDone && !aiRunning && (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ background: "#10B98111", border: "1px solid #10B98133", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#10B981", letterSpacing: 3, marginBottom: 8 }}>RESULT</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" }}>
                  <CostMeter cost={avgPlayerCost} color="#EF4444" label="👤 HUMAN AVG" />
                  <CostMeter cost={retailerCost(AG)} color="#10B981" label="⚡ AI CLEAN" />
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontFamily: "monospace", marginBottom: 2 }}>SAVINGS</div>
                    <div style={{ fontSize: "clamp(28px,6vw,52px)", fontWeight: 900, color: "#10B981", fontFamily: "monospace" }}>
                      {avgPlayerCost > 0 ? (((avgPlayerCost - retailerCost(AG)) / avgPlayerCost) * 100).toFixed(0) : 0}% less
                    </div>
                  </div>
                </div>
              </div>
              <button onClick={() => setPhase("gigo_reveal")} style={{
                background: "linear-gradient(135deg, #EF4444, #B91C1C)", color: "#fff", border: "none", borderRadius: 14,
                padding: "16px 36px", fontSize: 16, fontWeight: 900, cursor: "pointer", letterSpacing: 2, fontFamily: "monospace",
              }}>
                ⚠️ CORRUPT THE DATA
              </button>
            </div>
          )}
        </div>
        <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
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

  // ── AI DIRTY ───────────────────────────────────────────────────
  if (phase === "ai_dirty") {
    const DG = aiDirtyGame ?? newGame();
    return (
      <div style={{ minHeight: "100vh", background: "#050505", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <PhaseBar />
        <div style={{ background: "#0a0a0a", borderBottom: "1px solid #EF444422", padding: "10px 16px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <RoundBadge round={`☠️ ROUND 3 · AI DIRTY${aiRunning ? " · COMPUTING…" : ""}`} color="#EF4444" />
              <CostMeter cost={retailerCost(DG)} color="#EF4444" />
            </div>
            <WeekTrack week={DG.week} />
          </div>
        </div>
        <div style={{ padding: "14px 16px", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ background: "#EF44440a", border: "1px solid #EF444422", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontFamily: "monospace", fontSize: 10, color: "#EF4444", display: "flex", gap: 18, flexWrap: "wrap" }}>
            <span>⚠ SAP: PHANTOM +15 UNITS</span><span>⚠ LEAD TIME: -1WK</span><span>⚠ DEMAND: 3WKS STALE</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {NODES.map((n, i) => <TierCard key={n.id} tier={DG.tiers[i]} node={n} showAI={true} dirty={true} />)}
          </div>
          {dirtyDone && !aiRunning && (
            <button onClick={() => setPhase("results")} style={{
              width: "100%", background: "linear-gradient(135deg, #F59E0B, #D97706)", color: "#000", border: "none", borderRadius: 14,
              padding: "18px", fontSize: 16, fontWeight: 900, cursor: "pointer", letterSpacing: 2, fontFamily: "monospace",
            }}>
              🏆 SEE FINAL RESULTS →
            </button>
          )}
        </div>
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
            <button onClick={() => {
              const lb = buildLeaderboard(playersData, week);
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
            <button onClick={reset} style={{
              background: "transparent", color: "#2a2a2a", border: "1px solid #161616", borderRadius: 8,
              padding: "10px 24px", cursor: "pointer", fontFamily: "monospace", fontSize: 10,
            }}>
              ↺ RESET
            </button>
          </div>
          <div style={{ textAlign: "center", marginTop: 16, color: "#1a1a1a", fontSize: 10, fontFamily: "monospace" }}>
            powered by TetriXX · automating complexity, delivering clarity
          </div>
        </div>
      </div>
    );
  }

  return null;
}
