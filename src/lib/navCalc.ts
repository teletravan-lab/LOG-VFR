import { magvar } from 'magvar';

/**
 * Constante du rayon terrestre en milles nautiques (NM)
 */
export const EARTH_RADIUS_NM = 3440.065;

/**
 * Convertit des degrés en radians
 */
export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convertit des radians en degrés
 */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Calcule la distance grand cercle en milles nautiques (NM) via la formule de Haversine.
 * Rayon terrestre R = 3440.065 NM.
 */
export function calculateHaversineDistanceNm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaPhi = toRadians(lat2 - lat1);
  const deltaLambda = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));

  return EARTH_RADIUS_NM * c;
}

/**
 * Calcule la route vraie loxodromique (Rhumb line) en degrés entre 2 points :
 * Δφ = φ2 − φ1 ; Δλ ramené sur [−π, π]
 * Δψ = ln( tan(π/4 + φ2/2) / tan(π/4 + φ1/2) )
 * Rv = atan2(Δλ, Δψ), convertie en degrés et normalisée sur [0, 360[
 */
export function calculateTrueCourseDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  let deltaLambda = toRadians(lon2 - lon1);
  // Δλ ramené sur [−π, π]
  while (deltaLambda > Math.PI) deltaLambda -= 2 * Math.PI;
  while (deltaLambda < -Math.PI) deltaLambda += 2 * Math.PI;

  const deltaPsi = Math.log(
    Math.tan(Math.PI / 4 + phi2 / 2) / Math.tan(Math.PI / 4 + phi1 / 2)
  );

  let rvRad = Math.atan2(deltaLambda, deltaPsi);
  let rvDeg = toDegrees(rvRad);

  // Normalisation sur [0, 360[
  rvDeg = (rvDeg % 360 + 360) % 360;
  return rvDeg;
}

/**
 * Calcule les coordonnées du milieu géographique d'une branche.
 */
export function calculateMidpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { lat: number; lon: number } {
  const latMid = (lat1 + lat2) / 2;
  let dLon = ((lon2 - lon1 + 540) % 360) - 180;
  let lonMid = lon1 + dLon / 2;
  if (lonMid > 180) lonMid -= 360;
  if (lonMid < -180) lonMid += 360;
  return { lat: latMid, lon: lonMid };
}

/**
 * Calcule la déclinaison magnétique locale en degrés au modèle WMM2025 (2025-2030).
 * Déclinaison Est positive.
 * Aucun appel réseau.
 */
export function calculateMagneticDeclinationDeg(lat: number, lon: number): number {
  return magvar(lat, lon, 0);
}

/**
 * Formate la Route Magnétique :
 * Arrondie au degré, sur 3 chiffres, 000 affiché 360 (ex. "045", "360").
 */
export function formatMagneticHeading(rmDeg: number): string {
  const norm = (rmDeg % 360 + 360) % 360;
  const rounded = Math.round(norm);
  if (rounded === 0 || rounded === 360) {
    return '360';
  }
  return String(rounded).padStart(3, '0');
}

/**
 * Formate la distance :
 * Arrondie au NM entier le plus proche, sans décimale (ex. "12").
 */
export function formatDistance(distNm: number): string {
  return String(Math.round(distNm));
}

/**
 * Calcule la RM et la distance d'un tronçon en pleine précision sans arrondi intermédiaire,
 * et ne formate qu'à la sortie (RM sur 3 chiffres, distance en entier).
 */
export function calculateNavLegValues(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { rm: string; dist: string } {
  const distRaw = calculateHaversineDistanceNm(lat1, lon1, lat2, lon2);
  const rvRaw = calculateTrueCourseDeg(lat1, lon1, lat2, lon2);
  const mid = calculateMidpoint(lat1, lon1, lat2, lon2);
  const declination = calculateMagneticDeclinationDeg(mid.lat, mid.lon);
  const rmRaw = rvRaw - declination;

  return {
    rm: formatMagneticHeading(rmRaw),
    dist: formatDistance(distRaw),
  };
}
