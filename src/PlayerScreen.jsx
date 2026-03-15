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
  const [player, setPlayer] = useState(() => {
    try {
      const saved = sessionStorage.getItem("dr_player");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

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
  const formDataRef = useRef(null); // store form data during OTP

  // Game state
  const [currentWeek, setCurrentWeek] = useState(null);
  const [weekChoice, setWeekChoice] = useState(null);
  const [deadline, setDeadline] = useState(null);
  const prevWeekRef = useRef(null);

  // Player count for lobby
  const [playerCount, setPlayerCount] = useState(0);

  useEffect(() => {
    const unsub = onValue(ref(db, "game/phase"), (snap) => {
      setPhase(snap.val());
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onValue(ref(db, "game/currentWeek"), (snap) => {
      const w = snap.val();
      if (w === null) return;
      if (w !== prevWeekRef.current) {
        prevWeekRef.current = w;
        setCurrentWeek(w);
        setWeekChoice(null);
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

  // Player count listener
  useEffect(() => {
    const unsub = onValue(ref(db, "players"), (snap) => {
      const val = snap.val();
      setPlayerCount(val ? Object.keys(val).length : 0);
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

  const submitDecision = async (opt) => {
    if (!player || weekChoice) return;
    setWeekChoice(opt.key);
    await set(ref(db, `players/${player.uid}/decisions/week${currentWeek}`), {
      choice: opt.key,
      quantity: opt.value,
      timestamp: Date.now(),
    });
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
      if (!window._recaptchaVerifier) {
        window._recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
          size: "invisible",
        });
      }
      const result = await signInWithPhoneNumber(auth, fullPhone, window._recaptchaVerifier);
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
      if (!window._recaptchaVerifier) {
        window._recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, formDataRef.current.phone, window._recaptchaVerifier);
      setConfirmResult(result);
      setResendTimer(30);
      setOtpError(null);
    } catch (err) {
      setOtpError("Resend failed — use Skip below");
    }
  };

  if (loading) {
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
          <div style={S.cardTitle}>GAME HASN'T STARTED YET</div>
          <p style={S.cardBody}>
            Wait for the presenter to open the lobby.
            Keep this screen open.
          </p>
        </div>
        <div style={S.footer}>powered by TetriXX</div>
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
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 8 }}>📱</div>
            <div style={{ ...S.cardHeading, textAlign: "center" }}>CHECK YOUR PHONE</div>
            <p style={{ color: "#aaa", fontSize: 13, textAlign: "center", margin: "8px 0 20px" }}>
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
            <div style={{ textAlign: "center", marginTop: 20, borderTop: "1px solid #333", paddingTop: 16 }}>
              <button onClick={() => finishRegistration(false)} style={S.skipBtn}>
                SKIP VERIFICATION →
              </button>
            </div>
          </div>
        </div>
        <div style={S.footerAbsolute}>Powered by TetriXX</div>
        <div id="recaptcha-container" />
      </div>
    );
  }

  // ── Lobby — registration or waiting ─────────────────────────────
  if (phase === "lobby") {
    // Already registered → waiting screen
    if (player) {
      return (
        <div style={{ ...S.bgScreen, backgroundImage: "url(/can2.png)" }}>
          <div style={S.overlay} />
          <div style={S.centerContent}>
            <div style={{ fontSize: 80, marginBottom: 12 }}>{player.emoji}</div>
            <h1 style={{
              fontSize: 32, fontWeight: 900, margin: "0 0 8px",
              background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>
              {player.name.toUpperCase()}
            </h1>
            <div style={{
              color: "#aaa", fontSize: 14, marginBottom: 24,
              animation: "pulse 2s ease-in-out infinite",
            }}>
              WAITING FOR THE GAME TO START...
            </div>
            <div style={{
              background: "rgba(0,0,0,0.6)", borderRadius: 12, padding: "12px 24px",
              fontFamily: "monospace", fontSize: 16, color: "#10B981", fontWeight: 700,
            }}>
              🎮 {playerCount} players ready
            </div>
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
            fontSize: 40, fontWeight: 900, margin: "0 0 4px",
            background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            textAlign: "center",
          }}>
            DURIAN RUSH
          </h1>
          <p style={{
            color: "#fff", fontSize: 16, textAlign: "center",
            margin: "0 0 24px", letterSpacing: 2,
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

  // ── Round 1 — humans play ──────────────────────────────────────
  if (phase === "round1") {
    const week = currentWeek ?? 0;
    const demand = DEMAND[Math.min(week, N_WEEKS - 1)];
    const votes = buildVotes(week, demand, 12, 12);
    const ev = EVENTS[week];
    const locked = !!weekChoice;

    const secs = remaining != null ? Math.ceil(remaining / 1000) : null;
    const timerMin = secs != null ? Math.floor(secs / 60) : null;
    const timerSec = secs != null ? secs % 60 : null;
    const timerStr = secs != null ? `${timerMin}:${String(timerSec).padStart(2, "0")}` : null;
    const urgent = secs != null && secs <= 10;

    return (
      <div style={{ ...S.container, justifyContent: "flex-start", paddingTop: 16 }}>
        {/* Timer bar */}
        {timerStr != null && (
          <div style={{
            fontFamily: "monospace", fontSize: 18, fontWeight: 900,
            color: urgent ? "#EF4444" : "#F59E0B",
            marginBottom: 10,
            animation: urgent ? "blink .5s step-end infinite" : "none",
          }}>
            {"\u23F0"} {timerStr} remaining
          </div>
        )}
        {/* Header */}
        <div style={{
          fontFamily: "monospace", fontSize: 10, color: "#F59E0B",
          letterSpacing: 3, marginBottom: 8,
        }}>
          ROUND 1 · WEEK {week + 1} of {N_WEEKS}
        </div>
        <div style={{
          fontSize: "clamp(20px, 6vw, 32px)", fontWeight: 900, color: "#fff",
          marginBottom: 4,
        }}>
          Demand: {demand} cases
        </div>

        {/* Event card */}
        {ev && (
          <div style={{
            background: ev.bg, border: `1px solid ${ev.border}`,
            borderRadius: 10, padding: "10px 14px", marginBottom: 12,
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

        {/* Locked confirmation */}
        {locked && (
          <div style={{
            ...S.card, borderColor: "#10B98144",
            textAlign: "center", marginTop: 8,
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ ...S.cardTitle, color: "#10B981" }}>ORDER LOCKED</div>
            <p style={S.cardBody}>
              You chose <strong style={{ color: "#fff" }}>{weekChoice}</strong>. Waiting for next week…
            </p>
          </div>
        )}

        {/* Vote buttons */}
        {!locked && (
          <div style={{ maxWidth: 360, width: "100%", display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
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
                    borderRadius: 12, padding: "16px",
                    cursor: "pointer", textAlign: "left", width: "100%",
                    display: "flex", alignItems: "center", gap: 14,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%",
                    background: "#1a1a1a", border: `2px solid ${kc}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "monospace", fontWeight: 900, fontSize: 18,
                    color: kc, flexShrink: 0,
                  }}>
                    {opt.key}
                  </div>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: "#fff", fontFamily: "monospace" }}>
                      {opt.label} — {opt.value} cases
                    </div>
                    <div style={{ fontSize: 11, color: "#555", marginTop: 3 }}>{opt.detail}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ ...S.footer, marginTop: 20 }}>
          {player ? `${player.emoji} ${player.name}` : ""}
        </div>
        <style>{`@keyframes blink{50%{opacity:0}}`}</style>
      </div>
    );
  }

  // ── Durry intro ────────────────────────────────────────────────
  if (phase === "durry_intro") {
    return (
      <div style={S.container}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>⚡</div>
        <h1 style={{ ...S.title, color: "#10B981" }}>A NEW CHALLENGER</h1>
        <p style={S.subtitle}>DURRY IS ENTERING THE ARENA</p>
        <div style={S.footer}>Watch the big screen!</div>
      </div>
    );
  }

  // ── AI running (clean) ─────────────────────────────────────────
  if (phase === "ai_running") {
    const myCost = simulatePlayerCost(myDecisions);
    return (
      <div style={S.container}>
        <div style={{ fontSize: 48, marginBottom: 12, animation: "spin 2s linear infinite" }}>⚡</div>
        <h1 style={{ ...S.title, color: "#10B981" }}>ROUND 2</h1>
        <p style={S.subtitle}>DURRY IS PLAYING WITH CLEAN DATA</p>
        <div style={{ ...S.card, borderColor: "#10B98144" }}>
          <div style={{ ...S.cardTitle, color: "#10B981" }}>YOUR ROUND 1 COST</div>
          <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#F59E0B", textAlign: "center" }}>
            ${myCost.toFixed(0)}
          </div>
          <p style={{ ...S.cardBody, textAlign: "center", marginTop: 8 }}>
            Can Durry beat your score?
          </p>
        </div>
        {aiCleanCost != null && (
          <div style={{ ...S.card, borderColor: "#10B98144" }}>
            <div style={{ ...S.cardTitle, color: "#10B981" }}>DURRY'S COST (CLEAN DATA)</div>
            <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 900, color: "#10B981", textAlign: "center" }}>
              ${aiCleanCost.toFixed(0)}
            </div>
            <p style={{ ...S.cardBody, textAlign: "center", marginTop: 8, color: "#10B981" }}>
              {aiCleanCost < myCost ? `${((1 - aiCleanCost / myCost) * 100).toFixed(0)}% cheaper than you` : "You beat the AI!"}
            </p>
          </div>
        )}
        <div style={S.footer}>Watch the big screen!</div>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes blink{50%{opacity:0}}`}</style>
      </div>
    );
  }

  // ── GIGO reveal ────────────────────────────────────────────────
  if (phase === "gigo_reveal") {
    return (
      <div style={{ ...S.container, background: "#0a0000" }}>
        <div style={{ fontSize: 64, marginBottom: 12 }}>☠️</div>
        <h1 style={{ ...S.title, color: "#EF4444" }}>GARBAGE IN</h1>
        <h1 style={{ ...S.title, color: "#EF4444", marginTop: -8 }}>GARBAGE OUT</h1>
        <div style={{ ...S.card, borderColor: "#EF444444" }}>
          <p style={{ ...S.cardBody, color: "#EF4444" }}>
            The AI's data has been corrupted.
          </p>
        </div>
        <div style={S.footer}>Watch the big screen…</div>
      </div>
    );
  }

  // ── AI dirty ───────────────────────────────────────────────────
  if (phase === "ai_dirty") {
    const myCost = simulatePlayerCost(myDecisions);
    return (
      <div style={{ ...S.container, background: "#0a0000" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>☠️</div>
        <h1 style={{ ...S.title, color: "#EF4444" }}>ROUND 3</h1>
        <p style={S.subtitle}>AI WITH CORRUPT DATA</p>
        <div style={{ ...S.card, borderColor: "#EF444444" }}>
          <div style={{ ...S.cardTitle, color: "#EF4444" }}>SAP BUGS ACTIVE</div>
          <p style={S.cardBody}>
            Phantom inventory. Wrong lead times. Stale demand.
            Same algorithm — different outcome.
          </p>
        </div>
        {aiDirtyCost != null && (
          <div style={{ ...S.card, borderColor: "#EF444444" }}>
            <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", letterSpacing: 2 }}>YOU</div>
                <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 900, color: "#F59E0B" }}>${myCost.toFixed(0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", letterSpacing: 2 }}>DURRY (DIRTY)</div>
                <div style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 900, color: "#EF4444" }}>${aiDirtyCost.toFixed(0)}</div>
              </div>
            </div>
          </div>
        )}
        <div style={S.footer}>Watch the cost explode on screen</div>
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
      { label: "DURRY (DIRTY)", cost: dc, col: "#EF4444", icon: "☠️" },
    ].sort((a, b) => a.cost - b.cost);

    return (
      <div style={S.container}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🏆</div>
        <h1 style={{ ...S.title, color: "#F59E0B", fontSize: "clamp(24px, 8vw, 40px)" }}>GAME OVER</h1>
        <p style={S.subtitle}>THREE ROUNDS. ONE LESSON.</p>

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
                  <div style={{ fontWeight: 900, fontSize: 14, color: isMe ? "#fff" : "#bbb" }}>
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
          <p style={S.cardBody}>
            AI doesn't fail because of bad models.
            It fails because of <strong style={{ color: "#EF4444" }}>bad data</strong>.
          </p>
          <p style={{ ...S.cardBody, color: "#F59E0B", fontWeight: 700, marginTop: 12 }}>
            What data are you feeding your AI?
          </p>
        </div>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#F59E0B", letterSpacing: 3 }}>
            TetriXX
          </div>
          <div style={{ color: "#333", fontSize: 10, marginTop: 4 }}>
            Automating complexity, delivering clarity
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
    color: "rgba(255,255,255,0.4)",
    fontSize: 12,
    fontFamily: "monospace",
    zIndex: 1,
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
    fontSize: "clamp(32px, 10vw, 56px)",
    fontWeight: 900,
    margin: "0 0 8px",
    letterSpacing: -1,
    background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  subtitle: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#666",
    letterSpacing: 4,
    marginBottom: 24,
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
    color: "#888",
    fontSize: 14,
    lineHeight: 1.7,
    margin: 0,
  },
  footer: {
    marginTop: 24,
    color: "#2a2a2a",
    fontSize: 10,
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
