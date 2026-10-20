/**
 * indoorData.ts — Station Indoor Layout & Accessible Wayfinding Data
 *
 * Models station entrances, security checks, AFC smart gates, concourses,
 * lifts/elevators, escalators, stairs, and platform layouts.
 *
 * NOTE ON DATA VERIFICATION:
 * High-detail indoor wayfinding blueprints are curated demonstration models
 * derived from DMRC public station layout guidelines and accessibility audits.
 * All layouts are explicitly marked with `isDemonstrationModel: true`.
 */

export type IndoorFacilityType =
  | 'entrance'
  | 'security'
  | 'afc_gate'
  | 'lift'
  | 'escalator'
  | 'stairs'
  | 'corridor'
  | 'platform'
  | 'helpdesk'
  | 'washroom'
  | 'tactile_path';

export interface IndoorStep {
  stepNumber: number;
  instruction: string;
  level: string;
  facilityType: IndoorFacilityType;
  landmark: string;
  isStepFree: boolean;
  notes?: string;
}

export interface IndoorWayfindingPath {
  id: string;
  title: string;
  from: string;
  to: string;
  isStepFree: boolean;
  estimatedWalkMinutes: number;
  steps: IndoorStep[];
}

export interface StationLevel {
  id: string;
  name: string;
  shortCode: string;
  elevationMeters: number;
  description: string;
}

export interface StationGate {
  number: number;
  name: string;
  landmark: string;
  hasLift: boolean;
  hasRamp: boolean;
  direction: string;
}

export interface StationFacility {
  id: string;
  name: string;
  type: IndoorFacilityType;
  levelId: string;
  isStepFree: boolean;
  locationDetails: string;
}

export interface StationIndoorLayout {
  stationId: string;
  stationName: string;
  isDemonstrationModel: true;
  attribution: string;
  levels: StationLevel[];
  gates: StationGate[];
  facilities: StationFacility[];
  paths: IndoorWayfindingPath[];
  accessibilityHighlights: {
    hasElevatorsToAllPlatforms: boolean;
    hasTactilePaving: boolean;
    hasWheelchairAssistance: boolean;
    hasAccessibleToilets: boolean;
    dedicatedHelpdeskContact?: string;
  };
}

/* ─── Detailed Curated Hubs ───────────────────────────────────────── */

const RAJIV_CHOWK_INDOOR: StationIndoorLayout = {
  stationId: 'RAJIV_CHOWK',
  stationName: 'Rajiv Chowk',
  isDemonstrationModel: true,
  attribution: 'Curated demonstration layout based on DMRC Connaught Place interchange architecture.',
  levels: [
    {
      id: 'L0_STREET',
      name: 'Street Level (Connaught Place)',
      shortCode: 'L0',
      elevationMeters: 0,
      description: 'Outer & Inner Circle street entrances, security screening, and pedestrian plazas.',
    },
    {
      id: 'L1_CONCOURSE',
      name: 'Mezzanine Concourse & Ticketing',
      shortCode: 'L1',
      elevationMeters: -7,
      description: 'Fare control smart gates, customer care helpdesk, central interchange hall.',
    },
    {
      id: 'L2_PLATFORM_YELLOW',
      name: 'Level -2: Yellow Line Platforms (1 & 2)',
      shortCode: 'L2-Y',
      elevationMeters: -14,
      description: 'Samaypur Badli ↔ Millennium City Centre Gurugram. Island platform configuration.',
    },
    {
      id: 'L3_PLATFORM_BLUE',
      name: 'Level -3: Blue Line Platforms (3 & 4)',
      shortCode: 'L3-B',
      elevationMeters: -20,
      description: 'Dwarka Sector 21 ↔ Noida Electronic City / Vaishali. Side platform configuration.',
    },
  ],
  gates: [
    { number: 1, name: 'Gate 1 (Radial Road 1)', landmark: 'Near Block B, Connaught Place', hasLift: true, hasRamp: true, direction: 'North-East' },
    { number: 2, name: 'Gate 2 (Radial Road 2)', landmark: 'Near PVR Plaza & Block C', hasLift: false, hasRamp: true, direction: 'East' },
    { number: 3, name: 'Gate 3 (Palika Bazar)', landmark: 'Palika Underground Market', hasLift: true, hasRamp: true, direction: 'South-East' },
    { number: 4, name: 'Gate 4 (Janpath Road)', landmark: 'Janpath Flea Market & Cottage Emporium', hasLift: false, hasRamp: false, direction: 'South' },
    { number: 5, name: 'Gate 5 (Super Bazar)', landmark: 'Near Regal Cinema Building', hasLift: true, hasRamp: true, direction: 'South-West' },
    { number: 6, name: 'Gate 6 (Radial Road 6)', landmark: 'Near Block F, Connaught Circus', hasLift: false, hasRamp: true, direction: 'West' },
    { number: 7, name: 'Gate 7 (Radial Road 7)', landmark: 'Near Marina Arcade / Block G', hasLift: true, hasRamp: true, direction: 'North-West' },
    { number: 8, name: 'Gate 8 (Odeon Cinema)', landmark: 'Near Block D & Radial Road 8', hasLift: false, hasRamp: false, direction: 'North' },
  ],
  facilities: [
    { id: 'RC-LIFT-1', name: 'Street to Concourse Elevator A', type: 'lift', levelId: 'L0_STREET', isStepFree: true, locationDetails: 'Adjacent to Gate 1 entrance' },
    { id: 'RC-LIFT-2', name: 'Concourse to Yellow Line Elevator', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Central concourse, near Customer Care' },
    { id: 'RC-LIFT-3', name: 'Concourse to Blue Line Elevator', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'South wing, adjacent to Gate 3 corridor' },
    { id: 'RC-AFC-1', name: 'Wide Wheelchair Smart Gate (Yellow)', type: 'afc_gate', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Northern fare gates 1-12' },
    { id: 'RC-AFC-2', name: 'Wide Wheelchair Smart Gate (Blue)', type: 'afc_gate', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Southern fare gates 13-24' },
    { id: 'RC-CARE', name: 'Passenger Care & Accessibility Desk', type: 'helpdesk', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Center circle, opposite Information kiosk' },
  ],
  accessibilityHighlights: {
    hasElevatorsToAllPlatforms: true,
    hasTactilePaving: true,
    hasWheelchairAssistance: true,
    hasAccessibleToilets: true,
    dedicatedHelpdeskContact: 'DMRC Helpline: 155370 / Central Care Counter',
  },
  paths: [
    {
      id: 'rc-step-free-street-to-yellow',
      title: 'Accessible Step-Free Path: Gate 1 ➔ Yellow Line Platform',
      from: 'Gate 1 (Radial Road 1)',
      to: 'Platform 1 (Yellow Line towards HUDA/Millennium City)',
      isStepFree: true,
      estimatedWalkMinutes: 4,
      steps: [
        {
          stepNumber: 1,
          instruction: 'Enter through Gate 1 street pavilion via the step-free access ramp.',
          level: 'L0_STREET',
          facilityType: 'entrance',
          landmark: 'Gate 1 glass canopy, Block B',
          isStepFree: true,
        },
        {
          stepNumber: 2,
          instruction: 'Take Street-to-Concourse Elevator A down to Level -1 (Concourse).',
          level: 'L0_STREET',
          facilityType: 'lift',
          landmark: 'Elevator A (Braille & audio-announced)',
          isStepFree: true,
        },
        {
          stepNumber: 3,
          instruction: 'Pass through the accessible wide-width security screening scanner.',
          level: 'L1_CONCOURSE',
          facilityType: 'security',
          landmark: 'Security Booth #2 (Priority lane)',
          isStepFree: true,
        },
        {
          stepNumber: 4,
          instruction: 'Tap your Smart Card / QR ticket at the extra-wide wheelchair AFC flap gate.',
          level: 'L1_CONCOURSE',
          facilityType: 'afc_gate',
          landmark: 'Wide Gate #6 (marked with International Symbol of Access)',
          isStepFree: true,
        },
        {
          stepNumber: 5,
          instruction: 'Follow tactile flooring tiles 40 meters to Elevator B (Yellow Line Platform Access).',
          level: 'L1_CONCOURSE',
          facilityType: 'corridor',
          landmark: 'Pass Customer Care desk on your left',
          isStepFree: true,
        },
        {
          stepNumber: 6,
          instruction: 'Take Elevator B down to Level -2 (Platform 1 / Samaypur Badli or Platform 2 / Millennium City).',
          level: 'L2_PLATFORM_YELLOW',
          facilityType: 'lift',
          landmark: 'Exits directly onto center of Platform 1/2 island',
          isStepFree: true,
        },
      ],
    },
    {
      id: 'rc-interchange-yellow-to-blue',
      title: 'Interchange Transfer: Yellow Line ➔ Blue Line Platform',
      from: 'Yellow Line Platform (Level -2)',
      to: 'Blue Line Platform (Level -3)',
      isStepFree: true,
      estimatedWalkMinutes: 5,
      steps: [
        {
          stepNumber: 1,
          instruction: 'Alight from train and locate the central interchange stairwell / elevator cluster.',
          level: 'L2_PLATFORM_YELLOW',
          facilityType: 'platform',
          landmark: 'Overhead signage: "Interchange to Line 3 (Blue Line)"',
          isStepFree: true,
        },
        {
          stepNumber: 2,
          instruction: 'For step-free access: Board Central Elevator C to Level -3. (For ambulatory passengers: Take escalator down).',
          level: 'L2_PLATFORM_YELLOW',
          facilityType: 'lift',
          landmark: 'Elevator C opposite Coach 4 stopping position',
          isStepFree: true,
        },
        {
          stepNumber: 3,
          instruction: 'Arrive at Mezzanine Transfer Corridor and follow color-coded blue wall strips.',
          level: 'L3_PLATFORM_BLUE',
          facilityType: 'corridor',
          landmark: 'Blue illuminated overhead guide signs',
          isStepFree: true,
        },
        {
          stepNumber: 4,
          instruction: 'Choose Platform 3 (Dwarka Sec 21) or Platform 4 (Noida / Vaishali) via corresponding platform ramp.',
          level: 'L3_PLATFORM_BLUE',
          facilityType: 'platform',
          landmark: 'Platform 3/4 boarding edge with yellow safety warning strip',
          isStepFree: true,
        },
      ],
    },
  ],
};

const KASHMERE_GATE_INDOOR: StationIndoorLayout = {
  stationId: 'KASHMERE_GATE',
  stationName: 'Kashmere Gate',
  isDemonstrationModel: true,
  attribution: 'Curated demonstration layout based on DMRC tri-line interchange (Red, Yellow, Violet).',
  levels: [
    {
      id: 'L0_STREET',
      name: 'Street Level (ISBT Inter-State Bus Terminus)',
      shortCode: 'L0',
      elevationMeters: 0,
      description: 'Street entrances connecting to ISBT, Old Delhi Railway Station road, and Lala Hardev Sahai Marg.',
    },
    {
      id: 'L1_CONCOURSE',
      name: 'Primary Transfer Concourse',
      shortCode: 'L1',
      elevationMeters: -6,
      description: 'Ticketing concourse linking elevated Red Line escalators with underground Yellow and Violet line platforms.',
    },
    {
      id: 'L2_PLATFORM_YELLOW',
      name: 'Level -2: Yellow Line Platforms',
      shortCode: 'L2-Y',
      elevationMeters: -13,
      description: 'Underground island platform for Yellow Line services.',
    },
    {
      id: 'L3_PLATFORM_VIOLET',
      name: 'Level -3: Violet Line Terminus Platforms',
      shortCode: 'L3-V',
      elevationMeters: -21,
      description: 'Underground terminus platform for the Violet Line heritage corridor towards Raja Nahar Singh.',
    },
  ],
  gates: [
    { number: 1, name: 'Gate 1 (Mori Gate)', landmark: 'Mori Gate Bus Terminal', hasLift: false, hasRamp: true, direction: 'West' },
    { number: 2, name: 'Gate 2 (ISBT Departure)', landmark: 'Direct covered bridge to Maharana Pratap ISBT', hasLift: true, hasRamp: true, direction: 'North' },
    { number: 3, name: 'Gate 3 (GPO & Old City)', landmark: 'Kashmere Gate Post Office', hasLift: false, hasRamp: false, direction: 'South' },
    { number: 4, name: 'Gate 4 (St. James Church)', landmark: 'Church Road / Lothian Road', hasLift: true, hasRamp: true, direction: 'South-East' },
    { number: 5, name: 'Gate 5 (Kashmere Gate Monument)', landmark: 'Historic Kashmiri Gate Arch', hasLift: true, hasRamp: true, direction: 'East' },
  ],
  facilities: [
    { id: 'KG-LIFT-1', name: 'ISBT Skybridge Elevator', type: 'lift', levelId: 'L0_STREET', isStepFree: true, locationDetails: 'Gate 2 ISBT link' },
    { id: 'KG-LIFT-2', name: 'Concourse to Violet Line Elevator', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Violet Line wing entrance' },
    { id: 'KG-CARE', name: 'Accessibility Operations Office', type: 'helpdesk', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Next to Gate 2 ticketing zone' },
  ],
  accessibilityHighlights: {
    hasElevatorsToAllPlatforms: true,
    hasTactilePaving: true,
    hasWheelchairAssistance: true,
    hasAccessibleToilets: true,
    dedicatedHelpdeskContact: 'DMRC Kashmere Gate Station Controller: +91 11 2386 0000',
  },
  paths: [
    {
      id: 'kg-interchange-yellow-to-violet',
      title: 'Interchange: Yellow Line ➔ Violet Line Platform',
      from: 'Yellow Line Platform (Level -2)',
      to: 'Violet Line Platform (Level -3)',
      isStepFree: true,
      estimatedWalkMinutes: 4,
      steps: [
        {
          stepNumber: 1,
          instruction: 'Alight at Yellow Line platform and follow purple illuminated floor markers toward the south escalators/lift.',
          level: 'L2_PLATFORM_YELLOW',
          facilityType: 'platform',
          landmark: 'Southern platform mezzanine entrance',
          isStepFree: true,
        },
        {
          stepNumber: 2,
          instruction: 'Board dedicated Violet Line connector elevator V-1 down to Level -3.',
          level: 'L2_PLATFORM_YELLOW',
          facilityType: 'lift',
          landmark: 'Violet Line elevator vestibule',
          isStepFree: true,
        },
        {
          stepNumber: 3,
          instruction: 'Exit elevator directly onto the Violet Line departure platform toward Raja Nahar Singh.',
          level: 'L3_PLATFORM_VIOLET',
          facilityType: 'platform',
          landmark: 'Boarding screen showing next departure',
          isStepFree: true,
        },
      ],
    },
  ],
};

const MANDI_HOUSE_INDOOR: StationIndoorLayout = {
  stationId: 'MANDI_HOUSE',
  stationName: 'Mandi House',
  isDemonstrationModel: true,
  attribution: 'Curated demonstration layout based on DMRC Blue & Violet line interchange.',
  levels: [
    {
      id: 'L0_STREET',
      name: 'Street Level (Barakhamba & Cultural District)',
      shortCode: 'L0',
      elevationMeters: 0,
      description: 'Entrances near National School of Drama, Rabindra Bhavan, and Mandi House roundabout.',
    },
    {
      id: 'L1_CONCOURSE',
      name: 'Mezzanine Interchange Concourse',
      shortCode: 'L1',
      elevationMeters: -6,
      description: 'Spacious subterranean plaza linking Blue Line and Violet Line platforms.',
    },
    {
      id: 'L2_PLATFORM_BLUE',
      name: 'Level -2: Blue Line Platforms',
      shortCode: 'L2-B',
      elevationMeters: -12,
      description: 'Dwarka Sector 21 ↔ Noida City / Vaishali.',
    },
    {
      id: 'L3_PLATFORM_VIOLET',
      name: 'Level -3: Violet Line Platforms',
      shortCode: 'L3-V',
      elevationMeters: -19,
      description: 'Kashmere Gate ↔ Raja Nahar Singh.',
    },
  ],
  gates: [
    { number: 1, name: 'Gate 1 (NSD / Copernicus Marg)', landmark: 'National School of Drama & Doordarshan', hasLift: true, hasRamp: true, direction: 'North' },
    { number: 2, name: 'Gate 2 (Barakhamba Road)', landmark: 'Himachal Bhawan & Modern School', hasLift: false, hasRamp: true, direction: 'North-West' },
    { number: 3, name: 'Gate 3 (Sikandra Road)', landmark: 'Rabindra Bhawan / Sahitya Akademi', hasLift: true, hasRamp: true, direction: 'South' },
    { number: 4, name: 'Gate 4 (Ferozeshah Road)', landmark: 'Shri Ram Centre for Performing Arts', hasLift: false, hasRamp: false, direction: 'West' },
  ],
  facilities: [
    { id: 'MH-LIFT-1', name: 'Street Elevator (Gate 1)', type: 'lift', levelId: 'L0_STREET', isStepFree: true, locationDetails: 'Gate 1 entrance plaza' },
    { id: 'MH-LIFT-2', name: 'Interchange Connector Elevator', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Central interchange concourse' },
  ],
  accessibilityHighlights: {
    hasElevatorsToAllPlatforms: true,
    hasTactilePaving: true,
    hasWheelchairAssistance: true,
    hasAccessibleToilets: true,
  },
  paths: [
    {
      id: 'mh-interchange-violet-to-blue',
      title: 'Interchange: Violet Line ➔ Blue Line Platform',
      from: 'Violet Line Platform (Level -3)',
      to: 'Blue Line Platform (Level -2)',
      isStepFree: true,
      estimatedWalkMinutes: 3,
      steps: [
        {
          stepNumber: 1,
          instruction: 'Alight at Violet Line platform and head towards the central interchange vertical hub.',
          level: 'L3_PLATFORM_VIOLET',
          facilityType: 'platform',
          landmark: 'Blue Line transfer arrows on floor tiles',
          isStepFree: true,
        },
        {
          stepNumber: 2,
          instruction: 'Take Lift MH-LIFT-2 or escalator up one level to Level -2 (Blue Line).',
          level: 'L2_PLATFORM_BLUE',
          facilityType: 'lift',
          landmark: 'Platform 1 (Noida/Vaishali) and Platform 2 (Dwarka)',
          isStepFree: true,
        },
        {
          stepNumber: 3,
          instruction: 'Board Blue Line train toward your destination.',
          level: 'L2_PLATFORM_BLUE',
          facilityType: 'platform',
          landmark: 'Electronic passenger information display',
          isStepFree: true,
        },
      ],
    },
  ],
};

const CENTRAL_SECRETARIAT_INDOOR: StationIndoorLayout = {
  stationId: 'CENTRAL_SECRETARIAT',
  stationName: 'Central Secretariat',
  isDemonstrationModel: true,
  attribution: 'Curated demonstration layout based on DMRC Yellow & Violet line cross-platform interchange.',
  levels: [
    {
      id: 'L0_STREET',
      name: 'Street Level (Rajpath & Krishi Bhawan)',
      shortCode: 'L0',
      elevationMeters: 0,
      description: 'Government ministry complex, Kartavya Path, Udyog Bhawan border.',
    },
    {
      id: 'L1_CONCOURSE',
      name: 'Concourse & Security Zone',
      shortCode: 'L1',
      elevationMeters: -6,
      description: 'Security screening, customer care, and wide corridor walkways.',
    },
    {
      id: 'L2_PLATFORM_UPPER',
      name: 'Platform Level 1 (Yellow & Violet Interchange)',
      shortCode: 'L2-UP',
      elevationMeters: -12,
      description: 'Same-direction cross-platform interchange level.',
    },
    {
      id: 'L3_PLATFORM_LOWER',
      name: 'Platform Level 2 (Opposite Direction)',
      shortCode: 'L3-DN',
      elevationMeters: -18,
      description: 'Lower level platforms for reverse services.',
    },
  ],
  gates: [
    { number: 1, name: 'Gate 1 (Krishi Bhawan)', landmark: 'Ministry of Agriculture', hasLift: true, hasRamp: true, direction: 'North' },
    { number: 2, name: 'Gate 2 (Rail Bhawan)', landmark: 'Ministry of Railways', hasLift: false, hasRamp: true, direction: 'North-East' },
    { number: 3, name: 'Gate 3 (Udyog Bhawan Link)', landmark: 'Dr. Rajendra Prasad Road', hasLift: true, hasRamp: true, direction: 'South' },
    { number: 4, name: 'Gate 4 (Shastri Bhawan)', landmark: 'Ministry of Education & Law', hasLift: false, hasRamp: false, direction: 'West' },
    { number: 5, name: 'Gate 5 (Kartavya Path)', landmark: 'National Museum & Central Vista', hasLift: true, hasRamp: true, direction: 'South-East' },
  ],
  facilities: [
    { id: 'CS-LIFT-1', name: 'Main Concourse Lift', type: 'lift', levelId: 'L0_STREET', isStepFree: true, locationDetails: 'Gate 1 Krishi Bhawan entrance' },
    { id: 'CS-LIFT-2', name: 'Platform 1/2 Cross Lift', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Upper platform connector' },
  ],
  accessibilityHighlights: {
    hasElevatorsToAllPlatforms: true,
    hasTactilePaving: true,
    hasWheelchairAssistance: true,
    hasAccessibleToilets: true,
  },
  paths: [
    {
      id: 'cs-cross-platform-transfer',
      title: 'Fast Cross-Platform Transfer: Yellow Line ➔ Violet Line',
      from: 'Yellow Line Platform (Level -2)',
      to: 'Violet Line Platform (Level -2)',
      isStepFree: true,
      estimatedWalkMinutes: 1,
      steps: [
        {
          stepNumber: 1,
          instruction: 'Alight from Yellow Line train onto the shared island platform.',
          level: 'L2_PLATFORM_UPPER',
          facilityType: 'platform',
          landmark: 'Platform screen displays',
          isStepFree: true,
        },
        {
          stepNumber: 2,
          instruction: 'Walk 15 meters directly across the platform to board the adjacent Violet Line train (Cross-Platform Connection).',
          level: 'L2_PLATFORM_UPPER',
          facilityType: 'corridor',
          landmark: 'Platform edge with tactile paving',
          isStepFree: true,
        },
      ],
    },
  ],
};

const BOTANICAL_GARDEN_INDOOR: StationIndoorLayout = {
  stationId: 'BOTANICAL_GARDEN',
  stationName: 'Botanical Garden',
  isDemonstrationModel: true,
  attribution: 'Curated demonstration layout based on DMRC Blue & Magenta line interchange in Noida.',
  levels: [
    {
      id: 'L0_STREET',
      name: 'Street Level (Captain Shashi Kant Marg)',
      shortCode: 'L0',
      elevationMeters: 0,
      description: 'Noida Sector 38 bus stand, auto bays, and entrance ramps.',
    },
    {
      id: 'L1_CONCOURSE',
      name: 'Elevated Concourse & Ticketing',
      shortCode: 'L1',
      elevationMeters: 6,
      description: 'Ticketing kiosks, security check, skybridge transfer bridge.',
    },
    {
      id: 'L2_PLATFORM_BLUE',
      name: 'Level +2: Blue Line Platforms',
      shortCode: 'L2-B',
      elevationMeters: 13,
      description: 'Elevated island platform toward Dwarka Sector 21 / Noida Electronic City.',
    },
  ],
  gates: [
    { number: 1, name: 'Gate 1 (Sector 38A / GIP Mall)', landmark: 'Great India Place & Worlds of Wonder', hasLift: true, hasRamp: true, direction: 'West' },
    { number: 2, name: 'Gate 2 (Botanical Garden)', landmark: 'Noida Botanical Garden Park entrance', hasLift: false, hasRamp: true, direction: 'East' },
    { number: 3, name: 'Gate 3 (Amity University Link)', landmark: 'Shashi Kant Marg bus bay', hasLift: true, hasRamp: true, direction: 'South' },
  ],
  facilities: [
    { id: 'BG-LIFT-1', name: 'Street to Concourse Elevator', type: 'lift', levelId: 'L0_STREET', isStepFree: true, locationDetails: 'Gate 1 plaza' },
    { id: 'BG-LIFT-2', name: 'Concourse to Blue Line Platform Elevator', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Central ticket concourse' },
  ],
  accessibilityHighlights: {
    hasElevatorsToAllPlatforms: true,
    hasTactilePaving: true,
    hasWheelchairAssistance: true,
    hasAccessibleToilets: true,
  },
  paths: [
    {
      id: 'bg-step-free-boarding',
      title: 'Accessible Step-Free Path: Gate 1 ➔ Platform',
      from: 'Gate 1 (Sector 38A)',
      to: 'Blue Line Platform towards Dwarka / Noida City',
      isStepFree: true,
      estimatedWalkMinutes: 3,
      steps: [
        {
          stepNumber: 1,
          instruction: 'Enter via Gate 1 ramp and take the street elevator up to Concourse level.',
          level: 'L0_STREET',
          facilityType: 'entrance',
          landmark: 'Gate 1 entrance ramp',
          isStepFree: true,
        },
        {
          stepNumber: 2,
          instruction: 'Clear security checkpoint and tap your card at wide wheelchair smart gate #4.',
          level: 'L1_CONCOURSE',
          facilityType: 'afc_gate',
          landmark: 'Wheelchair flap barrier',
          isStepFree: true,
        },
        {
          stepNumber: 3,
          instruction: 'Take Platform Elevator BG-LIFT-2 up to Platform level.',
          level: 'L2_PLATFORM_BLUE',
          facilityType: 'lift',
          landmark: 'Elevator door opens to center of platform',
          isStepFree: true,
        },
      ],
    },
  ],
};

/* ─── Registry of Curated Hubs ────────────────────────────────────── */

const CURATED_INDOOR_REGISTRY: Record<string, StationIndoorLayout> = {
  RAJIV_CHOWK: RAJIV_CHOWK_INDOOR,
  KASHMERE_GATE: KASHMERE_GATE_INDOOR,
  MANDI_HOUSE: MANDI_HOUSE_INDOOR,
  CENTRAL_SECRETARIAT: CENTRAL_SECRETARIAT_INDOOR,
  BOTANICAL_GARDEN: BOTANICAL_GARDEN_INDOOR,
};

/* ─── Dynamic Standard Station Fallback Model ─────────────────────── */

export function getStationIndoorLayout(
  stationId: string,
  stationName: string,
  lines: string[] = ['YELLOW'],
  _isInterchange: boolean = false
): StationIndoorLayout {
  if (CURATED_INDOOR_REGISTRY[stationId]) {
    return CURATED_INDOOR_REGISTRY[stationId];
  }

  // Generate an authentic modular layout for any standard station
  const isElevated = stationId.includes('NOIDA') || stationId.includes('DWARKA') || stationId.includes('BADLI');
  const levelPrefix = isElevated ? '+' : '-';

  return {
    stationId,
    stationName,
    isDemonstrationModel: true,
    attribution: 'Modular demonstration station model derived from standard DMRC two-level station specifications.',
    levels: [
      {
        id: 'L0_STREET',
        name: 'Street Level & Entrances',
        shortCode: 'L0',
        elevationMeters: 0,
        description: 'Roadside pavilions, passenger drop-off, and security portals.',
      },
      {
        id: 'L1_CONCOURSE',
        name: `${isElevated ? 'Elevated' : 'Subterranean'} Concourse`,
        shortCode: 'L1',
        elevationMeters: isElevated ? 6 : -6,
        description: 'Ticket vending machines, customer care helpdesk, and AFC flap barriers.',
      },
      {
        id: 'L2_PLATFORM',
        name: `Platform Level (${lines.join(' & ')} Line)`,
        shortCode: 'L2',
        elevationMeters: isElevated ? 12 : -12,
        description: `Dedicated passenger boarding platforms (${levelPrefix}${isElevated ? '12m' : '12m'}).`,
      },
    ],
    gates: [
      { number: 1, name: 'Gate 1 (Main Street)', landmark: `${stationName} Main Road Crossing`, hasLift: true, hasRamp: true, direction: 'North' },
      { number: 2, name: 'Gate 2 (Residential / Market)', landmark: `${stationName} Market Connector`, hasLift: true, hasRamp: true, direction: 'South' },
    ],
    facilities: [
      { id: `${stationId}-LIFT-1`, name: 'Street-to-Concourse Elevator', type: 'lift', levelId: 'L0_STREET', isStepFree: true, locationDetails: 'Gate 1 access pavilion' },
      { id: `${stationId}-LIFT-2`, name: 'Concourse-to-Platform Elevator', type: 'lift', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Central concourse, adjacent to Customer Care' },
      { id: `${stationId}-AFC-1`, name: 'Accessible Wide Smart Gate', type: 'afc_gate', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Gate line entry #1' },
      { id: `${stationId}-CARE`, name: 'Station Controller / Customer Care', type: 'helpdesk', levelId: 'L1_CONCOURSE', isStepFree: true, locationDetails: 'Unpaid concourse center' },
    ],
    accessibilityHighlights: {
      hasElevatorsToAllPlatforms: true,
      hasTactilePaving: true,
      hasWheelchairAssistance: true,
      hasAccessibleToilets: true,
      dedicatedHelpdeskContact: 'DMRC Passenger Helpline: 155370',
    },
    paths: [
      {
        id: `${stationId}-step-free-route`,
        title: `Step-Free Wayfinding: Gate 1 ➔ ${stationName} Platform`,
        from: 'Gate 1 Street Entrance',
        to: `${stationName} Boarding Platform`,
        isStepFree: true,
        estimatedWalkMinutes: 3,
        steps: [
          {
            stepNumber: 1,
            instruction: 'Enter via Gate 1 step-free access ramp.',
            level: 'L0_STREET',
            facilityType: 'entrance',
            landmark: 'Gate 1 entrance totem',
            isStepFree: true,
          },
          {
            stepNumber: 2,
            instruction: 'Take the Street Elevator down/up to Concourse level.',
            level: 'L0_STREET',
            facilityType: 'lift',
            landmark: 'Audio-announced elevator',
            isStepFree: true,
          },
          {
            stepNumber: 3,
            instruction: 'Pass security inspection and scan ticket at the wide wheelchair gate.',
            level: 'L1_CONCOURSE',
            facilityType: 'afc_gate',
            landmark: 'Wide gate adjacent to Station Care kiosk',
            isStepFree: true,
          },
          {
            stepNumber: 4,
            instruction: 'Follow the tactile paving guide directly to the platform elevator to reach train boarding edge.',
            level: 'L2_PLATFORM',
            facilityType: 'lift',
            landmark: 'Direct platform elevator',
            isStepFree: true,
          },
        ],
      },
    ],
  };
}
