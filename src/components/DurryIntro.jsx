import { useState, useRef, useEffect } from "react";

export default function DurryIntro({ humanCost, onComplete }) {
  const [videoEnded, setVideoEnded] = useState(false);
  const videoRef = useRef(null);

  // Fallback: if video fails to load, skip to VS screen after 2s
  useEffect(() => {
    const fallback = setTimeout(() => setVideoEnded(true), 12000);
    return () => clearTimeout(fallback);
  }, []);

  if (!videoEnded) {
    return (
      <div style={styles.fullscreen}>
        <video
          ref={videoRef}
          src="/durry.mp4"
          autoPlay
          playsInline
          muted={false}
          onEnded={() => setVideoEnded(true)}
          onError={() => setVideoEnded(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <button
          onClick={() => setVideoEnded(true)}
          style={styles.skipBtn}
        >
          SKIP ⏭
        </button>
      </div>
    );
  }

  // VS screen
  return (
    <div style={styles.vsScreen}>
      {/* Left: The Crowd */}
      <div style={styles.vsTeam}>
        <div style={{ fontSize: 64 }}>👥</div>
        <div style={styles.vsTeamName}>THE CROWD</div>
        <div style={{
          fontFamily: "monospace", fontSize: 48, fontWeight: 900,
          color: "#EF4444", textShadow: "0 0 30px #EF444466",
        }}>
          ${humanCost?.toLocaleString() ?? "—"}
        </div>
      </div>

      {/* Center: VS */}
      <div style={{
        fontSize: "clamp(64px, 15vw, 120px)",
        fontWeight: 900,
        color: "#fff",
        textShadow: "0 0 40px #ffffff44",
        fontFamily: "monospace",
        lineHeight: 1,
      }}>
        VS
      </div>

      {/* Right: Durry */}
      <div style={styles.vsTeam}>
        <img
          src="/durry.png"
          alt="Durry"
          style={{ width: 200, height: 200, objectFit: "contain" }}
        />
        <div style={{
          ...styles.vsTeamName,
          background: "linear-gradient(135deg, #F59E0B, #FCD34D)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          DURRY
        </div>
        <div style={{
          fontFamily: "monospace", fontSize: 48, fontWeight: 900,
          color: "#F59E0B", textShadow: "0 0 30px #F59E0B66",
        }}>
          ???
        </div>
      </div>

      {/* FIGHT button */}
      <button onClick={() => onComplete?.()} style={styles.fightBtn}>
        FIGHT! 🥊
      </button>

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 30px #F59E0B44; }
          50% { box-shadow: 0 0 60px #F59E0B88, 0 0 100px #F59E0B44; }
        }
      `}</style>
    </div>
  );
}

const styles = {
  fullscreen: {
    position: "fixed",
    inset: 0,
    background: "#000",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: {
    position: "absolute",
    top: 20,
    right: 20,
    background: "rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#888",
    borderRadius: 8,
    padding: "8px 16px",
    cursor: "pointer",
    fontFamily: "monospace",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    zIndex: 10000,
  },
  vsScreen: {
    position: "fixed",
    inset: 0,
    background: "#050505",
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "clamp(20px, 5vw, 60px)",
    padding: 32,
    flexWrap: "wrap",
  },
  vsTeam: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  vsTeamName: {
    fontSize: "clamp(20px, 4vw, 32px)",
    fontWeight: 900,
    color: "#ccc",
    letterSpacing: 4,
    fontFamily: "monospace",
  },
  fightBtn: {
    position: "absolute",
    bottom: "clamp(32px, 8vh, 80px)",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "clamp(20px, 4vw, 32px)",
    fontWeight: 900,
    padding: "18px 64px",
    background: "linear-gradient(135deg, #F59E0B, #D97706)",
    color: "#000",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    letterSpacing: 4,
    fontFamily: "monospace",
    animation: "pulseGlow 2s ease-in-out infinite",
    width: "min(90vw, 400px)",
    textAlign: "center",
  },
};
