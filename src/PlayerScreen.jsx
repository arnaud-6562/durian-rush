import { useState, useEffect, useRef } from "react";
import { ref, onValue, set } from "firebase/database";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { db, auth } from "./firebase";
import { DEMAND, N_WEEKS, EVENTS, buildVotes, simulatePlayerCost } from "./GameEngine";

const EMOJIS = ["🦁","🐯","🦊","🐻","🦅","🐲","🦎","🐬","🦈","🐸"];
const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
const makeUid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

const COUNTRY_CODES = [
  { code: "+60", label: "🇲🇾 +60", country: "MY" },
  { code: "+65", label: "🇸🇬 +65", country: "SG" },
  { code: "+66", label: "🇹🇭 +66", country: "TH" },
  { code: "+62", label: "🇮🇩 +62", country: "ID" },
  { code: "+84", label: "🇻🇳 +84", country: "VN" },
  { code: "+63", label: "🇵🇭 +63", country: "PH" },
  { code: "+91", label: "🇮🇳 +91", country: "IN" },
  { code: "+1",  label: "🇺🇸 +1",  country: "US" },
  { code: "+33", label: "🇫🇷 +33", country: "FR" },
  { code: "+44", label: "🇬🇧 +44", country: "UK" },
];

// ══ PLAYER PHONE VIEW ═══════════════════════════════════════════

export default function PlayerScreen() {
  const [phase, setPhase] = useState(null);
  const [loading, setLoading] = useState(true);

  // Player state: null = not registered, object = registered
  const [player, setPlayer] = useState(null);
  const [playerChecked, setPlayerChecked] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+60");
  const [phoneNum, setPhoneNum] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // OTP state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const [otpError, setOtpError] = useState(null);
  const [resendTimer, setResendTimer] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [showSkip, setShowSkip] = useState(false); // auto-show SKIP after 10s
  const formDataRef = useRef(null); // store form data during OTP

  // Game state — self-paced: player tracks own week locally
  const [myWeek, setMyWeek] = useState(0);
  const [deadline, setDeadline] = useState(null);
  const [finished, setFinished] = useState(false);
  const [forceEnded, setForceEnded] = useState(false);

  // Player count + mini-leaderboard data + personal rank
  const [playerCount, setPlayerCount] = useState(0);
  const [topPlayers, setTopPlayers] = useState([]);
  const [myRank, setMyRank] = useState(null);

  // On mount: restore player from sessionStorage, then verify against Firebase
  useEffect(() => {
    let cancelled = false;
    const saved = (() => { try { const s = sessionStorage.getItem("dr_player"); return s ? JSON.parse(s) : null; } catch { return null; } })();
    if (!saved) { setPlayerChecked(true); return; }
    // Check if this uid still exists in Firebase
    const unsub = onValue(ref(db, `players/${saved.uid}`), (snap) => {
      if (cancelled) return;
      if (snap.exists()) {
        setPlayer(saved);
      } else {
        // Player record gone (game was reset) — clear stale session
        sessionStorage.removeItem("dr_player");
        setPlayer(null);
      }
      setPlayerChecked(true);
      unsub(); // one-shot read
    });
    return () => { cancelled = true; };
  }, []);

  const clearPlayer = () => {
    sessionStorage.removeItem("dr_player");
    setPlayer(null);
  };

  useEffect(() => {
    const unsub = onValue(ref(db, "game/phase"), (snap) => {
      const p = snap.val();
      console.log("PLAYER PHASE →", p);
      setPhase(p);
      setLoading(false);
      // Reset ALL local game state when round1 starts
      if (p === "round1") {
        setMyWeek(0);
        setMyDecisions(null);
        setFinished(false);
        setForceEnded(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, "game/weekDeadline"), (snap) => {
      setDeadline(snap.val());
    });
    return unsub;
  }, []);

  // Listen for force-end signal from admin
  useEffect(() => {
    const unsub = onValue(ref(db, "game/forceEnded"), (snap) => {
      setForceEnded(snap.val() === true);
    });
    return unsub;
  }, []);

  // Player count + top 3 mini-leaderboard
  useEffect(() => {
    const unsub = onValue(ref(db, "players"), (snap) => {
      const val = snap.val();
      if (!val) { setPlayerCount(0); setTopPlayers([]); return; }
      setPlayerCount(Object.keys(val).length);
      // Build mini-leaderboard: top 3 by furthest week, then by cost
      const list = Object.entries(val).map(([uid, p]) => ({
        uid,
        name: p.name || "???",
        emoji: p.emoji || "👤",
        currentWeek: p.currentWeek ?? 0,
        cost: simulatePlayerCost(p.decisions),
        done: (p.currentWeek ?? 0) >= N_WEEKS,
      }));
      list.sort((a, b) => {
        if (b.done !== a.done) return b.done ? 1 : -1;
        if (b.currentWeek !== a.currentWeek) return b.currentWeek - a.currentWeek;
        return a.cost - b.cost;
      });
      setTopPlayers(list.slice(0, 3));
      // Compute personal rank
      const saved = (() => { try { const s = sessionStorage.getItem("dr_player"); return s ? JSON.parse(s) : null; } catch { return null; } })();
      if (saved) {
        const idx = list.findIndex(p => p.uid === saved.uid);
        setMyRank(idx >= 0 ? idx + 1 : null);
      }
    });
    return unsub;
  }, []);

  // AI cost scores from Firebase
  const [aiCleanCost, setAiCleanCost] = useState(null);
  const [aiDirtyCost, setAiDirtyCost] = useState(null);
  const [myDecisions, setMyDecisions] = useState(null);

  useEffect(() => {
    const unsubs = [
      onValue(ref(db, "game/aiCleanCost"), s => setAiCleanCost(s.val())),
      onValue(ref(db, "game/aiDirtyCost"), s => setAiDirtyCost(s.val())),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    if (!player) return;
    const unsub = onValue(ref(db, `players/${player.uid}/decisions`), (snap) => {
      setMyDecisions(snap.val());
    });
    return unsub;
  }, [player]);

  // Local countdown from deadline
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!deadline) { setRemaining(null); return; }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  // Auto-show SKIP button after 10s in OTP step
  useEffect(() => {
    if (!otpStep) { setShowSkip(false); return; }
    const t = setTimeout(() => setShowSkip(true), 10000);
    return () => clearTimeout(t);
  }, [otpStep]);

  const submitDecision = (opt) => {
    if (!player || finished || myWeek >= N_WEEKS) return;
    const currentWeek = myWeek;
    const nextWeek = currentWeek + 1;

    // 1. Update local state IMMEDIATELY (no Firebase round-trip)
    setMyWeek(nextWeek);
    if (nextWeek >= N_WEEKS) {
      setFinished(true);
    }

    // 2. Write to Firebase in background (fire-and-forget)
    set(ref(db, `players/${player.uid}/decisions/week${currentWeek}`), {
      choice: opt.key,
      quantity: opt.value,
      timestamp: Date.now(),
    }).catch(e => console.error("Decision write failed:", e));

    set(ref(db, `players/${player.uid}/currentWeek`), nextWeek)
      .catch(e => console.error("Week write failed:", e));
  };

  const finishRegistration = async (verified) => {
    const fd = formDataRef.current;
    const uid = verified && auth.currentUser ? auth.currentUser.uid : makeUid();
    const data = {
      name: fd.name,
      email: fd.email,
      phone: fd.phone,
      joinedAt: Date.now(),
      emoji: randomEmoji(),
      verified,
    };
    await set(ref(db, `players/${uid}`), data);
    const playerObj = { uid, ...data };
    sessionStorage.setItem("dr_player", JSON.stringify(playerObj));
    setPlayer(playerObj);
    setOtpStep(false);
  };

  const handleJoin = async () => {
    const trimName = name.trim();
    const trimEmail = email.trim();
    const trimPhone = phoneNum.trim();
    if (!trimName) { setError("Enter your name"); return; }
    if (!trimEmail || !trimEmail.includes("@")) { setError("Enter a valid email"); return; }
    if (!trimPhone || trimPhone.length < 6) { setError("Enter a valid mobile number"); return; }

    const fullPhone = countryCode + trimPhone.replace(/^0+/, "");
    formDataRef.current = { name: trimName, email: trimEmail, phone: fullPhone };

    setSubmitting(true);
    setError(null);
    try {
      // Setup invisible recaptcha
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const result = await signInWithPhoneNumber(auth, fullPhone, window.recaptchaVerifier);
      setConfirmResult(result);
      setOtpStep(true);
      setResendTimer(30);
    } catch (err) {
      console.error("SMS error:", err);
      // If SMS fails, still allow registration (event fallback)
      setError("SMS failed — you can still join without verification");
      formDataRef.current = { name: trimName, email: trimEmail, phone: fullPhone };
      setOtpStep(true);
      setConfirmResult(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length < 6) { setOtpError("Enter the 6-digit code"); return; }
    if (!confirmResult) { setOtpError("No SMS was sent — use Skip below"); return; }
    setVerifying(true);
    setOtpError(null);
    try {
      await confirmResult.confirm(otpCode);
      await finishRegistration(true);
    } catch (err) {
      console.error("OTP error:", err);
      setOtpError("Invalid code — try again or skip");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendTimer > 0 || !formDataRef.current) return;
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, formDataRef.current.phone, window.recaptchaVerifier);
      setConfirmResult(result);
      setResendTimer(30);
      setOtpError(null);
    } catch (err) {
      setOtpError("Resend failed — use Skip below");
    }
  };

  if (loading || !playerChecked) {
    return (
      <div style={S.container}>
        <div style={S.spinner}>⏳</div>
        <div style={S.loadingText}>Connecting…</div>
      </div>
    );
  }

  // ── No game yet / intro ────────────────────────────────────────
  if (!phase || phase === "intro") {
    return (
      <div style={S.container}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🥊</div>
        <h1 style={S.title}>DURIAN RUSH</h1>
        <p style={S.subtitle}>THE SUPPLY CHAIN CHALLENGE</p>
        <div style={S.card}>
          <div style={{ ...S.cardTitle, fontSize: 14 }}>GAME HASN'T STARTED YET</div>
          <p style={{ ...S.cardBody, fontSize: 18 }}>
            Wait for the presenter to open the lobby.
            Keep this screen open.
          </p>
        </div>
        <div style={{ ...S.footer, fontSize: 14 }}>powered by TetriXX</div>
      </div>
    );
  }

  // ── Lobby — OTP step ───────────────────────────────────────────
  if (phase === "lobby" && otpStep && !player) {
    return (
      <div style={{ ...S.bgScreen, backgroundImage: "url(/can1.png)" }}>
        <div style={S.overlay} />
        <div style={S.centerContent}>
          <div style={S.glassCard}>
            <div style={{ fontSize: 56, textAlign: "center", marginBottom: 8 }}>📱</div>
            <div style={{ ...S.cardHeading, textAlign: "center", fontSize: 28 }}>CHECK YOUR PHONE</div>
            <p style={{ color: "#aaa", fontSize: 18, textAlign: "center", margin: "8px 0 20px", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
              Code sent to <strong style={{ color: "#F59E0B" }}>{formDataRef.current?.phone}</strong>
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="000000"
              value={otpCode}
              onChange={e => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              style={{
                ...S.input,
                textAlign: "center",
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 12,
                fontFamily: "monospace",
                padding: "16px",
              }}
              autoFocus
            />
            {otpError && <div style={S.errorText}>{otpError}</div>}
            <button
              onClick={handleVerifyOtp}
              disabled={verifying}
              style={{ ...S.goldBtn, marginTop: 16, opacity: verifying ? 0.5 : 1 }}
            >
              {verifying ? "VERIFYING…" : "✅ VERIFY"}
            </button>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              {resendTimer > 0 ? (
                <span style={{ color: "#555", fontSize: 12 }}>Resend in {resendTimer}s</span>
              ) : (
                <button onClick={handleResend} style={S.linkBtn}>Resend code</button>
              )}
            </div>
            {showSkip && (
              <div style={{ textAlign: "center", marginTop: 20, borderTop: "1px solid #333", paddingTop: 16 }}>
                <button onClick={() => finishRegistration(false)} style={S.skipBtn}>
                  SKIP VERIFICATION →
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={S.footerAbsolute}>Powered by TetriXX</div>
        <div id="recaptcha-container" />
      </div>
    );
  }

  // ── Lobby — registration or waiting ─────────────────────────────
  if (phase === "lobby") {
    // Already registered → waiting screen (show registration form if not registered)
    if (player) {
      return (
        <div style={{ ...S.bgScreen, backgroundImage: "url(/can2.png)" }}>
          <div style={S.overlay} />
          <div style={S.centerContent}>
            <div style={{ fontSize: 80, marginBottom: 12 }}>{player.emoji}</div>
            <h1 style={{
              fontSize: 36, fontWeight: 900, margin: "0 0 8px",
              background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              {player.name.toUpperCase()}
            </h1>
            <div style={{
              color: "#fff", fontSize: 20, marginBottom: 24, fontWeight: 700,
              letterSpacing: 2, textShadow: "0 2px 8px rgba(0,0,0,0.8)",
              animation: "pulse 2s ease-in-out infinite",
            }}>
              WAITING FOR THE GAME TO START...
            </div>
            <div style={{
              background: "rgba(0,0,0,0.6)", borderRadius: 12, padding: "14px 28px",
              fontFamily: "monospace", fontSize: 22, color: "#10B981", fontWeight: 900,
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              🎮 {playerCount} players ready
            </div>
            <button onClick={clearPlayer} style={{
              background: "none", border: "none", color: "#666",
              fontSize: 14, fontFamily: "monospace", cursor: "pointer",
              marginTop: 20, textDecoration: "underline",
              textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            }}>
              Not you? Tap here to re-register
            </button>
          </div>
          <div style={S.footerAbsolute}>Powered by TetriXX</div>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
      );
    }

    // Not registered → registration form
    return (
      <div style={{ ...S.bgScreen, backgroundImage: "url(/can1.png)" }}>
        <div style={S.overlay} />
        <div style={S.centerContent}>
          <h1 style={{
            fontSize: 48, fontWeight: 900, margin: "0 0 4px",
            background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            textAlign: "center",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            DURIAN RUSH
          </h1>
          <p style={{
            color: "#fff", fontSize: 24, textAlign: "center", fontWeight: 700,
            margin: "0 0 24px", letterSpacing: 2,
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            THE SUPPLY CHAIN CHALLENGE
          </p>

          <div style={S.glassCard}>
            <div style={S.cardHeading}>JOIN THE GAME 🎮</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={e => setName(e.target.value)}
                style={S.input}
                autoComplete="name"
                maxLength={40}
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={S.input}
                autoComplete="email"
                maxLength={80}
              />
              {/* Phone with country code */}
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  value={countryCode}
                  onChange={e => setCountryCode(e.target.value)}
                  style={{
                    ...S.input,
                    width: 110,
                    flexShrink: 0,
                    padding: "14px 8px",
                    fontSize: 14,
                    appearance: "none",
                    WebkitAppearance: "none",
                    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23888' d='M2 4l4 4 4-4'/%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 8px center",
                    paddingRight: 24,
                  }}
                >
                  {COUNTRY_CODES.map(cc => (
                    <option key={cc.code} value={cc.code}>{cc.label}</option>
                  ))}
                </select>
                <input
                  type="tel"
                  placeholder="12 345 6789"
                  value={phoneNum}
                  onChange={e => setPhoneNum(e.target.value)}
                  style={{ ...S.input, flex: 1 }}
                  autoComplete="tel"
                  maxLength={15}
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                />
              </div>
              {error && <div style={S.errorText}>{error}</div>}
              <button
                onClick={handleJoin}
                disabled={submitting}
                style={{ ...S.goldBtn, opacity: submitting ? 0.5 : 1 }}
              >
                {submitting ? "SENDING CODE…" : "🎮 JOIN"}
              </button>
            </div>
          </div>
        </div>
        <div style={S.footerAbsolute}>Powered by TetriXX</div>
        <div id="recaptcha-container" />
      </div>
    );
  }

  // ── Round 1 — self-paced play ──────────────────────────────────
  if (phase === "round1") {
    // If not registered, prompt to watch screen
    if (!player) {
      return (
        <div style={S.container}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎮</div>
          <h1 style={{ ...S.title, fontSize: 36 }}>ROUND 1 IN PROGRESS</h1>
          <p style={{ color: "#aaa", fontSize: 18 }}>Registration is closed. Watch the big screen!</p>
        </div>
      );
    }

    // Show DONE only if: player finished all weeks locally, OR admin force-ended the round
    // Never show done on fresh round start (myWeek=0, forceEnded=false, finished=false)
    const isDone = myWeek >= N_WEEKS || forceEnded;
    const week = Math.min(myWeek, N_WEEKS - 1);
    const demand = DEMAND[week];
    const votes = buildVotes(week, demand, 12, 12);
    const ev = EVENTS[week];

    const secs = remaining != null ? Math.ceil(remaining / 1000) : null;
    const timerMin = secs != null ? Math.floor(secs / 60) : null;
    const timerSec = secs != null ? secs % 60 : null;
    const timerStr = secs != null ? `${timerMin}:${String(timerSec).padStart(2, "0")}` : null;
    const urgent = secs != null && secs <= 10;

    const myCost = simulatePlayerCost(myDecisions);

    // Finished screen
    if (isDone) {
      return (
        <div style={S.container}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🏁</div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#10B981", margin: "0 0 8px" }}>ROUND COMPLETE!</h1>
          <div style={{ ...S.card, borderColor: "#10B98144", textAlign: "center" }}>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#10B981", letterSpacing: 3, marginBottom: 8 }}>YOUR TOTAL COST</div>
            <div style={{ fontFamily: "monospace", fontSize: 48, fontWeight: 900, color: "#F59E0B" }}>
              ${myCost.toFixed(0)}
            </div>
          </div>
          <p style={{ fontSize: 20, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            Watch the big screen for Round 2!
          </p>
          <div style={{ ...S.footer, marginTop: 20 }}>
            {player ? `${player.emoji} ${player.name}` : ""}
          </div>
        </div>
      );
    }

    return (
      <div style={{ ...S.container, justifyContent: "flex-start", paddingTop: 12 }}>
        {/* Timer bar */}
        {timerStr != null && (
          <div style={{
            fontFamily: "monospace", fontSize: 16, fontWeight: 900,
            color: urgent ? "#EF4444" : "#555",
            marginBottom: 6,
            animation: urgent ? "blink .5s step-end infinite" : "none",
          }}>
            {"\u23F0"} {timerStr} max
          </div>
        )}

        {/* Week progress dots */}
        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {DEMAND.map((_, i) => (
            <div key={i} style={{
              width: 24, height: 24, borderRadius: "50%",
              background: i < myWeek ? "#10B981" : i === myWeek ? "#F59E0B" : "#1a1a1a",
              border: i === myWeek ? "2px solid #F59E0B" : "2px solid #333",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 900,
              color: i < myWeek ? "#000" : i === myWeek ? "#000" : "#333",
            }}>
              {i < myWeek ? "✓" : i + 1}
            </div>
          ))}
        </div>

        {/* Header */}
        <div style={{
          fontFamily: "monospace", fontSize: 12, color: "#F59E0B",
          letterSpacing: 3, marginBottom: 6,
        }}>
          WEEK {myWeek + 1} of {N_WEEKS}
        </div>
        <div style={{
          fontSize: "clamp(22px, 7vw, 34px)", fontWeight: 900, color: "#fff",
          marginBottom: 6,
        }}>
          Demand: {demand} cases
        </div>

        {/* Event card */}
        {ev && (
          <div style={{
            background: ev.bg, border: `1px solid ${ev.border}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 10,
            maxWidth: 360, width: "100%", textAlign: "left",
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 24 }}>{ev.emoji}</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: 13, color: "#fff" }}>{ev.title}</div>
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{ev.body}</div>
              </div>
            </div>
          </div>
        )}

        {/* Vote buttons */}
        <div style={{ maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {votes.map(opt => {
            const KEY_COLORS = { A: "#10B981", B: "#F59E0B", C: "#EF4444", D: "#888" };
            const kc = KEY_COLORS[opt.key];
            return (
              <button
                key={opt.key}
                onClick={() => submitDecision(opt)}
                style={{
                  background: "#0d0d0d",
                  border: `2px solid ${kc}44`,
                  borderRadius: 12, padding: "14px",
                  cursor: "pointer", textAlign: "left", width: "100%",
                  display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "#1a1a1a", border: `2px solid ${kc}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "monospace", fontWeight: 900, fontSize: 16,
                  color: kc, flexShrink: 0,
                }}>
                  {opt.key}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 15, color: "#fff", fontFamily: "monospace" }}>
                    {opt.label} — {opt.value} cases
                  </div>
                  <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{opt.detail}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mini leaderboard — top 3 */}
        {topPlayers.length > 0 && (
          <div style={{
            maxWidth: 360, width: "100%", marginTop: 12,
            background: "#0a0a0a", borderRadius: 10, padding: "10px 14px",
            border: "1px solid #1a1a1a",
          }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: 2, marginBottom: 6 }}>LEADERBOARD</div>
            {topPlayers.map((tp, idx) => {
              const medals = ["🥇", "🥈", "🥉"];
              const isMe = player && tp.uid === player.uid;
              return (
                <div key={tp.uid} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "3px 0",
                  color: isMe ? "#F59E0B" : "#888", fontSize: 13,
                  fontWeight: isMe ? 900 : 400,
                }}>
                  <span>{medals[idx]}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tp.emoji} {isMe ? "You" : tp.name}
                  </span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: tp.done ? "#10B981" : "#555" }}>
                    {tp.done ? "✓ DONE" : `Wk ${tp.currentWeek + 1}`}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ ...S.footer, marginTop: 12 }}>
          {player ? `${player.emoji} ${player.name} · $${myCost.toFixed(0)}` : ""}
        </div>
        <style>{`@keyframes blink{50%{opacity:0}}`}</style>
      </div>
    );
  }

  // ── Round 1 results (locked leaderboard on admin) ─────────────
  if (phase === "round1_results") {
    const myCost = simulatePlayerCost(myDecisions);

    return (
      <div style={S.container}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>🏁</div>
        <h1 style={{ fontSize: 36, fontWeight: 900, color: "#10B981", margin: "0 0 8px" }}>ROUND 1 COMPLETE!</h1>
        <div style={{ ...S.card, borderColor: "#10B98144", textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: "#10B981", letterSpacing: 3, marginBottom: 8 }}>YOUR TOTAL COST</div>
          <div style={{ fontFamily: "monospace", fontSize: 48, fontWeight: 900, color: "#F59E0B" }}>
            ${myCost.toFixed(0)}
          </div>
          {myRank != null && playerCount > 0 && (
            <div style={{
              fontFamily: "monospace", fontSize: 18, fontWeight: 900,
              color: myRank <= 3 ? "#10B981" : "#aaa", marginTop: 12,
            }}>
              {myRank <= 3 ? ["🥇", "🥈", "🥉"][myRank - 1] + " " : ""}
              YOU FINISHED #{myRank} of {playerCount}
            </div>
          )}
        </div>
        <p style={{ fontSize: 20, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
          Watch the big screen for results!
        </p>
      </div>
    );
  }

  // ── Durry intro ────────────────────────────────────────────────
  if (phase === "durry_intro") {
    return (
      <div style={S.container}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>⚡</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: "#10B981", margin: "0 0 8px", textShadow: "0 0 30px #10B98166" }}>A NEW CHALLENGER</h1>
        <p style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: 2, marginBottom: 24, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>DURRY IS ENTERING THE ARENA</p>
        <div style={{ fontSize: 20, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>Watch the big screen!</div>
      </div>
    );
  }

  // ── AI running (clean) + AI clean results ─────────────────────
  if (phase === "ai_running" || phase === "ai_clean_results") {
    const myCost = simulatePlayerCost(myDecisions);
    return (
      <div style={S.container}>
        <div style={{ fontSize: 64, marginBottom: 12, animation: "spin 2s linear infinite" }}>⚡</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: "#10B981", margin: "0 0 8px", textShadow: "0 0 30px #10B98166" }}>ROUND 2</h1>
        <p style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: 2, marginBottom: 20, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>DURRY IS PLAYING WITH CLEAN DATA</p>
        <div style={{ ...S.card, borderColor: "#10B98144" }}>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: "#10B981", letterSpacing: 3, marginBottom: 8 }}>YOUR ROUND 1 COST</div>
          <div style={{ fontFamily: "monospace", fontSize: 42, fontWeight: 900, color: "#F59E0B", textAlign: "center" }}>
            ${myCost.toFixed(0)}
          </div>
          <p style={{ fontSize: 18, color: "#aaa", textAlign: "center", marginTop: 8 }}>
            Can Durry beat your score?
          </p>
        </div>
        {aiCleanCost != null && (
          <div style={{ ...S.card, borderColor: "#10B98144" }}>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#10B981", letterSpacing: 3, marginBottom: 8 }}>DURRY'S COST (CLEAN DATA)</div>
            <div style={{ fontFamily: "monospace", fontSize: 42, fontWeight: 900, color: "#10B981", textAlign: "center" }}>
              ${aiCleanCost.toFixed(0)}
            </div>
            <p style={{ fontSize: 18, color: "#10B981", textAlign: "center", marginTop: 8, fontWeight: 700 }}>
              {aiCleanCost < myCost ? `${((1 - aiCleanCost / myCost) * 100).toFixed(0)}% cheaper than you` : "You beat the AI!"}
            </p>
          </div>
        )}
        <div style={{ fontSize: 20, color: "#fff", marginTop: 16, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>Watch the big screen!</div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes blink{50%{opacity:0}}`}</style>
      </div>
    );
  }

  // ── GIGO reveal ────────────────────────────────────────────────
  if (phase === "gigo_reveal") {
    return (
      <div style={{ ...S.container, background: "#0a0000" }}>
        <div style={{ fontSize: 80, marginBottom: 12 }}>☠️</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: "#EF4444", margin: "0 0 4px", textShadow: "0 0 30px #EF444466" }}>GARBAGE IN</h1>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: "#EF4444", margin: "0 0 16px", textShadow: "0 0 30px #EF444466" }}>GARBAGE OUT</h1>
        <div style={{ ...S.card, borderColor: "#EF444444" }}>
          <p style={{ fontSize: 18, color: "#EF4444", margin: 0, lineHeight: 1.7 }}>
            The AI's data has been corrupted.
          </p>
        </div>
        <div style={{ fontSize: 20, color: "#fff", marginTop: 16, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>Watch the big screen…</div>
      </div>
    );
  }

  // ── AI dirty + AI dirty results ────────────────────────────────
  if (phase === "ai_dirty" || phase === "ai_dirty_results") {
    const myCost = simulatePlayerCost(myDecisions);
    return (
      <div style={{ ...S.container, background: "#0a0000" }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>☠️</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: "#EF4444", margin: "0 0 8px", textShadow: "0 0 30px #EF444466" }}>ROUND 3</h1>
        <p style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: 2, marginBottom: 20, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>AI WITH CORRUPT DATA</p>
        <div style={{ ...S.card, borderColor: "#EF444444" }}>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: "#EF4444", letterSpacing: 3, marginBottom: 8 }}>SAP BUGS ACTIVE</div>
          <p style={{ fontSize: 18, color: "#aaa", margin: 0, lineHeight: 1.7 }}>
            Phantom inventory. Wrong lead times. Stale demand.
            Same algorithm — different outcome.
          </p>
        </div>
        {aiDirtyCost != null && (
          <div style={{ ...S.card, borderColor: "#EF444444" }}>
            <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 13, color: "#888", fontFamily: "monospace", letterSpacing: 2 }}>YOU</div>
                <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 900, color: "#F59E0B" }}>${myCost.toFixed(0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#888", fontFamily: "monospace", letterSpacing: 2 }}>DURRY (DIRTY)</div>
                <div style={{ fontFamily: "monospace", fontSize: 32, fontWeight: 900, color: "#EF4444" }}>${aiDirtyCost.toFixed(0)}</div>
              </div>
            </div>
          </div>
        )}
        <div style={{ fontSize: 20, color: "#fff", marginTop: 16, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>Watch the cost explode on screen</div>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────
  if (phase === "results") {
    const myCost = simulatePlayerCost(myDecisions);
    const gc = aiCleanCost ?? 0;
    const dc = aiDirtyCost ?? 0;
    const scores = [
      { label: "YOU", cost: myCost, col: "#F59E0B", icon: player?.emoji ?? "👤" },
      { label: "DURRY (CLEAN)", cost: gc, col: "#10B981", icon: "⚡" },
      { label: "GLITCH (DIRTY)", cost: dc, col: "#EF4444", icon: "☠️" },
    ].sort((a, b) => a.cost - b.cost);

    return (
      <div style={S.container}>
        <div style={{ fontSize: 64, marginBottom: 8 }}>🏆</div>
        <h1 style={{ fontSize: 48, fontWeight: 900, color: "#F59E0B", margin: "0 0 8px", textShadow: "0 0 20px #F59E0B44" }}>GAME OVER</h1>

        {myRank != null && playerCount > 0 && (
          <div style={{
            fontFamily: "monospace", fontSize: 20, fontWeight: 900,
            color: myRank <= 3 ? "#10B981" : "#aaa", marginBottom: 16,
          }}>
            {myRank <= 3 ? ["🥇", "🥈", "🥉"][myRank - 1] + " " : ""}
            YOU FINISHED #{myRank} of {playerCount}
          </div>
        )}

        <div style={{ maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {scores.map((s, idx) => {
            const isMe = s.label === "YOU";
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <div key={s.label} style={{
                background: isMe ? `${s.col}15` : "#0a0a0a",
                border: `2px solid ${isMe ? s.col : s.col + "44"}`,
                borderRadius: 12, padding: "12px 16px",
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ fontSize: 24 }}>{medals[idx]}</div>
                <div style={{ fontSize: 24 }}>{s.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 900, fontSize: 18, color: isMe ? "#fff" : "#bbb" }}>
                    {s.label}
                  </div>
                </div>
                <div style={{
                  fontFamily: "monospace", fontWeight: 900,
                  fontSize: isMe ? 22 : 18, color: s.col,
                }}>
                  ${s.cost.toFixed(0)}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ ...S.card, borderColor: "#F59E0B44" }}>
          <p style={{ fontSize: 18, color: "#aaa", margin: 0, lineHeight: 1.7 }}>
            AI doesn't fail because of bad models.
            It fails because of <strong style={{ color: "#EF4444" }}>bad data</strong>.
          </p>
          <p style={{ fontSize: 20, color: "#F59E0B", fontWeight: 900, marginTop: 16, margin: "16px 0 0" }}>
            What data are you feeding your AI?
          </p>
        </div>
        <div style={{ marginTop: 24, textAlign: "center" }}>
          <div style={{
            fontFamily: "monospace", fontSize: 18, fontWeight: 900, letterSpacing: 3,
            background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            TetriXX
          </div>
          <div style={{ color: "#888", fontSize: 13, marginTop: 4, fontFamily: "monospace" }}>
            tetrixx.io
          </div>
          <div style={{ color: "#555", fontSize: 11, marginTop: 4 }}>
            Automating complexity, delivering clarity
          </div>
        </div>
      </div>
    );
  }

  // ── Ended — game over brand screen ────────────────────────────
  if (phase === "ended") {
    const myCost = simulatePlayerCost(myDecisions);
    return (
      <div style={{ ...S.bgScreen, backgroundImage: "url(/can1.png)" }}>
        <div style={{ ...S.overlay, background: "rgba(0,0,0,0.75)" }} />
        <div style={S.centerContent}>
          <img
            src="/can1.png"
            alt="Durian Rush"
            style={{ width: 200, height: 200, objectFit: "contain", marginBottom: 16, borderRadius: 16 }}
          />
          <h1 style={{
            fontSize: 42, fontWeight: 900, margin: "0 0 8px",
            background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            DURIAN RUSH
          </h1>
          <div style={{
            fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 8,
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            Thanks for playing! 🎮
          </div>
          <div style={{
            fontFamily: "monospace", fontSize: 14, color: "#aaa",
            letterSpacing: 2, marginBottom: 24,
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            THE SUPPLY CHAIN CHALLENGE
          </div>

          {player && myRank != null && (
            <div style={{
              background: "rgba(0,0,0,0.6)", borderRadius: 12, padding: "12px 24px",
              marginBottom: 32, border: "1px solid #F59E0B33",
            }}>
              <div style={{
                fontFamily: "monospace", fontSize: 16, color: "#F59E0B", fontWeight: 900,
              }}>
                {myRank <= 3 ? ["🥇", "🥈", "🥉"][myRank - 1] + " " : ""}
                You finished #{myRank} with ${myCost.toFixed(0)}
              </div>
            </div>
          )}

          <div style={{
            borderTop: "1px solid #333", paddingTop: 24, marginTop: 8,
            textAlign: "center", width: "100%",
          }}>
            <div style={{ color: "#aaa", fontSize: 14, marginBottom: 8 }}>
              Connect with TetriXX
            </div>
            <div style={{
              fontFamily: "monospace", fontSize: 22, fontWeight: 900, letterSpacing: 3,
              background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              marginBottom: 6,
            }}>
              tetrixx.io
            </div>
            <div style={{ color: "#555", fontSize: 11 }}>
              Automating complexity, delivering clarity for a sustainable future
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Unknown phase fallback ─────────────────────────────────────
  return (
    <div style={S.container}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>📡</div>
      <p style={S.subtitle}>CONNECTED</p>
      <p style={{ color: "#555", fontSize: 12 }}>Phase: {phase}</p>
      <div style={S.footer}>Watch the big screen</div>
    </div>
  );
}

const S = {
  // ── Full-screen background screens ──
  bgScreen: {
    minHeight: "100vh",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 0,
  },
  centerContent: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "32px 20px",
    width: "100%",
    maxWidth: 420,
  },
  glassCard: {
    background: "rgba(0,0,0,0.75)",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    boxSizing: "border-box",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  cardHeading: {
    fontSize: 24,
    fontWeight: 900,
    background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    marginBottom: 20,
  },
  input: {
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: 16,
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  goldBtn: {
    background: "linear-gradient(135deg, #F59E0B, #D97706)",
    color: "#000",
    border: "none",
    borderRadius: 12,
    padding: "16px",
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "monospace",
    letterSpacing: 2,
    boxShadow: "0 0 20px #F59E0B33",
    width: "100%",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#F59E0B",
    fontSize: 13,
    cursor: "pointer",
    textDecoration: "underline",
    fontFamily: "monospace",
  },
  skipBtn: {
    background: "none",
    border: "none",
    color: "#555",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "monospace",
    letterSpacing: 1,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    fontFamily: "monospace",
  },
  footerAbsolute: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    textAlign: "center",
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontFamily: "monospace",
    zIndex: 1,
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  },
  // ── Standard screens (non-background-image) ──
  container: {
    minHeight: "100vh",
    background: "#050505",
    color: "#fff",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px 24px",
    textAlign: "center",
  },
  title: {
    fontSize: 48,
    fontWeight: 900,
    margin: "0 0 8px",
    letterSpacing: -1,
    background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  },
  subtitle: {
    fontFamily: "monospace",
    fontSize: 24,
    fontWeight: 700,
    color: "#fff",
    letterSpacing: 2,
    marginBottom: 24,
    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  },
  card: {
    background: "#0a0a0a",
    border: "1px solid #1a1a1a",
    borderRadius: 14,
    padding: "20px 24px",
    maxWidth: 360,
    width: "100%",
    marginBottom: 16,
  },
  cardTitle: {
    fontFamily: "monospace",
    fontSize: 10,
    color: "#555",
    letterSpacing: 3,
    marginBottom: 10,
  },
  cardBody: {
    color: "#aaa",
    fontSize: 18,
    lineHeight: 1.7,
    margin: 0,
  },
  footer: {
    marginTop: 24,
    color: "#555",
    fontSize: 14,
    fontFamily: "monospace",
  },
  loadingText: {
    fontFamily: "monospace",
    fontSize: 14,
    color: "#555",
    letterSpacing: 2,
  },
  spinner: {
    fontSize: 48,
    marginBottom: 16,
    animation: "pulse 1.5s ease-in-out infinite",
  },
};
