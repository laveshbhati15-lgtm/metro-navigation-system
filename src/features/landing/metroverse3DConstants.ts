/**
 * metroverse3DConstants — Authoritative 3D Coordinates and Geometric Curves
 *
 * Defines the shared 3D path, station milestones, and physical viaduct markers
 * used by Three.js rendering and automated testing.
 */

import * as THREE from 'three';

/* ─── Authoritative 3D Railway Path ──────────────────────────────── */
export const TRACK_3D_POINTS = [
  new THREE.Vector3(14, 5.2, -45),   // Distant North horizon
  new THREE.Vector3(12, 5.0, -30),   // Kashmere Gate Platform
  new THREE.Vector3(8, 4.8, -14),    // Commercial high-rise corridor
  new THREE.Vector3(5, 4.5, 0),      // Rajiv Chowk Interchange (crossing Blue Line)
  new THREE.Vector3(7, 4.2, 16),     // Transition curve south
  new THREE.Vector3(10, 4.0, 32),    // Hauz Khas Concourse
  new THREE.Vector3(8, 3.8, 48),     // Approaching Southwest corridor
  new THREE.Vector3(4, 3.6, 62),     // Metroverse Terminus Platform
];

export const track3DCurve = new THREE.CatmullRomCurve3(TRACK_3D_POINTS, false, 'catmullrom', 0.35);

/* ─── Station Milestones in 3D Space ─────────────────────────────── */
export const STATIONS_3D = [
  { id: 'KASHMERE_GATE',  name: 'Kashmere Gate Platform', progress: 0.09, pos: new THREE.Vector3(12, 5.0, -30), line: 'yellow' },
  { id: 'RAJIV_CHOWK',    name: 'Rajiv Chowk Nexus',      progress: 0.36, pos: new THREE.Vector3(5, 4.5, 0),      line: 'both', isInterchange: true },
  { id: 'HAUZ_KHAS',      name: 'Hauz Khas Concourse',    progress: 0.64, pos: new THREE.Vector3(10, 4.0, 32),    line: 'yellow' },
  { id: 'TERMINAL_PORTAL',name: 'Metroverse Terminus',    progress: 0.96, pos: new THREE.Vector3(4, 3.6, 62),     line: 'blue' },
];

/* ─── Canonical 2D Fallback Path & Station Metrics (for Tests) ───── */
export const VIADUCT_TRACK_PATH =
  'M 1340,60 ' +
  'C 1280,140 1220,240 1180,360 ' +
  'C 1140,480 1120,620 1115,750 ' +
  'C 1100,920 1095,1100 1100,1250 ' +
  'C 1105,1420 1150,1650 1150,1850 ' +
  'C 1150,1980 1140,2050 1140,2100 ' +
  'C 1140,2250 1175,2450 1185,2650 ' +
  'C 1195,2850 1170,3050 1140,3250 ' +
  'C 1115,3380 1080,3450 1060,3480 ' +
  'L 1020,3510';

export const BLUE_CORRIDOR_PATH = 'M 820,1250 L 1400,1250';

export const ELEVATED_STATIONS = [
  { id: 'KASHMERE_GATE',  name: 'Kashmere Gate Platform', x: 1180, y: 360,  line: 'yellow', progress: 0.082 },
  { id: 'RAJIV_CHOWK',    name: 'Rajiv Chowk Nexus',      x: 1100, y: 1250, line: 'both',   progress: 0.342, isInterchange: true },
  { id: 'HAUZ_KHAS',      name: 'Hauz Khas Concourse',    x: 1140, y: 2100, line: 'yellow', progress: 0.588 },
  { id: 'TERMINAL_PORTAL',name: 'Metroverse Terminus',    x: 1060, y: 3480, line: 'blue',   progress: 0.965 },
];

export const VIADUCT_PILLARS = [
  { x: 1240, yTop: 180,  height: 200 },
  { x: 1180, yTop: 360,  height: 240, isStation: true },
  { x: 1140, yTop: 560,  height: 220 },
  { x: 1115, yTop: 750,  height: 240 },
  { x: 1100, yTop: 960,  height: 220 },
  { x: 1100, yTop: 1250, height: 280, isInterchange: true },
  { x: 1130, yTop: 1550, height: 220 },
  { x: 1150, yTop: 1850, height: 220 },
  { x: 1140, yTop: 2100, height: 260, isStation: true },
  { x: 1160, yTop: 2400, height: 220 },
  { x: 1185, yTop: 2650, height: 220 },
  { x: 1165, yTop: 2950, height: 220 },
  { x: 1140, yTop: 3250, height: 220 },
  { x: 1060, yTop: 3480, height: 240, isStation: true },
];
