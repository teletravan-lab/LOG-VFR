import { FlightPlan, NavLeg, Waypoint } from '../types';
import { FRENCH_AERODROMES } from '../data/aerodromes';
import { fetchAerodromeDetails, fetchSunTimes } from './openaip';
import { calculateNavLegValues } from '../lib/navCalc';

export interface GpxRawPoint {
  name: string;
  lat: number;
  lon: number;
}

/**
 * Analyse le texte brut d'un fichier GPX (XML) et extrait les points ordonnés.
 * Recherche en priorité les <rtept> d'une route <rte>, sinon les <wpt>.
 */
export function parseGpxPoints(xmlText: string): GpxRawPoint[] {
  if (!xmlText || !xmlText.trim()) {
    throw new Error('Le fichier GPX est vide.');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  // Détection des erreurs d'analyse XML du navigateur
  const parserError =
    doc.querySelector('parsererror') ||
    doc.getElementsByTagName('parsererror').length > 0;
  if (parserError) {
    throw new Error("Le fichier sélectionné n'est pas un fichier XML valide.");
  }

  // 1. Recherche des points de route <rte> et <rtept>
  const rteElements = doc.getElementsByTagName('rte');
  let pointNodes: Element[] = [];

  if (rteElements.length > 0) {
    for (let r = 0; r < rteElements.length; r++) {
      const pts = rteElements[r].getElementsByTagName('rtept');
      for (let p = 0; p < pts.length; p++) {
        pointNodes.push(pts[p]);
      }
    }
  }

  // 2. Si aucune route ou aucun rtept, recherche des waypoints <wpt>
  if (pointNodes.length === 0) {
    const wpts = doc.getElementsByTagName('wpt');
    for (let w = 0; w < wpts.length; w++) {
      pointNodes.push(wpts[w]);
    }
  }

  if (pointNodes.length === 0) {
    throw new Error('Aucun point de navigation (<rtept> ou <wpt>) trouvé dans le fichier GPX.');
  }

  if (pointNodes.length < 2) {
    throw new Error('Le plan de vol GPX doit contenir au moins 2 points (départ et arrivée).');
  }

  const points: GpxRawPoint[] = [];

  for (let i = 0; i < pointNodes.length; i++) {
    const node = pointNodes[i];
    const latAttr = node.getAttribute('lat');
    const lonAttr = node.getAttribute('lon');
    const nameNodes = node.getElementsByTagName('name');
    const rawName = nameNodes.length > 0 ? nameNodes[0].textContent?.trim() : undefined;
    const name = rawName && rawName.length > 0 ? rawName : `Point ${i + 1}`;

    if (latAttr === null || lonAttr === null || latAttr.trim() === '' || lonAttr.trim() === '') {
      throw new Error(`Coordonnées GPS manquantes pour le point "${name}".`);
    }

    const lat = parseFloat(latAttr);
    const lon = parseFloat(lonAttr);

    if (
      isNaN(lat) ||
      isNaN(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new Error(`Coordonnées GPS invalides pour le point "${name}" (lat: "${latAttr}", lon: "${lonAttr}").`);
    }

    points.push({ name, lat, lon });
  }

  return points;
}

/**
 * Convertit un point GPX en Waypoint pour le plan de vol.
 * Vérifie la correspondance OACI avec FRENCH_AERODROMES.
 */
async function buildWaypointFromGpx(
  pt: GpxRawPoint,
  id: string,
  openAipApiKey?: string
): Promise<Waypoint> {
  const cleanName = pt.name.trim();
  const oaciCandidate = cleanName.toUpperCase();
  const matchedEntry = FRENCH_AERODROMES.find(
    (a) => a.oaci.toUpperCase() === oaciCandidate
  );

  if (matchedEntry) {
    let details = null;
    try {
      details = await fetchAerodromeDetails(matchedEntry.id, openAipApiKey);
    } catch {
      // Offline ou indisponible : on continue avec les données d'index
    }

    return {
      id,
      type: 'aerodrome',
      name: `${matchedEntry.oaci} ${details?.name || matchedEntry.name}`,
      oaci: matchedEntry.oaci,
      openAipId: matchedEntry.id,
      coordinates: details?.elevationFt ? `Alt ${details.elevationFt}ft` : '',
      notes: '',
      tableNotes: '',
      frequencies: details?.frequencies || {},
      elevationFt: details?.elevationFt,
      runways: details?.runways,
      // Les coordonnées viennent TOUJOURS du GPX
      lat: pt.lat,
      lng: pt.lon,
    };
  }

  return {
    id,
    type: 'gps',
    name: cleanName,
    notes: '',
    tableNotes: '',
    // Les coordonnées viennent TOUJOURS du GPX
    lat: pt.lat,
    lng: pt.lon,
  };
}

/**
 * Importe un fichier GPX et applique les points et branches calculées au FlightPlan existant.
 * Conserve tous les paramètres du vol (avion, immat, vitesses, carburant, QNH, météo, notes).
 * Ne calcule que RM et DIST pour chaque branche.
 */
export async function importGpxToFlightPlan(
  xmlText: string,
  currentFlightPlan: FlightPlan,
  openAipApiKey?: string
): Promise<FlightPlan> {
  const points = parseGpxPoints(xmlText);
  const n = points.length - 1; // n branches, n+1 points

  // P0 = départ
  const p0 = points[0];
  const departure = await buildWaypointFromGpx(p0, `dep-${Date.now()}`, openAipApiKey);

  // Pn = arrivée
  const pn = points[points.length - 1];
  const destination = await buildWaypointFromGpx(pn, `dest-${Date.now()}`, openAipApiKey);

  // Récupération des éphémérides (lever / coucher de soleil) pour l'aérodrome d'arrivée et de départ
  const flightDate = currentFlightPlan.flightDate || new Date().toISOString().split('T')[0];
  if (destination.lat !== undefined && destination.lng !== undefined) {
    try {
      const destSunTimes = await fetchSunTimes(destination.lat, destination.lng, flightDate);
      if (destSunTimes) {
        destination.sunriseLocal = destSunTimes.sunriseLocal;
        destination.sunriseUtc = destSunTimes.sunriseUtc;
        destination.sunsetLocal = destSunTimes.sunsetLocal;
        destination.sunsetUtc = destSunTimes.sunsetUtc;
        destination.vfrDayStartLocal = destSunTimes.vfrDayStartLocal;
        destination.vfrDayStartUtc = destSunTimes.vfrDayStartUtc;
        destination.vfrDayEndLocal = destSunTimes.vfrDayEndLocal;
        destination.vfrDayEndUtc = destSunTimes.vfrDayEndUtc;
      }
    } catch (err) {
      console.warn('Erreur éphémérides GPX destination:', err);
    }
  }

  if (departure.lat !== undefined && departure.lng !== undefined) {
    try {
      const depSunTimes = await fetchSunTimes(departure.lat, departure.lng, flightDate);
      if (depSunTimes) {
        departure.sunriseLocal = depSunTimes.sunriseLocal;
        departure.sunriseUtc = depSunTimes.sunriseUtc;
        departure.sunsetLocal = depSunTimes.sunsetLocal;
        departure.sunsetUtc = depSunTimes.sunsetUtc;
        departure.vfrDayStartLocal = depSunTimes.vfrDayStartLocal;
        departure.vfrDayStartUtc = depSunTimes.vfrDayStartUtc;
        departure.vfrDayEndLocal = depSunTimes.vfrDayEndLocal;
        departure.vfrDayEndUtc = depSunTimes.vfrDayEndUtc;
      }
    } catch (err) {
      console.warn('Erreur éphémérides GPX départ:', err);
    }
  }

  // P1 à P(n-1) = waypoints
  const waypoints: Waypoint[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const wp = await buildWaypointFromGpx(
      points[i],
      `wp-${Date.now()}-${i}`,
      openAipApiKey
    );
    waypoints.push(wp);
  }

  // Exactement n branches : branche i de Pi à P(i+1)
  // legs.length === waypoints.length + 1
  const legs: NavLeg[] = [];
  for (let i = 0; i < n; i++) {
    const startPt = points[i];
    const endPt = points[i + 1];
    const { rm, dist } = calculateNavLegValues(
      startPt.lat,
      startPt.lon,
      endPt.lat,
      endPt.lon
    );

    legs.push({
      id: `leg-${Date.now()}-${i}`,
      alt: '',
      rm,
      dist,
      tSansVw: '',
      tAvecVw: '',
      ete: '',
      temps: '',
      eta: '',
      ata: '',
      consoTotale: '',
      notes: '',
    });
  }

  return {
    ...currentFlightPlan,
    departure,
    destination,
    waypoints,
    legs,
    destinationSunriseLocal: destination.sunriseLocal || '',
    destinationSunsetLocal: destination.sunsetLocal || '',
    // Totaux laissés au pilote
    totalDistOverride: '',
    totalEteOverride: '',
    totalConsoOverride: '',
  };
}
