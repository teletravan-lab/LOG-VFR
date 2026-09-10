export type WaypointType = 'aerodrome' | 'ville' | 'gps' | 'vide' | 'custom';

export interface AerodromeFrequency {
  atis?: string;
  twr?: string;
  gnd?: string;
  afis?: string;
  aa?: string;
  afis_aa?: string;
  app?: string;
  siv?: string;
}

export interface AerodromeInfo {
  oaci: string;
  name: string;
  openAipId?: string;
  city?: string;
  region?: string;
  elevationFt?: number;
  runways?: string;
  frequencies: AerodromeFrequency;
  notes?: string;
  lat?: number;
  lon?: number;
  isUlm?: boolean;
}

export interface Waypoint {
  id: string;
  type: WaypointType;
  name: string;
  oaci?: string;
  openAipId?: string;
  coordinates?: string;
  notes: string;
  tableNotes?: string;
  frequencies?: AerodromeFrequency;
  elevationFt?: number;
  runways?: string;
  tdpQnhFt?: string;
  integration?: string;
  lat?: number;
  lng?: number;
  sunriseUtc?: string;
  sunriseLocal?: string;
  sunsetUtc?: string;
  sunsetLocal?: string;
  vfrDayStartUtc?: string;
  vfrDayStartLocal?: string;
  vfrDayEndUtc?: string;
  vfrDayEndLocal?: string;
}

export interface NavLeg {
  id: string;
  alt: string;         // altitude, e.g. "2000 ft", "1500 ft"
  rm: string;          // Route Magnétique, e.g. "292°"
  dist: string;        // Distance en NM, e.g. "14"
  tSansVw?: string;    // Temps sans vent (min)
  tAvecVw?: string;    // Temps avec vent (min)
  ete: string;         // ETE (Estimated Time Enroute) en min, e.g. "9"
  eta: string;         // ETA (Estimated Time of Arrival), e.g. "10:24"
  ata?: string;        // ATA (Actual Time of Arrival), e.g. "10:26"
  consoTotale: string; // Conso totale (L) cumulée sur le tronçon, e.g. "2.6 L"
  notes: string;       // Remarques de tronçon (alt sécu, repères, fréquence SIV)
  // Backward compatibility:
  temps?: string;
  heureEst?: string;
  heureReelle?: string;
}

export interface FlightPlan {
  aircraftModel: string;   // Default "P200"
  aircraftReg?: string;    // e.g. "F-HXYZ"
  fuelPerHour: number;     // Default 17 (L/h)
  cruiseSpeedKt: number;   // Vitesse propre Vp (kt)
  departureTime?: string;  // Heure de départ prévue (ex: "10:00")
  fuelOnBoard: number;     // Carburant total à bord (L)
  taxiFuel: number;        // Forfait roulage (L)
  reserveMin: number;      // Réserve réglementaire (30 min par défaut)
  flightDate: string;      // Date du vol
  altimeterQnh: string;    // QNH (hPa)
  windInfo: string;        // Vent météo (ex: 240/15kt)
  squawk: string;          // Transpondeur (ex: 7000)
  departure: Waypoint;
  destination: Waypoint;
  waypoints: Waypoint[];
  legs: NavLeg[];          // legs.length === waypoints.length + 1
  generalNotes?: string;   // Notes libres pour la boîte du bas
  destinationSunriseLocal?: string;
  destinationSunsetLocal?: string;
  totalDistOverride?: string;
  totalEteOverride?: string;
  totalConsoOverride?: string;
}

export interface StoredFlightLog {
  id: string;
  outbound: FlightPlan;
  return: FlightPlan | null;
  activeLeg: 'outbound' | 'return';
  flightPlan?: FlightPlan; // Compatibilité ascendante
  createdAt: string;
  updatedAt: string;
  expiresAt: any;
}
