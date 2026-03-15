// ══════════════════════════════════════════════════════════════
// DURIAN RUSH — Pure Game Logic (no React, no Firebase)
// ══════════════════════════════════════════════════════════════

export const NODES = [
  { id:"retailer",    name:"KL Retailer",    city:"Bangsar, KL",         emoji:"🏪", color:"#F59E0B", flag:"🇲🇾" },
  { id:"distributor", name:"Shah Alam Hub",  city:"Shah Alam, Selangor", emoji:"🚛", color:"#10B981", flag:"🗺️" },
  { id:"factory",     name:"Ipoh Factory",   city:"Kinta Valley, Perak", emoji:"⚙️", color:"#3B82F6", flag:"🏭" },
  { id:"farm",        name:"Penang Farm",    city:"Balik Pulau, Penang", emoji:"🌾", color:"#A855F7", flag:"🏝️" },
];

export const LEAD_TIMES = [1, 2, 3, 1];
export const DEMAND = [4, 4, 4, 6, 12, 18, 8, 4, 4, 4];
export const N_WEEKS = DEMAND.length;
export const HOLD = 0.5;
export const BACK = 3.0;

export const EVENTS = {
  2: { emoji:"🌧️", badge:"WEATHER ALERT", title:"Penang monsoon alert", body:"Balik Pulau farms may slow harvest. Lead time risk to Ipoh.", bg:"#1E3A5F22", border:"#3B82F6" },
  3: { emoji:"🛒", badge:"PROMO LAUNCH", title:"JB Giant promo launches", body:"Giant Hypermarket JB — buy 2 get 1 free Musang King cans. Expect cross-border demand.", bg:"#78350F22", border:"#F59E0B" },
  4: { emoji:"🔴", badge:"CAUSEWAY SURGE", title:"Causeway surge — KL stock cut 35%", body:"Singapore demand pulling everything south. Shah Alam Hub rationing KL allocation to 65%.", bg:"#7F1D1D22", border:"#EF4444" },
  6: { emoji:"📉", badge:"PROMO ENDS", title:"JB promo ends — demand normalising", body:"Giant promo over. Causeway traffic back to normal. But your pipeline orders are still in transit…", bg:"#06402622", border:"#10B981" },
};

export const SAP_BUGS = { phantomStock: 15, leadTimeDelta: -1, demandLag: 3 };

export function buildVotes(week, demand, inv, pipelineTotal) {
  const opts = week < 3 ? [
    { label:"LEAN", value:demand,       detail:`${demand} cases — match demand exactly`,        col:"#10B981" },
    { label:"SAFE", value:demand+4,     detail:`${demand+4} cases — small buffer`,               col:"#F59E0B" },
    { label:"BIG",  value:demand+8,     detail:`${demand+8} cases — summer is coming lah!`,      col:"#F59E0B" },
    { label:"MIN",  value:Math.max(1,demand-1), detail:`${Math.max(1,demand-1)} cases — ultra lean`, col:"#888" },
  ] : week === 3 ? [
    { label:"BUFFER", value:demand+6,  detail:`${demand+6} — cover Penang rain risk`,           col:"#F59E0B" },
    { label:"MATCH",  value:demand,    detail:`${demand} — match demand only`,                  col:"#EF4444" },
    { label:"PANIC",  value:demand+14, detail:`${demand+14} — JB is pulling everything!`,       col:"#EF4444" },
    { label:"WAIT",   value:2,         detail:"2 cases — bold or foolish?",                     col:"#888" },
  ] : week <= 5 ? [
    { label:"×2",     value:demand*2,               detail:`${demand*2} — Singapore demand is real!`,  col:"#EF4444" },
    { label:"+10",    value:demand+10,               detail:`${demand+10} — distributor rationing KL`, col:"#EF4444" },
    { label:"+4",     value:demand+4,                detail:`${demand+4} — steady increase`,            col:"#F59E0B" },
    { label:"TRUST",  value:Math.max(2,Math.round(demand*0.4)), detail:`${pipelineTotal} already ordered`, col:"#888" },
  ] : [
    { label:"KEEP",   value:demand+8, detail:`${demand+8} — demand might spike again...`,       col:"#EF4444" },
    { label:"-3",     value:demand+3, detail:`${demand+3} — slowly normalise`,                  col:"#F59E0B" },
    { label:"MATCH",  value:demand,   detail:`${demand} — trust the data`,                      col:"#10B981" },
    { label:"STOP",   value:0,        detail:"0 cases — warehouse overflowing",                 col:"#888" },
  ];
  return opts.map((o, i) => ({ ...o, key: ["A","B","C","D"][i] }));
}

export function aiDecide(tier, demandHistory, dirty = false) {
  const onOrder = tier.pipeline.reduce((a, b) => a + b, 0);

  if (!dirty) {
    // ── CLEAN AI: Perfect data + demand sensing (look-ahead) ──
    // Sees NEXT period's demand (demand sensing / perfect visibility)
    const currentDemand = demandHistory[demandHistory.length - 1] ?? 4;
    const nextDemand = DEMAND[Math.min(demandHistory.length, N_WEEKS - 1)] ?? currentDemand;
    const safety = 2;
    const target = nextDemand * tier.leadTime + safety;
    const pos = tier.inventory - tier.backlog + onOrder;
    const order = Math.max(0, target - pos);

    return {
      order,
      reasoning: {
        smooth: nextDemand, inv: tier.inventory, onOrder, backlog: tier.backlog,
        lt: tier.leadTime, safety, cycle: nextDemand, target, pos, order,
        formula: `max(0, (${nextDemand}×${tier.leadTime}+${safety}) − (${tier.inventory}+${onOrder}−${tier.backlog}))`,
        verdict: order === 0 ? "Pipeline sufficient — hold"
               : order <= 3  ? "Minor top-up"
               : order <= 7  ? "Steady replenishment"
                             : "Scaling to meet demand",
        dirty: null,
      },
    };
  }

  // ── DIRTY AI: Corrupted SAP data ─────────────────────────────
  const inv = tier.inventory + SAP_BUGS.phantomStock;
  const lt  = Math.max(1, tier.leadTime + SAP_BUGS.leadTimeDelta);
  const hist = demandHistory.slice(0, Math.max(1, demandHistory.length - SAP_BUGS.demandLag));

  let smooth = hist[0] ?? 4;
  for (let i = 1; i < hist.length; i++) smooth = 0.3 * hist[i] + 0.7 * smooth;

  const safety  = Math.round(smooth * lt * 0.8);
  const cycle   = Math.round(smooth);
  const target  = safety + cycle;
  const pos     = inv - tier.backlog + onOrder;
  const order   = Math.max(0, target - pos);

  return {
    order,
    reasoning: {
      smooth: +smooth.toFixed(1), inv, onOrder, backlog: tier.backlog,
      lt, safety, cycle, target, pos, order,
      formula: `max(0, (${safety}+${cycle}) − (${inv}+${onOrder}−${tier.backlog}))`,
      verdict: order === 0 ? "Pipeline sufficient — hold"
             : order <= 3  ? "Minor top-up"
             : order <= 7  ? "Steady replenishment"
                           : "Recovering depleted buffer",
      dirty: {
        invNote: `SAP shows ${inv} — actual ${tier.inventory} (phantom +${SAP_BUGS.phantomStock})`,
        ltNote:  `SAP lead time ${lt}wk — actual ${tier.leadTime}wk (bridge not updated)`,
        demNote: hist.length < demandHistory.length
          ? `Demand ${SAP_BUGS.demandLag}wks stale (batch processing)` : null,
      },
    },
  };
}

function humanUpstream(tier, received, idx) {
  const fear = Math.max(0, 14 - tier.inventory) * 1.15;
  return Math.max(0, Math.round(received * (1.4 + idx * 0.2) + fear));
}

const newTier = (i) => ({
  inventory: 12, backlog: 0,
  pipeline: Array(LEAD_TIMES[i]).fill(4),
  leadTime: LEAD_TIMES[i],
  ordersPlaced: [], invHistory: [12], totalCost: 0,
  aiReasoning: null, _order: 0,
});

export const newGame = () => ({ week: 0, tiers: [0,1,2,3].map(newTier), demandSeen: [] });

export function stepGame(state, retailerOrder, mode) {
  const week  = state.week;
  const demand = DEMAND[week];
  const newDem = [...state.demandSeen, demand];
  const dirty  = mode === "ai_dirty";

  const T = state.tiers.map(t => ({
    ...t, pipeline: [...t.pipeline],
    ordersPlaced: [...t.ordersPlaced], invHistory: [...t.invHistory],
  }));

  for (let i = 0; i < 4; i++) { T[i].inventory += T[i].pipeline[0]; T[i].pipeline.shift(); }
  for (let i = 0; i < 4; i++) {
    const inc  = i === 0 ? demand : T[i-1]._order;
    const due  = inc + T[i].backlog;
    const ship = Math.min(due, T[i].inventory);
    T[i].inventory -= ship;
    T[i].backlog = Math.max(0, due - ship);
  }
  for (let i = 0; i < 4; i++) {
    let order = 0, reasoning = null;
    if (mode === "human") {
      order = i === 0 ? retailerOrder : humanUpstream(T[i], T[i-1]._order, i);
    } else {
      const res = aiDecide(T[i], newDem, dirty);
      order = res.order; reasoning = res.reasoning;
    }
    T[i]._order = order;
    T[i].ordersPlaced.push(order);
    T[i].pipeline.push(order);
    T[i].aiReasoning = reasoning;
    T[i].totalCost += T[i].inventory * HOLD + T[i].backlog * BACK;
    T[i].invHistory.push(T[i].inventory);
  }

  return { week: week + 1, tiers: T, demandSeen: newDem };
}

export function chainCost(g) { return g ? g.tiers.reduce((s, t) => s + t.totalCost, 0) : 0; }
export function retailerCost(g) { return g ? g.tiers[0].totalCost : 0; }

export function simulatePlayerCost(decisions) {
  if (!decisions) return 0;
  let inv = 12, backlog = 0, cost = 0, pipeline = [4];
  for (let w = 0; w < N_WEEKS; w++) {
    const d = decisions[`week${w}`];
    const order = d ? d.quantity : 0;
    inv += pipeline[0] || 0;
    pipeline.shift();
    const due = DEMAND[w] + backlog;
    const ship = Math.min(due, inv);
    inv -= ship;
    backlog = Math.max(0, due - ship);
    pipeline.push(order);
    cost += inv * HOLD + backlog * BACK;
  }
  return cost;
}

export function runFullAI(mode) {
  let g = newGame();
  for (let w = 0; w < N_WEEKS; w++) g = stepGame(g, 0, mode);
  return g;
}
