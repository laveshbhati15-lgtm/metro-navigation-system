#!/usr/bin/env node
// Verification script — runs outside Vitest to manually confirm routing scenarios
// Usage: node src/core/data/verify_routes.mjs

import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../../');

// Load JSON data
const stationsJson = JSON.parse(readFileSync(path.join(projectRoot, 'src/core/data/stations.json'), 'utf8'));
const connectionsJson = JSON.parse(readFileSync(path.join(projectRoot, 'src/core/data/connections.json'), 'utf8'));

// ── MinHeap Implementation ──────────────────────────────────────────────────

class MinHeap {
  constructor() { this.heap = []; }
  get size() { return this.heap.length; }
  isEmpty() { return this.heap.length === 0; }
  insert(value, priority) { this.heap.push({ priority, value }); this.bubbleUp(this.heap.length - 1); }
  extractMin() {
    if (this.isEmpty()) throw new Error('empty');
    const min = this.heap[0];
    const last = this.heap.pop();
    if (!this.isEmpty()) { this.heap[0] = last; this.sinkDown(0); }
    return min;
  }
  bubbleUp(i) {
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.heap[p].priority <= this.heap[i].priority) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
      i = p;
    }
  }
  sinkDown(i) {
    const len = this.heap.length;
    while (true) {
      let s = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < len && this.heap[l].priority < this.heap[s].priority) s = l;
      if (r < len && this.heap[r].priority < this.heap[s].priority) s = r;
      if (s === i) break;
      [this.heap[s], this.heap[i]] = [this.heap[i], this.heap[s]];
      i = s;
    }
  }
}

// ── Build Graph ─────────────────────────────────────────────────────────────

const stations = new Map();
const adjacency = new Map();
const seen = new Set();
for (const s of stationsJson.stations) {
  if (!seen.has(s.id)) {
    stations.set(s.id, s);
    adjacency.set(s.id, []);
    seen.add(s.id);
  }
}
for (const e of connectionsJson.edges) {
  if (!adjacency.has(e.from)) adjacency.set(e.from, []);
  if (!adjacency.has(e.to)) adjacency.set(e.to, []);
  adjacency.get(e.from).push({ targetId: e.to, edge: e });
  adjacency.get(e.to).push({ targetId: e.from, edge: { ...e, from: e.to, to: e.from } });
}

const stateKey = (nodeId, line) => `${nodeId}#${line ?? 'NONE'}`;

function dijkstra(src, dst, penalty = 180, strategy = 'FASTEST') {
  if (!stations.has(src) || !stations.has(dst)) return null;
  if (src === dst) {
    return {
      stations: [stations.get(src)],
      totalTimeSeconds: 0,
      interchanges: [],
      edges: [],
    };
  }

  const stateDist = {};
  const prev = {};
  const initKey = stateKey(src, null);
  stateDist[initKey] = 0;

  const pq = new MinHeap();
  pq.insert(initKey, 0);
  const fin = new Set();
  let winningKey = null;

  while (!pq.isEmpty()) {
    const { value: curKey, priority: d } = pq.extractMin();
    if (fin.has(curKey)) continue;
    fin.add(curKey);

    const [curNode, curArrivalLineRaw] = curKey.split('#');
    const curArrivalLine = curArrivalLineRaw === 'NONE' ? null : curArrivalLineRaw;

    if (curNode === dst) {
      winningKey = curKey;
      break;
    }

    for (const { targetId, edge } of (adjacency.get(curNode) || [])) {
      const isTransfer = curArrivalLine !== null && curArrivalLine !== edge.line;
      let w;
      if (strategy === 'FEWEST_INTERCHANGES') {
        w = edge.travelTimeSeconds + (isTransfer ? 100000 : 0);
      } else {
        w = edge.travelTimeSeconds + (isTransfer ? penalty : 0);
      }

      const nextKey = stateKey(targetId, edge.line);
      if (fin.has(nextKey)) continue;

      if (stateDist[nextKey] === undefined || d + w < stateDist[nextKey]) {
        stateDist[nextKey] = d + w;
        prev[nextKey] = { nodeId: curNode, arrivalLine: curArrivalLine, edge };
        pq.insert(nextKey, d + w);
      }
    }
  }

  if (!winningKey) return null;

  // Reconstruct path
  const path = [];
  const edges = [];
  let k = winningKey;
  while (k) {
    const p = prev[k];
    if (p) {
      const [nodeId] = k.split('#');
      path.unshift(nodeId);
      edges.unshift(p.edge);
      k = stateKey(p.nodeId, p.arrivalLine);
    } else {
      path.unshift(src);
      break;
    }
  }

  const stationList = path.map(id => stations.get(id));
  let time = 0;
  const interchanges = [];
  for (let i = 0; i < edges.length; i++) {
    time += edges[i].travelTimeSeconds;
    if (i > 0 && edges[i].line !== edges[i - 1].line) {
      time += penalty;
      interchanges.push(stationList[i]);
    }
  }

  return { stations: stationList, totalTimeSeconds: time, interchanges, edges };
}

// ── Test Scenarios ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name, result, expect) {
  const ok = expect(result);
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${name}`);
  if (!ok) {
    console.log('   Result:', JSON.stringify(result, null, 2).slice(0, 200));
    failed++;
  } else {
    passed++;
  }
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log('  Delhi Metro Navigator — Comprehensive Route Verification');
console.log('══════════════════════════════════════════════════════════════\n');

// ── 1. Data Integrity Audit ──
console.log('--- 1. Data Integrity & Topology ---');
const rawIds = stationsJson.stations.map(s => s.id);
const dupes = rawIds.filter((id, idx) => rawIds.indexOf(id) !== idx);
check('Duplicate Station IDs check in stations.json (must be 0)', dupes, d => d.length === 0);

const disconnectedStations = Array.from(stations.keys()).filter(id => (adjacency.get(id) || []).length === 0);
check('Isolated stations check (must be 0 in verified network)', disconnectedStations, d => d.length === 0);
console.log(`   Total verified stations: ${stations.size} | Total connections: ${connectionsJson.edges.length}`);

// ── 2. Route Verification Scenarios ──
console.log('\n--- 2. Routing Engine Core Cases ---');

// Case A: Fastest route between two stations on same line
const r1 = dijkstra('CHANDNI_CHOWK', 'HAUZ_KHAS');
check('Case A: Fastest route on same line (Chandni Chowk → Hauz Khas, direct, no interchange)', r1, r =>
  r !== null &&
  r.interchanges.length === 0 &&
  r.stations[0].id === 'CHANDNI_CHOWK' &&
  r.stations.at(-1).id === 'HAUZ_KHAS' &&
  r.totalTimeSeconds === 24 * 60 // 12 hops * 120s = 1440s = 24 min
);
if (r1) console.log(`   Time: ${r1.totalTimeSeconds / 60} min | Stations: ${r1.stations.length} | Interchanges: 0`);

// Case B: Route requiring an interchange at Rajiv Chowk
const r2 = dijkstra('CHANDNI_CHOWK', 'KAROL_BAGH', 180);
check('Case B: Route requiring interchange at Rajiv Chowk (Yellow → Blue)', r2, r =>
  r !== null &&
  r.interchanges.length === 1 &&
  r.interchanges[0].id === 'RAJIV_CHOWK' &&
  r.totalTimeSeconds === 900 // 6 edges * 120s (720s) + 180s interchange penalty = 900s
);
if (r2) console.log(`   Time: ${r2.totalTimeSeconds / 60} min | Stations: ${r2.stations.length} | Interchange at: ${r2.interchanges.map(s => s.name).join(', ')}`);

// Case C: Source and destination are the same
const r3 = dijkstra('RAJIV_CHOWK', 'RAJIV_CHOWK');
check('Case C: Same source & destination (Rajiv Chowk → Rajiv Chowk)', r3, r =>
  r !== null &&
  r.totalTimeSeconds === 0 &&
  r.stations.length === 1 &&
  r.edges.length === 0 &&
  r.interchanges.length === 0
);
if (r3) console.log(`   Time: ${r3.totalTimeSeconds} s | Stations: ${r3.stations.length}`);

// Case D: Invalid or unknown station
const r4a = dijkstra('RAJIV_CHOWK', 'GHOST_STATION_XYZ');
check('Case D1: Invalid destination station returns null', r4a, r => r === null);

const r4b = dijkstra('NONEXISTENT_STATION', 'RAJIV_CHOWK');
check('Case D2: Unknown source station returns null', r4b, r => r === null);

// Case E: Unreachable destination / disconnected network
// Add an isolated test station into the graph to explicitly test disconnected subgraph routing
stations.set('DISCONNECTED_TEST_STATION', {
  id: 'DISCONNECTED_TEST_STATION',
  name: 'Disconnected Test Station',
  lines: ['BLUE'],
  coordinates: { lat: 28.6, lng: 77.2 },
  isInterchange: false,
});
adjacency.set('DISCONNECTED_TEST_STATION', []);

const r5 = dijkstra('RAJIV_CHOWK', 'DISCONNECTED_TEST_STATION');
check('Case E: Unreachable destination on disconnected network returns null', r5, r => r === null);
console.log(`   Result for connected → disconnected test node: ${r5 === null ? 'null (correctly unreachable)' : 'FAILED'}`);

// ── 3. Branching, Edge Weights & Interchange Penalties ──
console.log('\n--- 3. Blue Line Branches & Penalty Calculations ---');

// Blue Line branch: Dwarka Sec 21 → Vaishali (Branch 1, 41 stations)
const rBranch1 = dijkstra('DWARKA_SEC_21', 'VAISHALI');
check('Blue Line Branch 1: Dwarka Sec 21 → Vaishali via Yamuna Bank & Laxmi Nagar (41 stations, 80 min)', rBranch1, r => {
  if (!r) return false;
  const ids = r.stations.map(s => s.id);
  return r.interchanges.length === 0 &&
    ids.includes('YAMUNA_BANK') &&
    ids.includes('LAXMI_NAGAR') &&
    !ids.includes('AKSHARDHAM') &&
    r.stations.length === 41 &&
    r.stations.at(-1).id === 'VAISHALI';
});
if (rBranch1) console.log(`   Time: ${rBranch1.totalTimeSeconds / 60} min | Stations: ${rBranch1.stations.length}`);

// Blue Line branch: Dwarka Sec 21 → Noida Electronic City (Branch 2 direct, 50 stations)
const rBranch2 = dijkstra('DWARKA_SEC_21', 'NOIDA_ELECTRONIC_CITY', 180, 'FEWEST_INTERCHANGES');
check('Blue Line Branch 2: Dwarka Sec 21 → Noida Electronic City via Yamuna Bank & Akshardham (50 stations, 98 min)', rBranch2, r => {
  if (!r) return false;
  const ids = r.stations.map(s => s.id);
  return r.interchanges.length === 0 &&
    ids.includes('YAMUNA_BANK') &&
    ids.includes('AKSHARDHAM') &&
    !ids.includes('LAXMI_NAGAR') &&
    r.stations.length === 50 &&
    r.stations.at(-1).id === 'NOIDA_ELECTRONIC_CITY';
});
if (rBranch2) console.log(`   Time: ${rBranch2.totalTimeSeconds / 60} min | Stations: ${rBranch2.stations.length}`);

// Fastest variant taking Magenta Line bypass between Janakpuri West and Botanical Garden
const rBranch2Fastest = dijkstra('DWARKA_SEC_21', 'NOIDA_ELECTRONIC_CITY', 180, 'FASTEST');
check('Cross-network Fastest route: Dwarka Sec 21 → Noida Electronic City via Magenta bypass (46 stations, 96 min)', rBranch2Fastest, r => {
  if (!r) return false;
  return r.stations.length === 46 && r.interchanges.length === 2 && r.totalTimeSeconds === 5760;
});
if (rBranch2Fastest) console.log(`   Time: ${rBranch2Fastest.totalTimeSeconds / 60} min | Stations: ${rBranch2Fastest.stations.length}`);

// Newly connected Nawada station verification
const rNawada = dijkstra('DWARKA_SEC_21', 'NAWADA');
check('Newly verified station sequence: Dwarka Sec 21 → Nawada (direct Blue Line path)', rNawada, r =>
  r !== null && r.interchanges.length === 0 && r.stations.length === 11 && r.stations.at(-1).id === 'NAWADA'
);
if (rNawada) console.log(`   Time: ${rNawada.totalTimeSeconds / 60} min | Stations: ${rNawada.stations.length}`);

// Edge weights and dynamic interchange penalty check
const rPenaltyCustom = dijkstra('CHANDNI_CHOWK', 'KAROL_BAGH', 300);
check('Dynamic interchange penalty: 300s penalty produces 1020s total time', rPenaltyCustom, r =>
  r !== null && r.totalTimeSeconds === (6 * 120 + 300)
);

// End-to-end Yellow Line
const rYellowFull = dijkstra('SAMAYPUR_BADLI', 'HUDA_CITY_CENTRE');
check('Full Yellow Line traversal: Samaypur Badli → HUDA City Centre (37 stations, 36 edges)', rYellowFull, r =>
  r !== null && r.stations.length === 37 && r.edges.length === 36 && r.totalTimeSeconds === 36 * 120
);

// Official DMRC Corridor: Kashmere Gate → Botanical Garden
const rKgBg = dijkstra('KASHMERE_GATE', 'BOTANICAL_GARDEN');
check('Official Corridor: Kashmere Gate → Botanical Garden (17 stations, Mandi House interchange)', rKgBg, r => {
  if (!r) return false;
  const ids = r.stations.map(s => s.id);
  const expected = [
    'KASHMERE_GATE', 'LAL_QILA', 'JAMA_MASJID', 'DELHI_GATE', 'ITO', 'MANDI_HOUSE',
    'SUPREME_COURT', 'INDRAPRASTHA', 'YAMUNA_BANK', 'AKSHARDHAM', 'MAYUR_VIHAR_1',
    'MAYUR_VIHAR_EXTENSION', 'NEW_ASHOK_NAGAR', 'NOIDA_SEC_15', 'NOIDA_SEC_16',
    'NOIDA_SEC_18', 'BOTANICAL_GARDEN',
  ];
  return r.stations.length === 17 &&
    r.interchanges.length === 1 &&
    r.interchanges[0].id === 'MANDI_HOUSE' &&
    expected.every((id, idx) => ids[idx] === id);
});
if (rKgBg) console.log(`   Time: ${rKgBg.totalTimeSeconds / 60} min | Stations: ${rKgBg.stations.length} | Interchange: ${rKgBg.interchanges[0].name}`);

// Summary
console.log(`\n══════════════════════════════════════════════════════════════`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(`══════════════════════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
