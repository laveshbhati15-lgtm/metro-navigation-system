/**
 * Metroverse3DWorld — Cinematic Architectural 3D Delhi Metro World & Moving Train
 *
 * Implements a high-end, architectural 3D perspective visualization of Delhi at night:
 * - Three.js WebGL rendering with cinematic three-quarter perspective.
 * - Authoritative 3D Catmull-Rom curve traversing the city diagonally.
 * - Clean architectural 3D city: contemporary office towers, medium-height commercial blocks,
 *   glass-and-steel curtain walls with continuous ribbon windows, concrete structures, and rooftop HVAC units.
 * - Zero pixel art, zero chunky voxel blocks, zero dotted skylines.
 * - Physical elevated railway with concrete box girder deck, sleepers, twin steel rails, and support pillars.
 * - Rajiv Chowk multi-level interchange crossing with Blue Line cross-viaduct, station canopy, and signage.
 * - Custom articulated 3-car Delhi Metro EMU fleet (Lead Cab, Trailer Coach, Tail Cab)
 *   with wheels sitting directly on the rails and forward headlights casting light on the tracks.
 * - Dense, believable urban layering that eliminates empty black voids without blocking the train.
 * - Smooth scroll-driven train travel and camera tracking with reversible scrub.
 * - Scoped lifecycle cleanup, DPR handling, and prefers-reduced-motion support.
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { MetroRoute } from '@/core/graph/types';
import { track3DCurve, STATIONS_3D } from './metroverse3DConstants';

interface Metroverse3DWorldProps {
  reduced?: boolean;
  selectedRoute?: MetroRoute | null;
  triggerContainerRef: React.RefObject<HTMLElement | null>;
}

export function Metroverse3DWorld({
  reduced = false,
  triggerContainerRef,
}: Metroverse3DWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check WebGL availability
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      console.warn('WebGL not supported, falling back to static view');
      setWebglSupported(false);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    // ── Scene & Atmospheric Depth ───────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040814, 0.008);

    const camera = new THREE.PerspectiveCamera(
      36,
      window.innerWidth / window.innerHeight,
      0.5,
      300
    );

    // Initial camera position (Cinematic three-quarter isometric framing)
    const initialLead = track3DCurve.getPointAt(0.12);
    camera.position.set(initialLead.x - 13.5, initialLead.y + 7.5, initialLead.z - 15.5);
    camera.lookAt(initialLead.clone().add(new THREE.Vector3(0.5, 0.8, 3.5)));

    // View offset shifts the 3D scene to the right so the track & train never intersect the hero text
    const applyViewOffset = (w: number, h: number) => {
      if (w >= 1024) {
        camera.setViewOffset(w, h, -w * 0.32, 0, w, h);
      } else if (w >= 768) {
        camera.setViewOffset(w, h, -w * 0.16, 0, w, h);
      } else {
        camera.clearViewOffset();
      }
    };
    applyViewOffset(window.innerWidth, window.innerHeight);

    // ── Sophisticated Night Lighting ────────────────────────────────
    const ambientLight = new THREE.AmbientLight(0x1a263d, 1.4);
    scene.add(ambientLight);

    // Directional moonlight casting crisp metallic highlights on the train and rails
    const moonLight = new THREE.DirectionalLight(0xdce7f9, 2.4);
    moonLight.position.set(-28, 48, -24);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.width = 1024;
    moonLight.shadow.mapSize.height = 1024;
    moonLight.shadow.camera.near = 10;
    moonLight.shadow.camera.far = 130;
    moonLight.shadow.camera.left = -45;
    moonLight.shadow.camera.right = 45;
    moonLight.shadow.camera.top = 45;
    moonLight.shadow.camera.bottom = -45;
    scene.add(moonLight);

    // Soft cyan atmospheric fill light for architectural edge highlights
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(35, 24, 38);
    scene.add(rimLight);

    // Ground night sky bounce light
    const hemiLight = new THREE.HemisphereLight(0x1e293b, 0x050912, 0.6);
    scene.add(hemiLight);

    // ── Ground Infrastructure, Roads & Avenues ───────────────────────
    const groundGeo = new THREE.PlaneGeometry(240, 260);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x060c18,
      roughness: 0.95,
      metalness: 0.1,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = 0;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // Asphalt Avenue Grid with subtle lane dividers
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0c1424,
      roughness: 0.85,
    });
    const laneDashMat = new THREE.MeshBasicMaterial({ color: 0x334155 });

    const roadXPositions = [-25, -10, 4, 18, 32, 48];
    roadXPositions.forEach((rx) => {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 260), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(rx, 0.02, 0);
      scene.add(road);

      // Center dashed line
      for (let dz = -120; dz <= 120; dz += 8) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 3.5), laneDashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(rx, 0.03, dz);
        scene.add(dash);
      }
    });

    const roadZPositions = [-65, -45, -25, -5, 15, 35, 55, 75];
    roadZPositions.forEach((rz) => {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(240, 2.4), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.02, rz);
      scene.add(road);
    });

    // ── High-Res Architectural Facade Textures (Continuous Ribbon Floors) ──
    // 1. Corporate Ribbon Glass Facade (16 floors total, continuous floor plates, selective warm lighting)
    const glassCanvas = document.createElement('canvas');
    glassCanvas.width = 512;
    glassCanvas.height = 512;
    const gCtx = glassCanvas.getContext('2d');
    if (gCtx) {
      gCtx.fillStyle = '#0a1220';
      gCtx.fillRect(0, 0, 512, 512);

      const totalFloors = 16;
      const floorH = 512 / totalFloors;
      // Selective floors with warm interior office lights
      const litFloorIndices = [2, 5, 9, 13];

      for (let f = 0; f < totalFloors; f++) {
        const yTop = f * floorH;

        // Dark metallic spandrel beam (height ~10px)
        gCtx.fillStyle = '#141e30';
        gCtx.fillRect(0, yTop, 512, 9);

        // Thin architectural slab edge highlight
        gCtx.fillStyle = '#24344d';
        gCtx.fillRect(0, yTop, 512, 1.5);

        // Vision glass band for this floor
        const glassY = yTop + 9;
        const glassH = floorH - 10;

        const isLit = litFloorIndices.includes(f);
        if (isLit) {
          // Soft, continuous warm interior office glow across the floor
          const grad = gCtx.createLinearGradient(0, glassY, 0, glassY + glassH);
          grad.addColorStop(0, '#fde68a');
          grad.addColorStop(1, '#f59e0b');
          gCtx.fillStyle = grad;
          gCtx.globalAlpha = 0.55;
          gCtx.fillRect(0, glassY, 512, glassH);
          gCtx.globalAlpha = 1.0;
        } else {
          // Dark tinted corporate vision glass
          gCtx.fillStyle = '#070e1a';
          gCtx.fillRect(0, glassY, 512, glassH);
        }

        // Thin architectural structural mullions (only 6 columns across entire facade)
        gCtx.fillStyle = '#182438';
        for (let m = 0; m <= 512; m += 512 / 6) {
          gCtx.fillRect(m, glassY, 2.5, glassH);
        }
      }
    }
    const glassFacadeTexture = new THREE.CanvasTexture(glassCanvas);
    glassFacadeTexture.wrapS = THREE.RepeatWrapping;
    glassFacadeTexture.wrapT = THREE.RepeatWrapping;
    glassFacadeTexture.magFilter = THREE.LinearFilter;
    glassFacadeTexture.minFilter = THREE.LinearMipmapLinearFilter;
    glassFacadeTexture.generateMipmaps = true;

    // 2. Modern Precast Architectural Concrete Facade
    const concCanvas = document.createElement('canvas');
    concCanvas.width = 512;
    concCanvas.height = 512;
    const cCtx = concCanvas.getContext('2d');
    if (cCtx) {
      cCtx.fillStyle = '#1f2c3e';
      cCtx.fillRect(0, 0, 512, 512);

      const totalFloors = 12;
      const floorH = 512 / totalFloors;
      const litFloorIndices = [3, 8];

      for (let f = 0; f < totalFloors; f++) {
        const yTop = f * floorH;

        // Concrete spandrel band
        cCtx.fillStyle = '#26364c';
        cCtx.fillRect(0, yTop, 512, 12);
        cCtx.fillStyle = '#334866';
        cCtx.fillRect(0, yTop, 512, 1.5);

        // Recessed ribbon glass band
        const glassY = yTop + 12;
        const glassH = floorH - 13;

        const isLit = litFloorIndices.includes(f);
        if (isLit) {
          cCtx.fillStyle = '#fde68a';
          cCtx.globalAlpha = 0.5;
          cCtx.fillRect(0, glassY, 512, glassH);
          cCtx.globalAlpha = 1.0;
        } else {
          cCtx.fillStyle = '#0a121e';
          cCtx.fillRect(0, glassY, 512, glassH);
        }

        // Heavy concrete vertical structural piers (4 piers across facade)
        cCtx.fillStyle = '#1f2c3e';
        for (let m = 0; m <= 512; m += 512 / 4) {
          cCtx.fillRect(m - 3, yTop, 6, floorH);
        }
      }
    }
    const concreteFacadeTexture = new THREE.CanvasTexture(concCanvas);
    concreteFacadeTexture.wrapS = THREE.RepeatWrapping;
    concreteFacadeTexture.wrapT = THREE.RepeatWrapping;
    concreteFacadeTexture.magFilter = THREE.LinearFilter;
    concreteFacadeTexture.minFilter = THREE.LinearMipmapLinearFilter;
    concreteFacadeTexture.generateMipmaps = true;

    // ── Architectural Materials ─────────────────────────────────────
    const glassBuildingMat = new THREE.MeshStandardMaterial({
      color: 0x162234,
      roughness: 0.35,
      metalness: 0.65,
      map: glassFacadeTexture,
      emissive: 0xffffff,
      emissiveMap: glassFacadeTexture,
      emissiveIntensity: 0.60,
    });

    const concreteBuildingMat = new THREE.MeshStandardMaterial({
      color: 0x24344a,
      roughness: 0.75,
      metalness: 0.2,
      map: concreteFacadeTexture,
      emissive: 0xffffff,
      emissiveMap: concreteFacadeTexture,
      emissiveIntensity: 0.50,
    });

    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x162233,
      roughness: 0.85,
      metalness: 0.2,
    });

    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x0c1422,
      roughness: 0.9,
      metalness: 0.25,
    });

    const hvacMat = new THREE.MeshStandardMaterial({
      color: 0x273549,
      roughness: 0.65,
      metalness: 0.45,
    });

    const antennaMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.9,
      roughness: 0.2,
    });

    const beaconGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const redBeaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

    // ── Street-Level Architectural Illumination (Avenue Lanterns) ─────
    const streetLightGroup = new THREE.Group();
    scene.add(streetLightGroup);

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.4 });
    const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfde68a });
    const lampGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const poleGeo = new THREE.CylinderGeometry(0.035, 0.045, 2.2, 6);

    const streetLampCoords = [
      { x: 3.2,  z: -42 }, { x: 3.2,  z: -22 }, { x: 3.2,  z: -2 },
      { x: 3.2,  z: 18 },  { x: 3.2,  z: 38 },  { x: 3.2,  z: 58 },
      { x: 19.2, z: -42 }, { x: 19.2, z: -22 }, { x: 19.2, z: -2 },
      { x: 19.2, z: 18 },  { x: 19.2, z: 38 },  { x: 19.2, z: 58 },
    ];

    streetLampCoords.forEach((lp) => {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(lp.x, 1.1, lp.z);
      streetLightGroup.add(pole);

      const bulb = new THREE.Mesh(lampGeo, lampBulbMat);
      bulb.position.set(lp.x, 2.22, lp.z);
      streetLightGroup.add(bulb);
    });

    // ── Generate Dense Architectural Cityscape (Sited Behind Track) ──
    const buildingGroup = new THREE.Group();
    scene.add(buildingGroup);

    const beaconsList: THREE.Mesh[] = [];

    // Strategic architectural layout:
    // Towers are placed BEHIND the track (X >= 19) forming an elegant, slender skyline backdrop.
    // Zero awkward foreground blocks: the railway, ground avenues, and train are 100% unobstructed.
    const buildingSpecs = [
      // ── EAST PRIMARY SKYLINE (Slender architectural backdrop behind viaduct) ────
      { x: 20.5, z: -40, w: 4.6, d: 4.2, h: 26, type: 'glass',    antenna: true },
      { x: 26.0, z: -30, w: 5.0, d: 4.5, h: 32, type: 'concrete', antenna: true },
      { x: 20.0, z: -18, w: 4.4, d: 4.0, h: 24, type: 'glass',    antenna: false },
      { x: 25.5, z: -6,  w: 4.8, d: 4.4, h: 30, type: 'glass',    antenna: true },
      { x: 19.5, z: 6,   w: 4.5, d: 4.2, h: 25, type: 'concrete', antenna: false },
      { x: 25.0, z: 18,  w: 5.0, d: 4.5, h: 31, type: 'glass',    antenna: true },
      { x: 20.0, z: 30,  w: 4.6, d: 4.2, h: 26, type: 'concrete', antenna: false },
      { x: 25.5, z: 42,  w: 4.8, d: 4.4, h: 29, type: 'glass',    antenna: true },
      { x: 21.0, z: 54,  w: 4.6, d: 4.2, h: 24, type: 'concrete', antenna: false },
      { x: 25.0, z: 66,  w: 5.0, d: 4.5, h: 28, type: 'glass',    antenna: true },

      // ── OUTER METROPOLITAN SKYLINE (Deep background skyline layer) ───
      { x: 31.5, z: -38, w: 5.5, d: 5.0, h: 36, type: 'concrete', antenna: true },
      { x: 35.0, z: -18, w: 5.4, d: 4.8, h: 40, type: 'glass',    antenna: true },
      { x: 32.5, z: 2,   w: 5.6, d: 5.0, h: 38, type: 'concrete', antenna: true },
      { x: 35.5, z: 22,  w: 5.4, d: 4.8, h: 37, type: 'glass',    antenna: true },
      { x: 33.0, z: 44,  w: 5.6, d: 5.0, h: 39, type: 'concrete', antenna: true },
      { x: 34.5, z: 62,  w: 5.2, d: 4.6, h: 33, type: 'glass',    antenna: false },

      // ── DISTANT NORTH HORIZON (Atmospheric skyline depth) ────────────
      { x: 7.5,  z: -58, w: 4.6, d: 4.2, h: 24, type: 'concrete', antenna: false },
      { x: 15.5, z: -62, w: 5.2, d: 4.6, h: 32, type: 'glass',    antenna: true },
      { x: 25.5, z: -58, w: 5.0, d: 4.5, h: 30, type: 'concrete', antenna: true },
      { x: 34.0, z: -54, w: 5.4, d: 4.8, h: 35, type: 'glass',    antenna: false },
    ];

    buildingSpecs.forEach((b) => {
      const bMat = b.type === 'glass' ? glassBuildingMat : concreteBuildingMat;

      // 1. Podium Base
      const podW = b.w * 1.08;
      const podD = b.d * 1.08;
      const podH = Math.min(2.5, b.h * 0.12);
      const podGeo = new THREE.BoxGeometry(podW, podH, podD);
      const podMesh = new THREE.Mesh(podGeo, podiumMat);
      podMesh.position.set(b.x, podH / 2, b.z);
      podMesh.castShadow = true;
      podMesh.receiveShadow = true;
      buildingGroup.add(podMesh);

      // 2. Main Tower Body with single 1:1 floor UV mapping
      const towerH = b.h - podH;
      const towerGeo = new THREE.BoxGeometry(b.w, towerH, b.d);
      const uvAttr = towerGeo.attributes.uv;
      const uTile = 1;
      const vTile = 1;
      for (let i = 0; i < uvAttr.count; i++) {
        uvAttr.setXY(i, uvAttr.getX(i) * uTile, uvAttr.getY(i) * vTile);
      }
      uvAttr.needsUpdate = true;

      const towerMesh = new THREE.Mesh(towerGeo, bMat);
      towerMesh.position.set(b.x, podH + towerH / 2, b.z);
      towerMesh.castShadow = true;
      towerMesh.receiveShadow = true;
      buildingGroup.add(towerMesh);

      // 3. Recessed Penthouse Roof Setback
      const crownW = b.w * 0.74;
      const crownD = b.d * 0.74;
      const crownH = Math.min(2.2, b.h * 0.08);
      const crownGeo = new THREE.BoxGeometry(crownW, crownH, crownD);
      const crownMesh = new THREE.Mesh(crownGeo, roofMat);
      crownMesh.position.set(b.x, b.h + crownH / 2, b.z);
      buildingGroup.add(crownMesh);

      // 4. Rooftop HVAC Condenser Housing
      const hvacGeo = new THREE.BoxGeometry(crownW * 0.45, 0.7, crownD * 0.45);
      const hvacMesh = new THREE.Mesh(hvacGeo, hvacMat);
      hvacMesh.position.set(b.x - crownW * 0.16, b.h + crownH + 0.35, b.z);
      buildingGroup.add(hvacMesh);

      // 5. Slender Antenna Mast with Aviation Beacon
      if (b.antenna) {
        const antH = Math.min(4.5, b.h * 0.15);
        const antGeo = new THREE.CylinderGeometry(0.035, 0.10, antH, 6);
        const antMesh = new THREE.Mesh(antGeo, antennaMat);
        const antTopY = b.h + crownH + antH;
        antMesh.position.set(b.x + crownW * 0.2, b.h + crownH + antH / 2, b.z);
        buildingGroup.add(antMesh);

        // Blinking red aviation warning beacon at apex
        const beaconMesh = new THREE.Mesh(beaconGeo, redBeaconMat);
        beaconMesh.position.set(b.x + crownW * 0.2, antTopY, b.z);
        buildingGroup.add(beaconMesh);
        beaconsList.push(beaconMesh);
      }
    });

    // ── 3D Elevated Railway Infrastructure ───────────────────────────
    const railwayGroup = new THREE.Group();
    scene.add(railwayGroup);

    // Concrete Box Girder Deck Geometry
    const deckSamples = 130;
    const deckWidth = 1.9;
    const deckDepth = 0.38;
    const deckPositions: number[] = [];
    const deckIndices: number[] = [];
    const upVec = new THREE.Vector3(0, 1, 0);

    const deckRings: THREE.Vector3[][] = [];
    for (let i = 0; i <= deckSamples; i++) {
      const t = i / deckSamples;
      const p = track3DCurve.getPointAt(t);
      const tangent = track3DCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, upVec).normalize();

      const tl = p.clone().addScaledVector(right, -deckWidth / 2);
      const tr = p.clone().addScaledVector(right, deckWidth / 2);
      const br = tr.clone().addScaledVector(upVec, -deckDepth);
      const bl = tl.clone().addScaledVector(upVec, -deckDepth);

      deckRings.push([tl, tr, br, bl]);
    }

    for (let i = 0; i < deckRings.length; i++) {
      for (let j = 0; j < 4; j++) {
        const v = deckRings[i][j];
        deckPositions.push(v.x, v.y, v.z);
      }
    }

    for (let i = 0; i < deckSamples; i++) {
      const row1 = i * 4;
      const row2 = (i + 1) * 4;
      for (let j = 0; j < 4; j++) {
        const nextJ = (j + 1) % 4;
        const a = row1 + j;
        const b = row1 + nextJ;
        const c = row2 + nextJ;
        const d = row2 + j;
        deckIndices.push(a, b, c);
        deckIndices.push(a, c, d);
      }
    }

    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPositions, 3));
    deckGeo.setIndex(deckIndices);
    deckGeo.computeVertexNormals();

    const deckMat = new THREE.MeshStandardMaterial({
      color: 0x223044,
      roughness: 0.82,
      metalness: 0.15,
    });
    const deckMesh = new THREE.Mesh(deckGeo, deckMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    railwayGroup.add(deckMesh);

    // Twin Polished Steel Running Rails (left at -0.45, right at +0.45)
    const railPointsLeft: THREE.Vector3[] = [];
    const railPointsRight: THREE.Vector3[] = [];
    for (let i = 0; i <= deckSamples; i++) {
      const t = i / deckSamples;
      const p = track3DCurve.getPointAt(t);
      const tangent = track3DCurve.getTangentAt(t).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, upVec).normalize();

      const railHeightOffset = 0.08;
      railPointsLeft.push(p.clone().addScaledVector(right, -0.45).addScaledVector(upVec, railHeightOffset));
      railPointsRight.push(p.clone().addScaledVector(right, 0.45).addScaledVector(upVec, railHeightOffset));
    }

    const leftRailCurve = new THREE.CatmullRomCurve3(railPointsLeft);
    const rightRailCurve = new THREE.CatmullRomCurve3(railPointsRight);

    const railTubeGeoLeft = new THREE.TubeGeometry(leftRailCurve, 130, 0.045, 6, false);
    const railTubeGeoRight = new THREE.TubeGeometry(rightRailCurve, 130, 0.045, 6, false);

    const steelRailMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.15,
    });

    const leftRailMesh = new THREE.Mesh(railTubeGeoLeft, steelRailMat);
    const rightRailMesh = new THREE.Mesh(railTubeGeoRight, steelRailMat);
    railwayGroup.add(leftRailMesh);
    railwayGroup.add(rightRailMesh);

    // Sleepers (Cross-ties) along the railway curve using InstancedMesh
    const sleeperCount = 145;
    const sleeperGeo = new THREE.BoxGeometry(1.45, 0.06, 0.22);
    const sleeperMat = new THREE.MeshStandardMaterial({
      color: 0x3d4d63,
      roughness: 0.9,
      metalness: 0.1,
    });
    const sleeperInstanced = new THREE.InstancedMesh(sleeperGeo, sleeperMat, sleeperCount);
    sleeperInstanced.castShadow = true;

    const dummyMatrix = new THREE.Matrix4();
    for (let i = 0; i < sleeperCount; i++) {
      const t = i / sleeperCount;
      const p = track3DCurve.getPointAt(t);
      const tangent = track3DCurve.getTangentAt(t).normalize();

      dummyMatrix.identity();
      dummyMatrix.lookAt(p, p.clone().add(tangent), upVec);
      dummyMatrix.setPosition(p.x, p.y + 0.03, p.z);
      sleeperInstanced.setMatrixAt(i, dummyMatrix);
    }
    sleeperInstanced.instanceMatrix.needsUpdate = true;
    railwayGroup.add(sleeperInstanced);

    // Concrete Support Pillars with Hammerhead Crossbeams
    const pierMat = new THREE.MeshStandardMaterial({
      color: 0x141f30,
      roughness: 0.9,
      metalness: 0.1,
    });
    const hazardYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });

    const pierSamples = [0.03, 0.14, 0.26, 0.36, 0.48, 0.60, 0.72, 0.84, 0.95];
    pierSamples.forEach((t) => {
      const p = track3DCurve.getPointAt(t);
      const pierH = p.y - deckDepth;

      // Vertical shaft
      const colGeo = new THREE.CylinderGeometry(0.44, 0.50, pierH, 8);
      const colMesh = new THREE.Mesh(colGeo, pierMat);
      colMesh.position.set(p.x, pierH / 2, p.z);
      colMesh.castShadow = true;
      railwayGroup.add(colMesh);

      // Cantilever crosshead hammerhead beam
      const headGeo = new THREE.BoxGeometry(2.5, 0.40, 0.95);
      const headMesh = new THREE.Mesh(headGeo, pierMat);
      headMesh.position.set(p.x, pierH - 0.20, p.z);
      railwayGroup.add(headMesh);

      // Reflective hazard warning strip
      const stripGeo = new THREE.BoxGeometry(0.90, 0.08, 0.96);
      const stripMesh = new THREE.Mesh(stripGeo, hazardYellowMat);
      stripMesh.position.set(p.x, pierH * 0.7, p.z);
      railwayGroup.add(stripMesh);
    });

    // ── Architectural Rajiv Chowk Multi-Level Interchange Station ─────
    // Level 1 Blue Line Viaduct crossing underneath perpendicularly at Y = 3.0m
    const blueDeckGeo = new THREE.BoxGeometry(36, 0.38, 1.9);
    const blueDeckMat = new THREE.MeshStandardMaterial({
      color: 0x162438,
      roughness: 0.82,
      metalness: 0.2,
    });
    const blueDeckMesh = new THREE.Mesh(blueDeckGeo, blueDeckMat);
    blueDeckMesh.position.set(5, 3.0, 0);
    railwayGroup.add(blueDeckMesh);

    // Blue Line Rails across Level 1
    const blueRailGeo = new THREE.CylinderGeometry(0.045, 0.045, 36, 6);
    blueRailGeo.rotateZ(Math.PI / 2);
    const blueRailLeft = new THREE.Mesh(blueRailGeo, steelRailMat);
    blueRailLeft.position.set(5, 3.25, -0.45);
    const blueRailRight = new THREE.Mesh(blueRailGeo, steelRailMat);
    blueRailRight.position.set(5, 3.25, 0.45);
    railwayGroup.add(blueRailLeft);
    railwayGroup.add(blueRailRight);

    // Interchange Multi-Level Station Concourse Structure (Sited to the side, NEVER covering the train!)
    const concourseMat = new THREE.MeshStandardMaterial({
      color: 0x111c2e,
      roughness: 0.8,
      metalness: 0.3,
    });
    const rcPlatformDeck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 8.5), concourseMat);
    rcPlatformDeck.position.set(6.8, 4.4, 0);
    railwayGroup.add(rcPlatformDeck);

    // Station Canopy Steel Truss Roof (Positioned over the passenger platform, NOT the rails!)
    const rcRoofMat = new THREE.MeshStandardMaterial({
      color: 0x09101d,
      roughness: 0.4,
      metalness: 0.7,
    });
    const rcCanopy = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 8.0), rcRoofMat);
    rcCanopy.position.set(6.8, 5.8, 0);
    railwayGroup.add(rcCanopy);

    // Canopy Support Columns along platform
    const rcColMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    [-3.2, 0, 3.2].forEach((cz) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 6), rcColMat);
      col.position.set(7.8, 5.1, cz);
      railwayGroup.add(col);
    });

    // Subtle Violet Platform Accent Strip (Identifies Rajiv Chowk without neon rings)
    const rcVioletMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    const rcVioletStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 8.5), rcVioletMat);
    rcVioletStrip.position.set(5.24, 4.52, 0);
    railwayGroup.add(rcVioletStrip);

    // Restrained Under-Canopy Violet Station Downlight
    const rcStationLight = new THREE.PointLight(0xa855f7, 1.8, 10);
    rcStationLight.position.set(6.8, 5.4, 0);
    railwayGroup.add(rcStationLight);

    // Legible Station Signboard Canvas Texture
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sCtx = signCanvas.getContext('2d');
    if (sCtx) {
      sCtx.fillStyle = '#09101d';
      sCtx.fillRect(0, 0, 256, 64);
      sCtx.fillStyle = '#a855f7';
      sCtx.fillRect(0, 0, 6, 64);
      sCtx.fillRect(250, 0, 6, 64);
      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 20px sans-serif';
      sCtx.textAlign = 'center';
      sCtx.textBaseline = 'middle';
      sCtx.fillText('RAJIV CHOWK', 128, 24);
      sCtx.font = '11px monospace';
      sCtx.fillStyle = '#94a3b8';
      sCtx.fillText('YELLOW ↕ BLUE INTERCHANGE', 128, 46);
    }
    const signTexture = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), signMat);
    signMesh.position.set(6.8, 5.4, 4.02);
    railwayGroup.add(signMesh);

    // ── Station Platform Canopies for Kashmere Gate, Hauz Khas, Terminal ──
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x1e2c40,
      roughness: 0.85,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x111c2b,
      roughness: 0.5,
      metalness: 0.5,
    });

    STATIONS_3D.filter((st) => st.id !== 'RAJIV_CHOWK').forEach((st) => {
      const p = track3DCurve.getPointAt(st.progress);
      const tangent = track3DCurve.getTangentAt(st.progress).normalize();

      const stGroup = new THREE.Group();
      stGroup.position.copy(p);

      // Platform deck sited to the right of track
      const platMesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 5.2), platformMat);
      platMesh.position.set(1.4, 0.1, 0);
      stGroup.add(platMesh);

      // Edge safety strip (Yellow or Blue)
      const edgeStrip = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.02, 5.2),
        new THREE.MeshBasicMaterial({ color: st.line === 'yellow' ? 0xfacc15 : 0x0284c7 })
      );
      edgeStrip.position.set(0.72, 0.22, 0);
      stGroup.add(edgeStrip);

      // Canopy roof sited over the passenger platform (NOT the track!)
      const canMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 4.8), canopyMat);
      canMesh.position.set(1.5, 1.4, 0);
      stGroup.add(canMesh);

      // Canopy steel supports
      const supMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
      [-1.8, 1.8].forEach((sz) => {
        const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), supMat);
        sup.position.set(1.8, 0.75, sz);
        stGroup.add(sup);
      });

      // Orient station group with curve tangent
      stGroup.lookAt(p.clone().add(tangent));
      railwayGroup.add(stGroup);
    });

    // ── Custom Articulated 3D Delhi Metro EMU Train ───────────────────
    const trainGroup = new THREE.Group();
    scene.add(trainGroup);

    // Realistic Stainless-Steel Metro Materials
    const trainBodyMat = new THREE.MeshStandardMaterial({
      color: 0xdde4ec, // Brushed stainless steel
      metalness: 0.88,
      roughness: 0.26,
    });
    const yellowLiveryMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const blueLiveryMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x070e1b,
      emissive: 0xfde68a,
      emissiveIntensity: 0.40,
      roughness: 0.1,
    });
    const cabGlassMat = new THREE.MeshStandardMaterial({
      color: 0x040813,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.35,
      roughness: 0.1,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.9,
      roughness: 0.25,
    });
    const doorFrameMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.8,
      roughness: 0.4,
    });

    // Helper: Build a single 3D metro coach
    const buildCarriage = (isLead: boolean, isTail: boolean, length: number) => {
      const car = new THREE.Group();
      const width = 1.15;
      const height = 0.88;

      // Coach body shell
      const bodyGeo = new THREE.BoxGeometry(width, height, length);
      const bodyMesh = new THREE.Mesh(bodyGeo, trainBodyMat);
      bodyMesh.position.y = 0.54;
      bodyMesh.castShadow = true;
      car.add(bodyMesh);

      // Upper Yellow Line waistline stripe
      const yStripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.08, length), yellowLiveryMat);
      yStripe.position.set(0, 0.66, 0);
      car.add(yStripe);

      // Lower Blue Line waistline stripe
      const bStripe = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.08, length), blueLiveryMat);
      bStripe.position.set(0, 0.38, 0);
      car.add(bStripe);

      // Passenger tinted windows with subtle warm interior lighting
      const winGeo = new THREE.BoxGeometry(width + 0.03, 0.24, 0.58);
      const winCount = isLead || isTail ? 3 : 4;
      const winStep = length / (winCount + 1);
      for (let i = 1; i <= winCount; i++) {
        const winMesh = new THREE.Mesh(winGeo, windowMat);
        winMesh.position.set(0, 0.60, -length / 2 + i * winStep);
        car.add(winMesh);
      }

      // Passenger entry door frames
      const doorOffsets = [-length * 0.22, length * 0.22];
      doorOffsets.forEach((dz) => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(width + 0.025, 0.65, 0.35), doorFrameMat);
        door.position.set(0, 0.42, dz);
        car.add(door);
      });

      // Wheels & bogie assembly resting accurately on top of rails at Y = 0.08
      const wheelR = 0.12;
      const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.06, 12);
      wheelGeo.rotateZ(Math.PI / 2);

      const bogieOffsets = [-length * 0.32, length * 0.32];
      bogieOffsets.forEach((bz) => {
        // Bogie frame
        const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.65), wheelMat);
        frameMesh.position.set(0, 0.15, bz);
        car.add(frameMesh);

        [-0.45, 0.45].forEach((wx) => {
          const w1 = new THREE.Mesh(wheelGeo, wheelMat);
          w1.position.set(wx, 0.08 + wheelR, bz - 0.18);
          car.add(w1);

          const w2 = new THREE.Mesh(wheelGeo, wheelMat);
          w2.position.set(wx, 0.08 + wheelR, bz + 0.18);
          car.add(w2);
        });
      });

      // Lead driving cab features
      if (isLead) {
        // Aerodynamic raked windshield at front (+Z)
        const cabNose = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, height * 0.52, 0.35), cabGlassMat);
        cabNose.position.set(0, 0.62, length / 2 + 0.1);
        car.add(cabNose);

        // Destination display banner
        const destGeo = new THREE.BoxGeometry(width * 0.65, 0.10, 0.02);
        const destMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const destMesh = new THREE.Mesh(destGeo, destMat);
        destMesh.position.set(0, 0.86, length / 2 + 0.02);
        car.add(destMesh);

        // Forward Dual High-Intensity LED Headlights
        const headGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const headMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const leftHead = new THREE.Mesh(headGeo, headMat);
        leftHead.position.set(-0.36, 0.36, length / 2 + 0.06);
        const rightHead = new THREE.Mesh(headGeo, headMat);
        rightHead.position.set(0.36, 0.36, length / 2 + 0.06);
        car.add(leftHead);
        car.add(rightHead);

        // Forward spotlight casting beam on tracks ahead
        const headSpot = new THREE.SpotLight(0xfef08a, 4.0, 30, Math.PI / 5, 0.45, 1.2);
        headSpot.position.set(0, 0.5, length / 2 + 0.2);
        car.add(headSpot);
        const spotTarget = new THREE.Object3D();
        spotTarget.position.set(0, 0, length / 2 + 12);
        car.add(spotTarget);
        headSpot.target = spotTarget;
      }

      // Tail driving cab features
      if (isTail) {
        // Rear windshield at tail (-Z)
        const tailGlass = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, height * 0.52, 0.35), cabGlassMat);
        tailGlass.position.set(0, 0.62, -length / 2 - 0.1);
        car.add(tailGlass);

        // Dual Ruby-Red LED Tail Lights
        const tailGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const leftTail = new THREE.Mesh(tailGeo, tailMat);
        leftTail.position.set(-0.36, 0.36, -length / 2 - 0.06);
        const rightTail = new THREE.Mesh(tailGeo, tailMat);
        rightTail.position.set(0.36, 0.36, -length / 2 - 0.06);
        car.add(leftTail);
        car.add(rightTail);
      }

      return car;
    };

    const car1 = buildCarriage(true, false, 3.2);  // Lead Car
    const car2 = buildCarriage(false, false, 2.9); // Center Trailer
    const car3 = buildCarriage(false, true, 3.2);  // Tail Car
    trainGroup.add(car1);
    trainGroup.add(car2);
    trainGroup.add(car3);

    // Flexible rubber accordion gangway mesh connecting carriages
    const gangwayMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
    });
    const g1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.78, 0.4), gangwayMat);
    const g2Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.78, 0.4), gangwayMat);
    trainGroup.add(g1Mesh);
    trainGroup.add(g2Mesh);

    // Curve arc offsets for 3 carriages
    const totalCurveLength = track3DCurve.getLength();
    const car1Half = 1.6;
    const car2Half = 1.45;
    const car3Half = 1.6;
    const gLen = 0.35;

    const delta1 = (car1Half + gLen + car2Half) / totalCurveLength;
    const delta2 = delta1 + (car2Half + gLen + car3Half) / totalCurveLength;

    // ── Update Train 3D Pose along Curve ──────────────────────────────
    const updateTrainPose = (tProgress: number) => {
      const p1 = Math.max(0.001, Math.min(0.999, tProgress));
      const p2 = Math.max(0.001, Math.min(0.999, tProgress - delta1));
      const p3 = Math.max(0.001, Math.min(0.999, tProgress - delta2));

      // Car 1 (Lead)
      const pt1 = track3DCurve.getPointAt(p1);
      const tan1 = track3DCurve.getTangentAt(p1).normalize();
      car1.position.copy(pt1);
      car1.lookAt(pt1.clone().add(tan1));

      // Car 2 (Center)
      const pt2 = track3DCurve.getPointAt(p2);
      const tan2 = track3DCurve.getTangentAt(p2).normalize();
      car2.position.copy(pt2);
      car2.lookAt(pt2.clone().add(tan2));

      // Car 3 (Tail)
      const pt3 = track3DCurve.getPointAt(p3);
      const tan3 = track3DCurve.getTangentAt(p3).normalize();
      car3.position.copy(pt3);
      car3.lookAt(pt3.clone().add(tan3));

      // Dynamic gangways between couplers
      g1Mesh.position.copy(pt1).lerp(pt2, 0.5);
      g1Mesh.lookAt(pt1);

      g2Mesh.position.copy(pt2).lerp(pt3, 0.5);
      g2Mesh.lookAt(pt2);
    };

    // ── Scroll Tracking & Dynamic Camera Dolly ────────────────────────
    let targetScrollProgress = 0.12;
    let currentScrollProgress = 0.12;

    const handleScroll = () => {
      const triggerEl = triggerContainerRef.current || document.documentElement;
      const maxScroll = triggerEl.scrollHeight - window.innerHeight;
      const scrollY = window.scrollY;
      const rawProgress = maxScroll > 0 ? scrollY / maxScroll : 0;

      // Map scroll progress to travel from Kashmere Gate (0.12) to Terminus (0.96)
      targetScrollProgress = 0.12 + rawProgress * (0.96 - 0.12);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // Resize handler
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      applyViewOffset(w, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Initial pose
    updateTrainPose(currentScrollProgress);

    // ── 60fps Dynamic Render Loop ─────────────────────────────────────
    let animId: number;
    const startTime = performance.now();

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      if (reduced) {
        renderer.render(scene, camera);
        return;
      }

      const elapsed = (time - startTime) * 0.001;

      // Smooth lerp scroll progress for silky-smooth motion
      currentScrollProgress += (targetScrollProgress - currentScrollProgress) * 0.08;
      updateTrainPose(currentScrollProgress);

      // Camera smoothly dollies to track the train with three-quarter perspective
      const leadPt = track3DCurve.getPointAt(currentScrollProgress);
      const isMobile = window.innerWidth < 768;

      const camTargetX = leadPt.x - (isMobile ? 9.5 : 13.5);
      const camTargetY = leadPt.y + (isMobile ? 8.5 : 7.5);
      const camTargetZ = leadPt.z - (isMobile ? 13.5 : 15.5);

      camera.position.x += (camTargetX - camera.position.x) * 0.06;
      camera.position.y += (camTargetY - camera.position.y) * 0.06;
      camera.position.z += (camTargetZ - camera.position.z) * 0.06;

      // Look slightly ahead along the tracks
      const lookTarget = leadPt.clone().add(new THREE.Vector3(0.5, 0.8, 3.5));
      camera.lookAt(lookTarget);

      // Slow architectural aviation warning beacon blink (1.5 Hz sine)
      const bAlpha = (Math.sin(elapsed * 2.5) + 1) * 0.5;
      redBeaconMat.opacity = 0.35 + bAlpha * 0.65;

      renderer.render(scene, camera);
    };

    animate(performance.now());

    // ── Teardown & Resource Disposal ──────────────────────────────────
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);

      // Dispose Three.js objects
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      glassFacadeTexture.dispose();
      concreteFacadeTexture.dispose();
      signTexture.dispose();
      renderer.dispose();
    };
  }, [reduced, triggerContainerRef]);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
      />
      {!webglSupported && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#020409] text-slate-400 p-8 text-center pointer-events-auto">
          <div className="max-w-md bg-navy-900/90 border border-white/10 p-6 rounded-2xl shadow-2xl">
            <p className="text-sm font-semibold text-white mb-2">Hardware Acceleration Disabled</p>
            <p className="text-xs text-slate-400">WebGL 3D rendering is unavailable on this device. All route planning and transit features remain fully functional.</p>
          </div>
        </div>
      )}
      {/* Editorial Left-Hand Contrast Vignette — Confined strictly to the left text column on desktop; provides readable text contrast on mobile */}
      <div className="absolute inset-y-0 left-0 w-full lg:w-[44%] bg-gradient-to-b from-[#020409]/90 via-[#020409]/80 to-[#020409]/70 lg:bg-gradient-to-r lg:from-[#020409]/95 lg:via-[#020409]/70 lg:to-transparent pointer-events-none" />
    </div>
  );
}
