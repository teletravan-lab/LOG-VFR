import { Waypoint } from '../types';
import { FRENCH_AERODROMES } from '../data/aerodromes';

/**
 * Tronque le nom d'un point en route s'il dépasse maxLen caractères (15 par défaut),
 * pour éviter qu'il ne s'affiche sur deux lignes.
 * Les points de départ et d'arrivée ne doivent pas être tronqués.
 */
export const truncateWpName = (name?: string, maxLen = 15): string => {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
};

/**
 * Pour une fin de branche qui correspond à un aérodrome (ou waypoint avec fréquences),
 * extrait et formate les fréquences radio sous la forme "CODEOACI : ATIS: ... | TWR: ...".
 */
export const getBranchEndRadioNotes = (point?: Waypoint): string => {
  if (!point) return '';
  const name = point.name?.trim() || '';
  const oaci = (point.oaci || name.match(/^[A-Za-z0-9]{4}\b/)?.[0] || '').toUpperCase();
  const isAero =
    point.type === 'aerodrome' ||
    Boolean(oaci && oaci.length === 4) ||
    Boolean(point.frequencies && Object.values(point.frequencies).some(Boolean));

  if (!isAero && !oaci) return '';

  let freqs = point.frequencies;
  if ((!freqs || !Object.values(freqs).some(Boolean)) && oaci) {
    const matched = FRENCH_AERODROMES.find((a) => a.oaci.toUpperCase() === oaci);
    if (matched?.frequencies) {
      freqs = matched.frequencies;
    }
  }

  const parts: string[] = [];
  if (freqs?.atis) parts.push(`ATIS: ${freqs.atis}`);
  if (freqs?.twr) parts.push(`TWR: ${freqs.twr}`);
  if (freqs?.gnd) parts.push(`GND: ${freqs.gnd}`);
  if (freqs?.afis) parts.push(`AFIS: ${freqs.afis}`);
  if (freqs?.aa) parts.push(`A/A: ${freqs.aa}`);
  if (freqs?.afis_aa && !freqs?.afis && !freqs?.aa) parts.push(`A/A: ${freqs.afis_aa}`);
  if (freqs?.app) parts.push(`APP: ${freqs.app}`);
  if (freqs?.siv) parts.push(`SIV: ${freqs.siv}`);

  if (parts.length === 0 && !oaci) return '';
  const prefix = oaci ? `${oaci} : ` : '';
  return parts.length > 0 ? `${prefix}${parts.join(' | ')}` : (oaci ? `${prefix}Fréquences non définies` : '');
};
