import { describe, it, expect } from 'vitest';
import stationsData from './stations.json';
import connectionsData from './connections.json';
import linesData from './lines.json';
import type { Station, Edge, LineCode } from '../graph/types';

describe('Data Integrity & Topology Audit', () => {
  const stations: Station[] = stationsData.stations as Station[];
  const edges: Edge[] = connectionsData.edges as Edge[];
  const stationMap = new Map<string, Station>(stations.map(s => [s.id, s]));

  // ── Station Definitions ──────────────────────────────────────────────────
  describe('Station Catalog Integrity', () => {
    it('contains no duplicate station IDs', () => {
      const ids = stations.map(s => s.id);
      const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
      expect(duplicates).toHaveLength(0);
    });

    it('has exactly 223 verified stations across 7 lines', () => {
      expect(stations).toHaveLength(223);
    });

    it('every station has non-empty name and valid WGS-84 coordinates in NCR', () => {
      for (const s of stations) {
        expect(s.name.trim().length).toBeGreaterThan(0);
        expect(s.coordinates.lat).toBeGreaterThanOrEqual(28.0);
        expect(s.coordinates.lat).toBeLessThanOrEqual(29.0);
        expect(s.coordinates.lng).toBeGreaterThanOrEqual(76.5);
        expect(s.coordinates.lng).toBeLessThanOrEqual(77.6);
      }
    });

    it('every station is assigned to at least one valid line', () => {
      const validLines = new Set(['YELLOW', 'BLUE', 'RED', 'GREEN', 'VIOLET', 'PINK', 'MAGENTA', 'GREY', 'ORANGE']);
      for (const s of stations) {
        expect(s.lines.length).toBeGreaterThan(0);
        s.lines.forEach(l => expect(validLines.has(l)).toBe(true));
      }
    });

    it('isInterchange flag matches lines length > 1 for every station', () => {
      for (const s of stations) {
        expect(s.isInterchange).toBe(s.lines.length > 1);
      }
    });
  });

  // ── Edge & Connection Integrity ──────────────────────────────────────────
  describe('Edge and Adjacency Integrity', () => {
    it('contains no edges referencing unknown stations', () => {
      const unknownFrom = edges.filter(e => !stationMap.has(e.from));
      const unknownTo = edges.filter(e => !stationMap.has(e.to));
      expect(unknownFrom).toHaveLength(0);
      expect(unknownTo).toHaveLength(0);
    });

    it('contains no duplicate connections (same pair on same line)', () => {
      const seen = new Set<string>();
      const duplicates: Edge[] = [];
      for (const e of edges) {
        const k1 = `${e.from}#${e.to}#${e.line}`;
        const k2 = `${e.to}#${e.from}#${e.line}`;
        if (seen.has(k1) || seen.has(k2)) {
          duplicates.push(e);
        }
        seen.add(k1);
      }
      expect(duplicates).toHaveLength(0);
    });

    it('every edge has a valid line and positive travel time', () => {
      const validLines = ['YELLOW', 'BLUE', 'VIOLET', 'RED', 'GREEN', 'MAGENTA', 'PINK'];
      for (const e of edges) {
        expect(validLines).toContain(e.line);
        expect(e.travelTimeSeconds).toBeGreaterThan(0);
        expect(Number.isInteger(e.travelTimeSeconds)).toBe(true);
      }
    });

    it('no station is isolated (degree >= 1 for all stations)', () => {
      const degrees: Record<string, number> = {};
      stations.forEach(s => { degrees[s.id] = 0; });
      edges.forEach(e => {
        degrees[e.from] = (degrees[e.from] ?? 0) + 1;
        degrees[e.to] = (degrees[e.to] ?? 0) + 1;
      });

      const isolated = Object.entries(degrees).filter(([, deg]) => deg === 0);
      expect(isolated).toHaveLength(0);
    });

    it('every station line membership agrees with connections', () => {
      for (const e of edges) {
        const fromStation = stationMap.get(e.from)!;
        const toStation = stationMap.get(e.to)!;
        expect(fromStation.lines).toContain(e.line);
        expect(toStation.lines).toContain(e.line);
      }

      const activeLinesByStation = new Map<string, Set<LineCode>>();
      for (const e of edges) {
        if (!activeLinesByStation.has(e.from)) activeLinesByStation.set(e.from, new Set());
        if (!activeLinesByStation.has(e.to)) activeLinesByStation.set(e.to, new Set());
        activeLinesByStation.get(e.from)!.add(e.line);
        activeLinesByStation.get(e.to)!.add(e.line);
      }

      for (const s of stations) {
        const linesWithEdges = activeLinesByStation.get(s.id) || new Set();
        for (const line of s.lines) {
          expect(linesWithEdges.has(line)).toBe(true);
        }
      }
    });
  });

  // ── Critical Interchange & Junction Nodes ────────────────────────────────
  describe('Interchange & Junction Topologies', () => {
    it('Rajiv Chowk is represented once with degree 4 (2 Yellow, 2 Blue)', () => {
      const rcStations = stations.filter(s => s.id === 'RAJIV_CHOWK');
      expect(rcStations).toHaveLength(1);
      expect(rcStations[0].isInterchange).toBe(true);
      expect(rcStations[0].lines).toContain('YELLOW');
      expect(rcStations[0].lines).toContain('BLUE');

      const rcEdges = edges.filter(e => e.from === 'RAJIV_CHOWK' || e.to === 'RAJIV_CHOWK');
      expect(rcEdges).toHaveLength(4);

      const yellowEdges = rcEdges.filter(e => e.line === 'YELLOW');
      const blueEdges = rcEdges.filter(e => e.line === 'BLUE');
      expect(yellowEdges).toHaveLength(2);
      expect(blueEdges).toHaveLength(2);
    });

    it('Kashmere Gate is represented once with degree 5 (2 Yellow, 1 Violet terminal, 2 Red)', () => {
      const kgStations = stations.filter(s => s.id === 'KASHMERE_GATE');
      expect(kgStations).toHaveLength(1);
      expect(kgStations[0].isInterchange).toBe(true);
      expect(kgStations[0].lines).toEqual(expect.arrayContaining(['YELLOW', 'VIOLET', 'RED']));

      const kgEdges = edges.filter(e => e.from === 'KASHMERE_GATE' || e.to === 'KASHMERE_GATE');
      expect(kgEdges).toHaveLength(5);
      expect(kgEdges.filter(e => e.line === 'YELLOW')).toHaveLength(2);
      expect(kgEdges.filter(e => e.line === 'VIOLET')).toHaveLength(1);
      expect(kgEdges.filter(e => e.line === 'RED')).toHaveLength(2);
    });

    it('Mandi House is an interchange with degree 4 (2 Blue, 2 Violet)', () => {
      const mhStations = stations.filter(s => s.id === 'MANDI_HOUSE');
      expect(mhStations).toHaveLength(1);
      expect(mhStations[0].isInterchange).toBe(true);
      expect(mhStations[0].lines).toContain('BLUE');
      expect(mhStations[0].lines).toContain('VIOLET');

      const mhEdges = edges.filter(e => e.from === 'MANDI_HOUSE' || e.to === 'MANDI_HOUSE');
      expect(mhEdges).toHaveLength(4);
      expect(mhEdges.filter(e => e.line === 'BLUE')).toHaveLength(2);
      expect(mhEdges.filter(e => e.line === 'VIOLET')).toHaveLength(2);
    });

    it('Central Secretariat is an interchange with degree 4 (2 Yellow, 2 Violet)', () => {
      const csStations = stations.filter(s => s.id === 'CENTRAL_SECRETARIAT');
      expect(csStations).toHaveLength(1);
      expect(csStations[0].isInterchange).toBe(true);
      expect(csStations[0].lines).toContain('YELLOW');
      expect(csStations[0].lines).toContain('VIOLET');

      const csEdges = edges.filter(e => e.from === 'CENTRAL_SECRETARIAT' || e.to === 'CENTRAL_SECRETARIAT');
      expect(csEdges).toHaveLength(4);
      expect(csEdges.filter(e => e.line === 'YELLOW')).toHaveLength(2);
      expect(csEdges.filter(e => e.line === 'VIOLET')).toHaveLength(2);
    });

    it('Yamuna Bank is the branch point connecting trunk, Vaishali, and Noida branches', () => {
      const ybEdges = edges.filter(e => e.from === 'YAMUNA_BANK' || e.to === 'YAMUNA_BANK');
      expect(ybEdges).toHaveLength(3);
      const neighborIds = ybEdges.map(e => e.from === 'YAMUNA_BANK' ? e.to : e.from);
      expect(neighborIds).toContain('INDRAPRASTHA'); // Trunk toward Dwarka
      expect(neighborIds).toContain('LAXMI_NAGAR');   // Branch toward Vaishali
      expect(neighborIds).toContain('AKSHARDHAM');   // Branch toward Noida
    });

    it('Ashok Park Main is the Green Line junction connecting Inderlok, Kirti Nagar, and Punjabi Bagh', () => {
      const apmEdges = edges.filter(e => e.from === 'ASHOK_PARK_MAIN' || e.to === 'ASHOK_PARK_MAIN');
      expect(apmEdges).toHaveLength(3);
      const neighbors = apmEdges.map(e => e.from === 'ASHOK_PARK_MAIN' ? e.to : e.from);
      expect(neighbors).toContain('INDERLOK');
      expect(neighbors).toContain('SATGURU_RAM_SINGH_MARG');
      expect(neighbors).toContain('PUNJABI_BAGH');
    });

    it('terminal stations have degree 1', () => {
      const terminalIds = [
        'SAMAYPUR_BADLI',
        'HUDA_CITY_CENTRE',
        'DWARKA_SEC_21',
        'VAISHALI',
        'NOIDA_ELECTRONIC_CITY',
        'RAJA_NAHAR_SINGH',
        'RITHALA',
        'SHAHEED_STHAL',
        'BRIGADIER_HOSHIYAR_SINGH',
        'MAJLIS_PARK',
        'SHIV_VIHAR',
      ];
      for (const termId of terminalIds) {
        const termEdges = edges.filter(e => e.from === termId || e.to === termId);
        expect(termEdges).toHaveLength(1);
      }
    });
  });

  // ── Specific Station Verification (Punjabi Bagh & Mayur Vihar) ────────────
  describe('Specific Station Integrity (Punjabi Bagh & Mayur Vihar)', () => {
    it('distinguishes Green Line Punjabi Bagh and Pink/Green Punjabi Bagh West', () => {
      const pb = stationMap.get('PUNJABI_BAGH');
      expect(pb).toBeDefined();
      expect(pb?.lines).toEqual(['GREEN']);
      expect(pb?.isInterchange).toBe(false);

      const pbw = stationMap.get('PUNJABI_BAGH_WEST');
      expect(pbw).toBeDefined();
      expect(pbw?.lines).toEqual(expect.arrayContaining(['GREEN', 'PINK']));
      expect(pbw?.isInterchange).toBe(true);

      // On Green Line: Ashok Park Main -> Punjabi Bagh -> Punjabi Bagh West -> Shivaji Park
      const pbEdges = edges.filter(e => e.line === 'GREEN' && (e.from === 'PUNJABI_BAGH' || e.to === 'PUNJABI_BAGH'));
      expect(pbEdges).toHaveLength(2);
      const pbNeighbors = pbEdges.map(e => e.from === 'PUNJABI_BAGH' ? e.to : e.from);
      expect(pbNeighbors).toContain('ASHOK_PARK_MAIN');
      expect(pbNeighbors).toContain('PUNJABI_BAGH_WEST');
    });

    it('correctly models all Mayur Vihar stations with distinct IDs and lines', () => {
      const mv1 = stationMap.get('MAYUR_VIHAR_1');
      expect(mv1).toBeDefined();
      expect(mv1?.lines).toEqual(expect.arrayContaining(['BLUE', 'PINK']));
      expect(mv1?.isInterchange).toBe(true);

      const mvExt = stationMap.get('MAYUR_VIHAR_EXTENSION');
      expect(mvExt).toBeDefined();
      expect(mvExt?.lines).toEqual(['BLUE']);
      expect(mvExt?.isInterchange).toBe(false);

      const mvP1 = stationMap.get('MAYUR_VIHAR_POCKET_1');
      expect(mvP1).toBeDefined();
      expect(mvP1?.lines).toEqual(['PINK']);
      expect(mvP1?.isInterchange).toBe(false);

      const evn = stationMap.get('EAST_VINOD_NAGAR');
      expect(evn).toBeDefined();
      expect(evn?.lines).toEqual(['PINK']);
      expect(evn?.isInterchange).toBe(false);
    });

    it('Anand Vihar is a single shared interchange station between Blue and Pink lines with no duplicate ISBT station', () => {
      const anandViharStations = stations.filter(s => s.id.startsWith('ANAND_VIHAR'));
      expect(anandViharStations).toHaveLength(1);
      expect(anandViharStations[0].id).toBe('ANAND_VIHAR');
      expect(anandViharStations[0].lines).toEqual(expect.arrayContaining(['BLUE', 'PINK']));
      expect(anandViharStations[0].isInterchange).toBe(true);

      const avEdges = edges.filter(e => e.from === 'ANAND_VIHAR' || e.to === 'ANAND_VIHAR');
      expect(avEdges.filter(e => e.line === 'BLUE')).toHaveLength(2);
      expect(avEdges.filter(e => e.line === 'PINK')).toHaveLength(2);
    });
  });

  // ── Line Sequences ───────────────────────────────────────────────────────
  describe('Declared Line Sequence Continuity', () => {
    it('Yellow Line forms an unbroken chain of 37 stations (36 edges)', () => {
      let cur = 'SAMAYPUR_BADLI';
      const visited = [cur];
      while (cur !== 'HUDA_CITY_CENTRE') {
        const edge = edges.find(e =>
          e.line === 'YELLOW' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from)
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(37);
      expect(visited[0]).toBe('SAMAYPUR_BADLI');
      expect(visited[visited.length - 1]).toBe('HUDA_CITY_CENTRE');
    });

    it('Blue Line Main Line forms an unbroken chain of 50 stations (49 edges)', () => {
      let cur = 'DWARKA_SEC_21';
      const visited = [cur];
      while (cur !== 'NOIDA_ELECTRONIC_CITY') {
        const edge = edges.find(e =>
          e.line === 'BLUE' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from) &&
          !(e.from === 'YAMUNA_BANK' && e.to === 'LAXMI_NAGAR') &&
          !(e.to === 'YAMUNA_BANK' && e.from === 'LAXMI_NAGAR')
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(50);
      expect(visited[0]).toBe('DWARKA_SEC_21');
      expect(visited[visited.length - 1]).toBe('NOIDA_ELECTRONIC_CITY');
    });

    it('Blue Line Branch Line forms an unbroken chain of 8 stations to Vaishali', () => {
      let cur = 'YAMUNA_BANK';
      const visited = [cur];
      while (cur !== 'VAISHALI') {
        const edge = edges.find(e =>
          e.line === 'BLUE' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from) &&
          !(e.from === 'YAMUNA_BANK' && e.to === 'AKSHARDHAM') &&
          !(e.to === 'YAMUNA_BANK' && e.from === 'AKSHARDHAM') &&
          !(e.from === 'YAMUNA_BANK' && e.to === 'INDRAPRASTHA') &&
          !(e.to === 'YAMUNA_BANK' && e.from === 'INDRAPRASTHA')
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(8);
      expect(visited[0]).toBe('YAMUNA_BANK');
      expect(visited[visited.length - 1]).toBe('VAISHALI');
    });

    it('Violet Line forms an unbroken chain of 34 stations from Kashmere Gate to Raja Nahar Singh (33 edges)', () => {
      let cur = 'KASHMERE_GATE';
      const visited = [cur];
      while (cur !== 'RAJA_NAHAR_SINGH') {
        const edge = edges.find(e =>
          e.line === 'VIOLET' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from)
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(34);
      expect(visited[0]).toBe('KASHMERE_GATE');
      expect(visited[visited.length - 1]).toBe('RAJA_NAHAR_SINGH');
    });

    it('Red Line forms an unbroken chain of 29 stations from Rithala to Shaheed Sthal (28 edges)', () => {
      let cur = 'RITHALA';
      const visited = [cur];
      while (cur !== 'SHAHEED_STHAL') {
        const edge = edges.find(e =>
          e.line === 'RED' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from)
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(29);
      expect(visited[0]).toBe('RITHALA');
      expect(visited[visited.length - 1]).toBe('SHAHEED_STHAL');
    });

    it('Green Line Main Line forms an unbroken chain of 22 stations from Inderlok to Brigadier Hoshiyar Singh', () => {
      let cur = 'INDERLOK';
      const visited = [cur];
      while (cur !== 'BRIGADIER_HOSHIYAR_SINGH') {
        const edge = edges.find(e =>
          e.line === 'GREEN' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from) &&
          !(e.from === 'ASHOK_PARK_MAIN' && e.to === 'SATGURU_RAM_SINGH_MARG') &&
          !(e.to === 'ASHOK_PARK_MAIN' && e.from === 'SATGURU_RAM_SINGH_MARG')
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(22);
      expect(visited[0]).toBe('INDERLOK');
      expect(visited[visited.length - 1]).toBe('BRIGADIER_HOSHIYAR_SINGH');
    });

    it('Green Line Branch forms an unbroken chain of 3 stations from Kirti Nagar to Ashok Park Main', () => {
      let cur = 'KIRTI_NAGAR';
      const visited = [cur];
      while (cur !== 'ASHOK_PARK_MAIN') {
        const edge = edges.find(e =>
          e.line === 'GREEN' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from)
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(3);
      expect(visited[0]).toBe('KIRTI_NAGAR');
      expect(visited[visited.length - 1]).toBe('ASHOK_PARK_MAIN');
    });

    it('Magenta Line forms an unbroken chain of 25 stations from Janakpuri West to Botanical Garden (24 edges)', () => {
      let cur = 'JANAKPURI_WEST';
      const visited = [cur];
      while (cur !== 'BOTANICAL_GARDEN') {
        const edge = edges.find(e =>
          e.line === 'MAGENTA' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from)
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(25);
      expect(visited[0]).toBe('JANAKPURI_WEST');
      expect(visited[visited.length - 1]).toBe('BOTANICAL_GARDEN');
    });

    it('Pink Line forms an unbroken chain of 38 stations from Majlis Park to Shiv Vihar (37 edges)', () => {
      let cur = 'MAJLIS_PARK';
      const visited = [cur];
      while (cur !== 'SHIV_VIHAR') {
        const edge = edges.find(e =>
          e.line === 'PINK' &&
          (e.from === cur || e.to === cur) &&
          !visited.includes(e.from === cur ? e.to : e.from)
        );
        expect(edge).toBeDefined();
        cur = edge!.from === cur ? edge!.to : edge!.from;
        visited.push(cur);
      }
      expect(visited).toHaveLength(38);
      expect(visited[0]).toBe('MAJLIS_PARK');
      expect(visited[visited.length - 1]).toBe('SHIV_VIHAR');
    });
  });

  // ── Line Catalog Metadata ────────────────────────────────────────────────
  describe('Lines JSON Catalog Metadata', () => {
    it('lines.json defines all 7 active lines with correct station counts', () => {
      const lines = linesData.lines;
      expect(lines).toHaveLength(7);

      const codeMap = new Map(lines.map(l => [l.code, l]));
      expect(codeMap.get('YELLOW')?.stationCount).toBe(37);
      expect(codeMap.get('BLUE')?.stationCount).toBe(57);
      expect(codeMap.get('VIOLET')?.stationCount).toBe(34);
      expect(codeMap.get('RED')?.stationCount).toBe(29);
      expect(codeMap.get('GREEN')?.stationCount).toBe(24);
      expect(codeMap.get('MAGENTA')?.stationCount).toBe(25);
      expect(codeMap.get('PINK')?.stationCount).toBe(38);
    });
  });

  // ── Magenta Line P0 Topology Regression ──────────────────────────────────
  describe('Magenta Line Sequence Regression (P0 Fix)', () => {
    it('connects RK_PURAM <-> IIT_DELHI <-> HAUZ_KHAS <-> PANCHSHEEL_PARK with exact adjacency', () => {
      const magentaEdges = edges.filter(e => e.line === 'MAGENTA');

      const isConnected = (id1: string, id2: string) =>
        magentaEdges.some(e => (e.from === id1 && e.to === id2) || (e.from === id2 && e.to === id1));

      // Correct verified adjacencies must be present
      expect(isConnected('RK_PURAM', 'IIT_DELHI')).toBe(true);
      expect(isConnected('IIT_DELHI', 'HAUZ_KHAS')).toBe(true);
      expect(isConnected('HAUZ_KHAS', 'PANCHSHEEL_PARK')).toBe(true);

      // Old incorrect inverted adjacencies must NOT be present
      expect(isConnected('RK_PURAM', 'HAUZ_KHAS')).toBe(false);
      expect(isConnected('IIT_DELHI', 'PANCHSHEEL_PARK')).toBe(false);
    });

    it('contains no duplicate edges or self-loops for the corrected Magenta segment', () => {
      const segmentIds = ['RK_PURAM', 'IIT_DELHI', 'HAUZ_KHAS', 'PANCHSHEEL_PARK'];
      const segmentEdges = edges.filter(
        e => e.line === 'MAGENTA' && segmentIds.includes(e.from) && segmentIds.includes(e.to)
      );

      // Exactly 3 undirected edges connecting the 4 sequential stations
      expect(segmentEdges).toHaveLength(3);

      for (const e of segmentEdges) {
        expect(e.from).not.toBe(e.to); // No self loops
      }

      const pairs = segmentEdges.map(e => [e.from, e.to].sort().join('#'));
      const uniquePairs = new Set(pairs);
      expect(uniquePairs.size).toBe(3);
    });

    it('IIT Delhi has degree 2 and Hauz Khas has degree 4 (2 Magenta + 2 Yellow)', () => {
      const iitEdges = edges.filter(e => e.from === 'IIT_DELHI' || e.to === 'IIT_DELHI');
      expect(iitEdges).toHaveLength(2);
      expect(iitEdges.every(e => e.line === 'MAGENTA')).toBe(true);

      const hkEdges = edges.filter(e => e.from === 'HAUZ_KHAS' || e.to === 'HAUZ_KHAS');
      expect(hkEdges).toHaveLength(4);
      expect(hkEdges.filter(e => e.line === 'MAGENTA')).toHaveLength(2);
      expect(hkEdges.filter(e => e.line === 'YELLOW')).toHaveLength(2);

      const hkMagentaNeighbors = hkEdges
        .filter(e => e.line === 'MAGENTA')
        .map(e => (e.from === 'HAUZ_KHAS' ? e.to : e.from));
      expect(hkMagentaNeighbors).toEqual(expect.arrayContaining(['IIT_DELHI', 'PANCHSHEEL_PARK']));

      const hkYellowNeighbors = hkEdges
        .filter(e => e.line === 'YELLOW')
        .map(e => (e.from === 'HAUZ_KHAS' ? e.to : e.from));
      expect(hkYellowNeighbors).toEqual(expect.arrayContaining(['GREEN_PARK', 'MALVIYA_NAGAR']));
    });
  });
});
