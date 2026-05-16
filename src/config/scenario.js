// ══════════════════════════════════════════════════════════════
// DURIAN RUSH — Scenario Configuration
//
// To localize this game for a different region or product:
//   1. Update PLAY_URL to your deployed player URL
//   2. Edit NODES with your supply chain tier names and locations
//   3. Edit DEMAND with your 10-week demand curve
//   4. Edit EVENTS with your scenario-specific disruptions
//   5. Adjust LEAD_TIMES, HOLD, and BACK for your cost structure
//   6. Edit SAP_BUGS to tune the dirty-data corruption amounts
//   7. Swap Durry assets in /public (durry_intro.mp4, durry_*.jpg)
// ══════════════════════════════════════════════════════════════

// ── Deployment ────────────────────────────────────────────────
// The URL shown on the QR code in the lobby. Set to your player URL.
export const PLAY_URL = import.meta.env.VITE_PLAY_URL || "https://durian-rush-kl.web.app/play";

// ── Supply chain tiers (retailer → distributor → factory → farm) ──
export const NODES = [
  { id: "retailer",    name: "KL Retailer",   city: "Bangsar, KL",         emoji: "🏪", color: "#F59E0B", flag: "🇲🇾" },
  { id: "distributor", name: "Shah Alam Hub", city: "Shah Alam, Selangor", emoji: "🚛", color: "#10B981", flag: "🗺️"  },
  { id: "factory",     name: "Ipoh Factory",  city: "Kinta Valley, Perak", emoji: "⚙️", color: "#3B82F6", flag: "🏭"  },
  { id: "farm",        name: "Penang Farm",   city: "Balik Pulau, Penang", emoji: "🌾", color: "#A855F7", flag: "🏝️"  },
];

// ── Lead times per tier (weeks) — index matches NODES order ──
export const LEAD_TIMES = [1, 2, 3, 1];

// ── Demand curve — 10 weeks (cases/week at retailer) ──────────
export const DEMAND = [4, 4, 4, 6, 12, 18, 8, 4, 4, 4];

// ── Cost parameters ───────────────────────────────────────────
export const HOLD = 0.5;  // $/case/week holding cost
export const BACK = 3.0;  // $/case/week stockout penalty

// ── Disruption events (keyed by week number, 1-indexed) ───────
export const EVENTS = {
  2: {
    emoji: "🌧️", badge: "WEATHER ALERT",
    title: "Penang monsoon alert",
    body: "Balik Pulau farms may slow harvest. Lead time risk to Ipoh.",
    bg: "#1E3A5F22", border: "#3B82F6",
  },
  3: {
    emoji: "🛒", badge: "PROMO LAUNCH",
    title: "JB Giant promo launches",
    body: "Giant Hypermarket JB — buy 2 get 1 free Musang King cans. Expect cross-border demand.",
    bg: "#78350F22", border: "#F59E0B",
  },
  4: {
    emoji: "🔴", badge: "CAUSEWAY SURGE",
    title: "Causeway surge — KL stock cut 35%",
    body: "Singapore demand pulling everything south. Shah Alam Hub rationing KL allocation to 65%.",
    bg: "#7F1D1D22", border: "#EF4444",
  },
  6: {
    emoji: "📉", badge: "PROMO ENDS",
    title: "JB promo ends — demand normalising",
    body: "Giant promo over. Causeway traffic back to normal. But your pipeline orders are still in transit…",
    bg: "#06402622", border: "#10B981",
  },
};

// ── Dirty data bugs (GIGO round) ─────────────────────────────
// phantomStock: extra inventory SAP thinks exists (but doesn't)
// leadTimeDelta: weeks subtracted from real lead time in SAP
// demandLag: how many weeks stale the demand data is
export const SAP_BUGS = { phantomStock: 15, leadTimeDelta: -1, demandLag: 3 };

// ── Game timing defaults (seconds) ───────────────────────────
export const DEFAULT_WEEK_TIMER = 20;  // auto-lock per week in round 1
