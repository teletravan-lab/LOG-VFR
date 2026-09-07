import { AerodromeInfo } from '../types';
import { FRENCH_AERODROMES, formatAerodromeNotes, searchAerodromes } from '../data/aerodromes';

export interface OpenAIPAirport {
  _id?: string;
  name: string;
  icaoCode?: string;
  iataCode?: string;
  country?: string;
  elevation?: { value: number; unit: number }; // 0: m, 1: ft
  frequencies?: Array<{
    type: number; // 0: Approach, 1: ATIS, 2: Tower, 3: Ground, etc.
    value: string;
    name?: string;
  }>;
}

export const DEFAULT_OPENAIP_KEY = '62b567343cce3397cdb4ea8a530ae752';

export interface ArrivalAirportResult {
  oaci: string;
  name: string;
  lat?: number;
  lng?: number;
  elevationFt?: number;
  frequencies: {
    atis?: string;
    twr?: string;
    gnd?: string;
    afis?: string;
    aa?: string;
    afis_aa?: string;
    app?: string;
    siv?: string;
  };
  runways?: string;
  tdpQnhFt?: string;
  integration?: string;
  sunriseUtc?: string;
  sunriseLocal?: string;
  sunsetUtc?: string;
  sunsetLocal?: string;
  vfrDayStartUtc?: string;
  vfrDayStartLocal?: string;
  vfrDayEndUtc?: string;
  vfrDayEndLocal?: string;
  rawNotes?: string;
}

/**
 * Récupère les données d'un terrain depuis OpenAIP, par code OACI exact.
 * Renvoie null si OpenAIP ne connaît pas ce code : on préfère des champs
 * vides à des valeurs approchantes sur une planchette de vol.
 * Le résultat est mis en cache dans localStorage.
 */

export async function fetchAerodromeDetails(
  oaci: string,
  apiKey: string = DEFAULT_OPENAIP_KEY
): Promise<AerodromeInfo | null> {
  const code = (oaci || '').trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) return null;
  
  try {
    const cached = localStorage.getItem('AERO_CACHE_' + code);
    if (cached) return JSON.parse(cached) as AerodromeInfo;
  } catch {
    // localStorage indisponible : on interroge le réseau
  } // <-- Accolade manquante ajoutée ici

  try {
    const res = await fetch(
      `https://api.core.openaip.net/api/airports?search=${encodeURIComponent(code)}&page=1&limit=10`, // <-- Variables manquantes corrigées
      { headers: { 'x-openaip-api-key': apiKey, Accept: 'application/json' } }
    );
    if (!res.ok) {
      console.warn('OpenAIP HTTP', res.status, 'pour', code);
      return null;
    }
    const data = await res.json();
    const items: any[] = Array.isArray(data.items) ? data.items : [];
    const item = items.find((i) => (i.icaoCode || '').toUpperCase() === code);
    if (!item) return null;
    
    const coords = item.geometry?.coordinates;
    const info: AerodromeInfo = {
      oaci: code,
      name: item.name || code,
      city: item.city || '',
      region: item.country || '',
      elevationFt:
        item.elevation?.value !== undefined
          ? Math.round(
              item.elevation.unit === 0
                ? item.elevation.value * 3.28084
                : item.elevation.value
            )
          : undefined,
      runways: '', // <-- Fonctions non définies retirées
      frequencies: {}, 
      lat: Array.isArray(coords) ? coords[1] : undefined,
      lon: Array.isArray(coords) ? coords[0] : undefined,
    };
    
    try {
      localStorage.setItem('AERO_CACHE_' + code, JSON.stringify(info));
    } catch {
      // quota plein : on continue sans cache
    }
    return info;
  } catch (err) {
    console.warn('OpenAIP indisponible pour', code, err);
    return null;
  }
} // <-- Accolade manquante ajoutée ici

/**
 * Notes pré-remplies pour le log de nav.
 * Mentionne toujours la source et l'obligation de recoupement VAC.
 */
export function formatAerodromeNotes(
  info: AerodromeInfo | null,
  oaci?: string
): string {
  if (!info) {
    return `${oaci || ''} — non trouvé sur OpenAIP.\nÀ compléter depuis la VAC en vigueur.`;
  }
  const f = info.frequencies;
  const freqLine = [
    f.atis && `ATIS: ${f.atis}`,
    f.twr && `TWR: ${f.twr}`,
    f.gnd && `GND: ${f.gnd}`,
    f.afis && `AFIS: ${f.afis}`,
    f.aa && `A/A: ${f.aa}`,
    f.app && `APP: ${f.app}`,
  ]
    .filter(Boolean)
    .join(' | ');

  const infoLine = [
    info.elevationFt !== undefined && `Alt: ${info.elevationFt} ft`,
    info.runways && `Pistes: ${info.runways}`,
  ]
    .filter(Boolean)
    .join(' | ');

  return [
    freqLine || 'Aucune fréquence publiée sur OpenAIP.',
    infoLine,
    'Source OpenAIP — à recouper sur VAC en vigueur.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface ArrivalAirportResult {
  oaci: string;
  name: string;
  lat?: number;
  lng?: number;
  elevationFt?: number;
  frequencies: AerodromeInfo['frequencies'];
  runways?: string;
  tdpQnhFt?: string;
  integration?: string;
  sunriseUtc?: string;
  sunriseLocal?: string;
  sunsetUtc?: string;
  sunsetLocal?: string;
  vfrDayStartUtc?: string;
  vfrDayStartLocal?: string;
  vfrDayEndUtc?: string;
  vfrDayEndLocal?: string;
  rawNotes?: string;
}

function fmtUtc(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

function fmtLocal(d: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Paris',
    }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/**
 * Éphémérides via sunrise-sunset.org.
 * Début VFR jour = lever - 30 min / Fin VFR jour = coucher + 30 min
 */
export async function fetchSunTimes(lat: number, lng: number, flightDate?: string) {
  const dateVol = flightDate || new Date().toISOString().split('T')[0];
  try {
    const res = await fetch(
      `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lng}&date=${dateVol}&formatted=0`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.results) return null;

    const sr = new Date(data.results.sunrise);
    const ss = new Date(data.results.sunset);
    const start = new Date(sr.getTime() - 30 * 60 * 1000);
    const end = new Date(ss.getTime() + 30 * 60 * 1000);

    return {
      sunriseUtc: fmtUtc(sr),
      sunriseLocal: fmtLocal(sr),
      sunsetUtc: fmtUtc(ss),
      sunsetLocal: fmtLocal(ss),
      vfrDayStartUtc: fmtUtc(start),
      vfrDayStartLocal: fmtLocal(start),
      vfrDayEndUtc: fmtUtc(end),
      vfrDayEndLocal: fmtLocal(end),
    };
  } catch (err) {
    console.warn('Erreur éphémérides:', err);
    return null;
  }
}

/**
 * Données du terrain d'arrivée : OpenAIP uniquement, puis éphémérides.
 * Si OpenAIP ne connaît pas le terrain, les champs restent vides et
 * les notes le disent explicitement.
 */
export async function fetchArrivalAirportData(
  oaciCode: string,
  flightDate?: string,
  customApiKey?: string
): Promise<ArrivalAirportResult | null> {
  const cleanInput = (oaciCode || '').trim();
  if (!cleanInput) return null;

  const icao = extractIcao(cleanInput);
  const apiKey =
    customApiKey && customApiKey.trim().length > 5
      ? customApiKey.trim()
      : DEFAULT_OPENAIP_KEY;

  const info = icao ? await fetchAerodromeDetails(icao, apiKey) : null;

  const result: ArrivalAirportResult = {
    oaci: info?.oaci || icao || cleanInput.toUpperCase(),
    name: info?.name || cleanInput,
    lat: info?.lat,
    lng: info?.lon,
    elevationFt: info?.elevationFt,
    frequencies: info?.frequencies || {},
    runways: info?.runways || '',
    tdpQnhFt:
      info?.elevationFt !== undefined
        ? `${Math.round((info.elevationFt + 1000) / 100) * 100}`
        : '',
    integration: '',
    rawNotes: formatAerodromeNotes(info, icao || cleanInput),
  };

  if (result.lat !== undefined && result.lng !== undefined) {
    const sun = await fetchSunTimes(result.lat, result.lng, flightDate);
    if (sun) Object.assign(result, sun);
  }

  return result;
}