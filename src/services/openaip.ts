import { AerodromeInfo } from '../types';

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

function mapFrequencies(list: any[]): AerodromeInfo['frequencies'] {
  const f: AerodromeInfo['frequencies'] = {};
  for (const item of list || []) {
    const val = item.value || '';
    const text = `${item.name || ''} ${item.callsign || ''}`.toUpperCase();
    const t = item.type;
    if (!val) continue;
    if (!f.atis && (text.includes('ATIS') || t === 15 || t === 1)) f.atis = val;
    else if (!f.twr && (text.includes('TWR') || text.includes('TOUR') || text.includes('TOWER') || t === 2)) f.twr = val;
    else if (!f.gnd && (text.includes('GND') || text.includes('SOL') || text.includes('GROUND') || t === 3)) f.gnd = val;
    else if (!f.afis && (text.includes('AFIS') || t === 9)) f.afis = val;
    else if (!f.aa && (text.includes('A/A') || text.includes('AUTO') || text.includes('UNICOM') || text.includes('INFO') || [10, 12, 13, 14, 16].includes(t))) f.aa = val;
    else if (!f.app && (text.includes('APP') || text.includes('APPROCHE') || t === 5)) f.app = val;
  }

  // Repli en fin de traitement : si aucune catégorie n'a été renseignée
  // (ni atis, ni twr, ni gnd, ni afis, ni aa, ni app) alors que la liste contenait
  // au moins une fréquence avec une valeur, place la première valeur non vide dans aa
  if (!f.atis && !f.twr && !f.gnd && !f.afis && !f.aa && !f.app) {
    const firstNonEmpty = (list || []).find((item) => (item?.value || '').trim())?.value?.trim();
    if (firstNonEmpty) {
      f.aa = firstNonEmpty;
    }
  }

  f.afis_aa = f.afis || f.aa || '';
  return f;
}

function mapRunways(list: any[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of list || []) {
    const des = r.designator;
    if (!des || seen.has(des)) continue;
    const num = parseInt(des, 10);
    const len = r.dimension?.length?.value ? ` (${Math.round(r.dimension.length.value)}m)` : '';
    if (!isNaN(num)) {
      const rec = num <= 18 ? num + 18 : num - 18;
      const recStr = rec < 10 ? `0${rec}` : `${rec}`;
      const opp = (list || []).find((o: any) => o.designator?.startsWith(recStr));
      seen.add(des);
      if (opp) {
        seen.add(opp.designator);
        out.push(`${des}/${opp.designator}${len}`);
      } else {
        out.push(`${des}${len}`);
      }
    } else {
      seen.add(des);
      out.push(des);
    }
  }
  return out.join(' - ');
}

/**
 * Récupère les données d'un terrain depuis OpenAIP par son identifiant unique.
 * Renvoie null si la réponse n'est pas OK ou si l'objet est vide.
 * Le résultat est mis en cache dans localStorage sous la clé 'oaip:id:<id>'.
 */
export async function fetchAerodromeDetails(
  openAipId: string,
  apiKey: string = DEFAULT_OPENAIP_KEY
): Promise<AerodromeInfo | null> {
  const id = (openAipId || '').trim();
  if (!id) return null;

  try {
    const cached = localStorage.getItem('oaip:id:' + id);
    if (cached) return JSON.parse(cached) as AerodromeInfo;
  } catch {
    // localStorage indisponible : on interroge le réseau directement
  }

  try {
    const res = await fetch(
      `https://api.core.openaip.net/api/airports/${encodeURIComponent(id)}`,
      { headers: { 'x-openaip-api-key': apiKey, Accept: 'application/json' } }
    );
    if (!res.ok) {
      console.warn('OpenAIP HTTP', res.status, 'pour', id);
      return null;
    }
    const item = await res.json();
    if (!item || typeof item !== 'object' || Object.keys(item).length === 0) {
      return null;
    }

    const code = ((item.icaoCode || item.altIdentifier || '') as string).trim().toUpperCase();
    const coords = item.geometry?.coordinates;
    const info: AerodromeInfo = {
      oaci: code,
      name: item.name || code,
      openAipId: item._id || id,
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
      runways: mapRunways(item.runways),
      frequencies: mapFrequencies(item.frequencies),
      lat: Array.isArray(coords) ? coords[1] : undefined,
      lon: Array.isArray(coords) ? coords[0] : undefined,
      isUlm: item.type === 6,
    };

    try {
      localStorage.setItem('oaip:id:' + id, JSON.stringify(info));
    } catch {
      // quota plein : on continue sans cache
    }
    return info;
  } catch (err) {
    console.warn('OpenAIP indisponible pour', id, err);
    return null;
  }
}// <-- Accolade manquante ajoutée ici

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
 * Données du terrain d'arrivée : OpenAIP par identifiant, puis éphémérides.
 * Si OpenAIP ne connaît pas le terrain, les champs restent vides et
 * les notes le disent explicitement.
 */
export async function fetchArrivalAirportData(
  openAipId: string,
  flightDate?: string,
  customApiKey?: string
): Promise<ArrivalAirportResult | null> {
  const cleanId = (openAipId || '').trim();
  if (!cleanId) return null;

  const apiKey =
    customApiKey && customApiKey.trim().length > 5
      ? customApiKey.trim()
      : DEFAULT_OPENAIP_KEY;

  const info = await fetchAerodromeDetails(cleanId, apiKey);

  const result: ArrivalAirportResult = {
    oaci: info?.oaci || cleanId.toUpperCase(),
    name: info?.name || cleanId,
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
    rawNotes: formatAerodromeNotes(info, info?.oaci || cleanId),
  };

  if (result.lat !== undefined && result.lng !== undefined) {
    const sun = await fetchSunTimes(result.lat, result.lng, flightDate);
    if (sun) Object.assign(result, sun);
  }

  return result;
}