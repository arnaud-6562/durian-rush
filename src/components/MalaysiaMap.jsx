import { useEffect, useRef } from "react";

// ── Simplified peninsular Malaysia SVG outline ──────────────────
// Stylized, recognizable shape — not cartographically precise.
const PENINSULA_PATH =
  "M 120 20 C 115 25, 108 30, 105 40 " +
  "C 100 55, 98 65, 100 80 " +
  "C 102 95, 108 110, 115 130 " +
  "C 120 145, 128 160, 135 180 " +
  "C 140 195, 148 210, 160 230 " +
  "C 168 245, 175 260, 185 280 " +
  "C 192 295, 200 310, 210 325 " +
  "C 218 340, 225 350, 235 360 " +
  "C 242 368, 248 372, 255 375 " +
  "C 265 378, 272 376, 278 370 " +
  "C 285 362, 288 352, 290 340 " +
  "C 293 325, 290 310, 285 295 " +
  "C 278 275, 270 260, 265 245 " +
  "C 258 225, 252 210, 248 195 " +
  "C 242 175, 238 160, 235 145 " +
  "C 230 125, 225 110, 218 95 " +
  "C 210 78, 200 65, 190 55 " +
  "C 178 42, 165 32, 152 25 " +
  "C 140 18, 130 17, 120 20 Z";

// Penang island (small blob northwest)
const PENANG_ISLAND =
  "M 88 62 C 85 58, 80 56, 78 60 C 76 65, 78 72, 82 75 C 86 78, 90 76, 92 72 C 94 67, 92 63, 88 62 Z";

// ── Supply chain nodes ──────────────────────────────────────────
const NODES = [
  { id: "farm",        x: 85,  y: 68,  emoji: "🌾", label: "PENANG FARM",    color: "#A855F7", sub: "Balik Pulau" },
  { id: "factory",     x: 140, y: 145, emoji: "🏭", label: "IPOH FACTORY",   color: "#3B82F6", sub: "Kinta Valley" },
  { id: "distributor", x: 255, y: 285, emoji: "🚛", label: "SHAH ALAM HUB",  color: "#F59E0B", sub: "Selangor" },
  { id: "retailer",    x: 270, y: 310, emoji: "🏪", label: "BANGSAR KL",     color: "#10B981", sub: "Kuala Lumpur" },
];

// ── Route segments (SVG polyline points) ────────────────────────
const ROUTES = [
  { from: 0, to: 1, path: "M 85 68 C 100 95, 115 120, 140 145" },
  { from: 1, to: 2, path: "M 140 145 C 170 185, 220 240, 255 285" },
  { from: 2, to: 3, path: "M 255 285 C 260 293, 265 300, 270 310" },
];

export default function MalaysiaMap({ height = 300 }) {
  const svgRef = useRef(null);

  // Animate truck dots along paths
  useEffect(() => {
    // Trucks are animated via CSS — no JS needed
  }, []);

  return (
    <div style={{ width: "100%", height, position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox="30 0 310 400"
        style={{ width: "100%", height: "100%" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Glow filter for the peninsula */}
          <filter id="mapGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Node pulse glow */}
          <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Peninsula fill ─────────────────────────────── */}
        <path
          d={PENINSULA_PATH}
          fill="#1a1a2e"
          stroke="#F59E0B"
          strokeWidth="1.5"
          opacity="0.9"
          filter="url(#mapGlow)"
        />
        {/* Penang island */}
        <path
          d={PENANG_ISLAND}
          fill="#1a1a2e"
          stroke="#F59E0B"
          strokeWidth="1.2"
          opacity="0.9"
        />

        {/* ── Animated route lines ───────────────────────── */}
        {ROUTES.map((r, i) => (
          <g key={i}>
            {/* Static dim underline */}
            <path
              d={r.path}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="1.5"
              opacity="0.15"
            />
            {/* Animated dashed overlay */}
            <path
              d={r.path}
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2"
              strokeDasharray="8 6"
              opacity="0.6"
              className="route-dash"
              style={{ animationDelay: `${i * 0.4}s` }}
            />
          </g>
        ))}

        {/* ── Moving trucks ──────────────────────────────── */}
        {ROUTES.map((r, i) => (
          <g key={`truck-${i}`}>
            <circle r="0" fill="transparent">
              <animateMotion
                dur="3s"
                begin={`${i}s`}
                repeatCount="indefinite"
                path={r.path}
              />
            </circle>
            <text
              fontSize="16"
              textAnchor="middle"
              dominantBaseline="central"
              style={{ filter: "drop-shadow(0 0 4px #F59E0B)" }}
            >
              <animateMotion
                dur="3s"
                begin={`${i}s`}
                repeatCount="indefinite"
                path={r.path}
              />
              🚚
            </text>
          </g>
        ))}

        {/* ── Nodes: pulsing circles + labels ────────────── */}
        {NODES.map((n) => (
          <g key={n.id}>
            {/* Pulse ring */}
            <circle
              cx={n.x} cy={n.y} r="12"
              fill="none" stroke={n.color} strokeWidth="1.5" opacity="0.4"
              className="node-pulse"
            />
            {/* Core dot */}
            <circle
              cx={n.x} cy={n.y} r="6"
              fill={n.color} opacity="0.9"
              filter="url(#nodeGlow)"
            />
            {/* Emoji */}
            <text
              x={n.x} y={n.y - 18}
              textAnchor="middle" fontSize="18"
            >
              {n.emoji}
            </text>
            {/* Label */}
            <text
              x={n.x} y={n.y + 22}
              textAnchor="middle"
              fill={n.color}
              fontSize="8"
              fontFamily="monospace"
              fontWeight="900"
              letterSpacing="1"
            >
              {n.label}
            </text>
            {/* Sub-label */}
            <text
              x={n.x} y={n.y + 32}
              textAnchor="middle"
              fill="#555"
              fontSize="6.5"
              fontFamily="monospace"
            >
              {n.sub}
            </text>
          </g>
        ))}

        {/* ── Lead time labels on route segments ─────────── */}
        <text x="105" y="100" fill="#F59E0B" fontSize="7" fontFamily="monospace" fontWeight="700" opacity="0.7" textAnchor="middle">3 WEEKS</text>
        <text x="195" y="220" fill="#F59E0B" fontSize="7" fontFamily="monospace" fontWeight="700" opacity="0.7" textAnchor="middle">2 WEEKS</text>
        <text x="268" y="296" fill="#F59E0B" fontSize="7" fontFamily="monospace" fontWeight="700" opacity="0.7" textAnchor="middle">1 WEEK</text>
      </svg>

      {/* ── CSS Animations ───────────────────────────────── */}
      <style>{`
        .route-dash {
          animation: dashFlow 2s linear infinite;
        }
        @keyframes dashFlow {
          to { stroke-dashoffset: -28; }
        }
        .node-pulse {
          animation: nodePulse 2s ease-in-out infinite;
          transform-origin: center;
        }
        @keyframes nodePulse {
          0%, 100% { r: 10; opacity: 0.2; }
          50% { r: 16; opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
