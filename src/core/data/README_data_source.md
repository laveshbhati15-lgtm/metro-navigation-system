# Delhi Metro Navigator — Verified Data Source Documentation

## Network Coverage
- **Yellow Line (Line 2)**: Samaypur Badli ↔ Millennium City Centre Gurugram (37 stations, 36 edges)
- **Blue Line Main (Line 3)**: Dwarka Sector 21 ↔ Noida Electronic City (50 stations, 49 edges)
- **Blue Line Branch (Line 4)**: Yamuna Bank ↔ Vaishali (8 stations, 7 branch edges)
- **Violet Line (Line 6)**: Kashmere Gate ↔ Raja Nahar Singh Ballabhgarh (34 stations, 33 edges)
- **Total Stations in Dataset**: 124 unique stations
- **Total Connections in Dataset**: 125 bidirectional edges

---

## 1. Verified Facts (Reliable Sources)

### Sources & Reference Dates
1. **DMRC Official System Map & Station Index** (Verified: 2024 edition)
   - Source: [Delhi Metro Rail Corporation](https://www.delhimetrorail.com)
   - Verified: Station operational names, sequential order, terminal points, and line interchanges.
2. **OpenStreetMap Transit Relations** (Verified: 2024)
   - Yellow Line Relation: `1941780`
   - Blue Line Relation: `1941796`
   - Violet Line Relation: `1941795`
   - Verified: WGS-84 geographic coordinates (latitude and longitude).
3. **Wikipedia / Transit Cartography Cross-References**
   - Verified: Station Hindi names and official renaming records.

### Verified Network Topology
- **Yellow Line sequence**: 37 stations unbroken from `SAMAYPUR_BADLI` to `HUDA_CITY_CENTRE`.
- **Blue Line Main sequence**: 50 stations unbroken from `DWARKA_SEC_21` through `DWARKA`, `DWARKA_MOR`, `NAWADA`, `UTTAM_NAGAR_WEST`, `UTTAM_NAGAR_EAST`, `JANAKPURI_WEST`, `RAJIV_CHOWK`, `BARAKHAMBA_ROAD`, `YAMUNA_BANK`, `MAYUR_VIHAR_EXTENSION`, `NEW_ASHOK_NAGAR` to `NOIDA_ELECTRONIC_CITY`.
- **Blue Line Branch sequence**: 8 stations (7 branch edges) from `YAMUNA_BANK` through `LAXMI_NAGAR` to `VAISHALI`.
- **Violet Line sequence**: 34 stations unbroken from `KASHMERE_GATE` through `LAL_QILA`, `JAMA_MASJID`, `DELHI_GATE`, `ITO`, `MANDI_HOUSE`, `JANPATH`, `CENTRAL_SECRETARIAT`, `LAJPAT_NAGAR`, `BADARPUR_BORDER` to `RAJA_NAHAR_SINGH`.
- **Key Interchange Hubs**:
  - `RAJIV_CHOWK`: Interchanges between Yellow Line and Blue Line (degree 4).
  - `MANDI_HOUSE`: Interchanges between Blue Line and Violet Line (degree 4). Enables direct transfer from Kashmere Gate/Heritage corridor to Noida/Vaishali.
  - `CENTRAL_SECRETARIAT`: Interchanges between Yellow Line and Violet Line (degree 4).
  - `KASHMERE_GATE`: Connects Yellow Line and Violet Line directly (plus Red Line).
- **Station Renaming History**:
  - `HUDA_CITY_CENTRE`: Officially renamed "Millennium City Centre Gurugram" (2023). Both display name and historical ID are supported.
  - `RACE_COURSE`: Officially renamed "Lok Kalyan Marg" (2016). Current official name is displayed.
  - `SUPREME_COURT`: Formerly "Pragati Maidan". Current official name is displayed.

---

## 2. Assumptions & Approximations

| Item | Status | Verified vs Assumption Details |
|---|---|---|
| **Station Coordinates** | ✅ Verified | Sourced from OpenStreetMap and verified with geographic coordinates |
| **Station Sequence & Connections** | ✅ Verified | Unbroken adjacency matching official DMRC network topology |
| **Interchange Junctions** | ✅ Verified | Multi-line nodes (Rajiv Chowk, Mandi House, Central Secretariat, Kashmere Gate) |
| **Per-segment Travel Time** | ⚠️ Estimated | 120 seconds (2 minutes) assumed average per segment (`isEstimated: true`) |
| **Interchange Walk/Wait Penalty** | ⚠️ Estimated | 180 seconds (3 minutes) assumed transfer friction between lines |
| **Fare Estimate** | ⚠️ Estimated | Approximate slab calculation (0–2km: ₹10, 2–5km: ₹20, 5–12km: ₹30, 12–21km: ₹40, 21–32km: ₹50, 32+km: ₹60) assuming ~1.5 km/station. Explicitly marked as "(estimated)" in UI. |

---

## 3. Data Integrity Invariants
The dataset is validated by automated CI tests (`src/core/data/dataIntegrity.test.ts`):
- `0` duplicate station IDs
- `0` edges referencing unknown station IDs
- `0` isolated stations (all 124 stations have degree ≥ 1)
- `1` Rajiv Chowk node with degree 4 (Yellow + Blue)
- `1` Mandi House node with degree 4 (Blue + Violet)
- `1` Central Secretariat node with degree 4 (Yellow + Violet)
- Yellow Line traversal = 37 stations
- Blue Main Line traversal = 50 stations
- Blue Branch Line traversal = 8 stations
- Violet Line traversal = 34 stations
