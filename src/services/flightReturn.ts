import { FlightPlan, Waypoint, NavLeg, AerodromeInfo } from '../types';
import { formatAerodromeNotes } from './openaip';
import { FRENCH_AERODROMES } from '../data/aerodromes';

/**
 * Récupère les données d'un aérodrome depuis le cache localStorage (ou FRENCH_AERODROMES)
 */
export function getCachedAerodromeInfo(openAipId?: string, oaci?: string): AerodromeInfo | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  // 1. Recherche directe par openAipId si disponible
  if (openAipId) {
    try {
      const cached = localStorage.getItem('oaip:id:' + openAipId);
      if (cached) return JSON.parse(cached) as AerodromeInfo;
    } catch {
      // ignore
    }
  }

  // 2. Recherche par OACI dans FRENCH_AERODROMES
  const cleanOaci = (oaci || '').trim().toUpperCase();
  if (cleanOaci) {
    const aero = FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === cleanOaci);
    if (aero?.id) {
      try {
        const cached = localStorage.getItem('oaip:id:' + aero.id);
        if (cached) return JSON.parse(cached) as AerodromeInfo;
      } catch {
        // ignore
      }
    }
  }

  // 3. Parcours de toutes les clés oaip:id:* en localStorage pour retrouver l'OACI correspondant
  if (cleanOaci) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('oaip:id:')) {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val) as AerodromeInfo;
            if (parsed?.oaci?.toUpperCase() === cleanOaci) {
              return parsed;
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Régénère les notes d'un waypoint de type aérodrome via formatAerodromeNotes
 * à partir des données OpenAIP en cache, jamais recopiées.
 */
export function regenerateWaypointNotes(wp: Waypoint): string {
  if (wp.type !== 'aerodrome') {
    return '';
  }
  const cachedInfo = getCachedAerodromeInfo(wp.openAipId, wp.oaci);
  return formatAerodromeNotes(cachedInfo, wp.oaci || wp.name);
}

// RM et ALTITUDE ne sont jamais recopiés : la route inverse impose un autre cap,
// et la règle semi-circulaire des niveaux VFR inverse la parité des altitudes.
// Les recopier produirait des valeurs réglementairement fausses.
export function createReturnFlightPlan(outbound: FlightPlan): FlightPlan {
  // Départ et arrivée permutés
  const returnDeparture: Waypoint = {
    ...outbound.destination,
    id: `ret-dep-${Date.now()}`,
    notes:
      outbound.destination.type === 'aerodrome'
        ? regenerateWaypointNotes(outbound.destination)
        : '',
    tableNotes: '',
    integration: '',
  };

  const returnDestination: Waypoint = {
    ...outbound.departure,
    id: `ret-dest-${Date.now()}`,
    notes:
      outbound.departure.type === 'aerodrome'
        ? regenerateWaypointNotes(outbound.departure)
        : '',
    tableNotes: '',
    integration: '',
    tdpQnhFt:
      outbound.departure.elevationFt !== undefined
        ? `${Math.round((outbound.departure.elevationFt + 1000) / 100) * 100}`
        : '',
  };

  // Waypoints intermédiaires en ordre inverse
  const reversedWaypoints: Waypoint[] = (outbound.waypoints || [])
    .slice()
    .reverse()
    .map((wp, idx) => ({
      ...wp,
      id: `ret-wp-${Date.now()}-${idx + 1}`,
      notes: wp.type === 'aerodrome' ? regenerateWaypointNotes(wp) : '',
      tableNotes: '',
    }));

  // Tronçons (legs) :
  // Le tronçon j du retour correspond au tronçon (N - 1 - j) de l'aller en sens inverse.
  // Repris tels quels pour chaque tronçon : DIST, T SANS VW.
  // Vidés pour chaque tronçon : RM, ALTITUDE, T AVEC VW, ETA, ATA, NOTES.
  const outboundLegs = outbound.legs || [];
  const numLegs = reversedWaypoints.length + 1;
  const returnLegs: NavLeg[] = [];

  for (let j = 0; j < numLegs; j++) {
    const sourceIdx = outboundLegs.length - 1 - j;
    const sourceLeg =
      sourceIdx >= 0 && sourceIdx < outboundLegs.length ? outboundLegs[sourceIdx] : undefined;

    returnLegs.push({
      id: `ret-leg-${Date.now()}-${j}`,
      dist: sourceLeg?.dist || '',
      tSansVw: sourceLeg?.tSansVw || '',
      rm: '',
      alt: '',
      tAvecVw: '',
      ete: '',
      eta: '',
      ata: '',
      consoTotale: '',
      notes: '',
      temps: '',
      heureEst: '',
      heureReelle: '',
    });
  }

  return {
    // Mêmes avion, consommation horaire, vitesse propre, carburant, réserve
    aircraftModel: outbound.aircraftModel,
    aircraftReg: outbound.aircraftReg,
    fuelPerHour: outbound.fuelPerHour,
    cruiseSpeedKt: outbound.cruiseSpeedKt,
    fuelOnBoard: outbound.fuelOnBoard,
    taxiFuel: outbound.taxiFuel,
    reserveMin: outbound.reserveMin,

    // Même date que l'aller
    flightDate: outbound.flightDate,

    // Heure de départ, QNH et vent vidés
    departureTime: '',
    altimeterQnh: '',
    windInfo: '',
    squawk: outbound.squawk || '7000',

    departure: returnDeparture,
    destination: returnDestination,
    waypoints: reversedWaypoints,
    legs: returnLegs,

    // Totaux : Dist Tot conservée ; ETE Tot et Conso Tot vidés
    totalDistOverride: outbound.totalDistOverride || '',
    totalEteOverride: '',
    totalConsoOverride: '',

    generalNotes: '',
    destinationSunriseLocal: outbound.departure.sunriseLocal || '',
    destinationSunsetLocal: outbound.departure.sunsetLocal || '',
  };
}
