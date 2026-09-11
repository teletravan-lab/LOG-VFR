/**
 * Service de génération des URLs de cartes VAC (SIA) et fiches terrains ULM (BASULM).
 *
 * Ce fichier centralise toute la logique de calcul de cycle AIRAC et de construction
 * d'URL vers les publications aéronautiques officielles françaises.
 */

import { FRENCH_AERODROMES } from '../data/aerodromes';

// Mois en anglais sur 3 lettres majuscules pour le dossier eAIP du SIA
const AIRAC_MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

/**
 * Calcule la date du cycle AIRAC en vigueur pour une date donnée.
 *
 * Date de référence connue : 3 septembre 2026 (cycle AIRAC confirmé).
 * Cycle = 28 jours. Retourne la date du cycle en cours, c'est-à-dire
 * la dernière date de cycle antérieure ou égale à "now".
 * Calcul en UTC pour éviter tout décalage de fuseau.
 *
 * @param now Date à tester (par défaut la date actuelle)
 * @returns Date du cycle AIRAC actif (à 00:00:00 UTC)
 */
export function currentAiracDate(now: Date = new Date()): Date {
  // Référence confirmée : 3 septembre 2026 à 00:00:00 UTC
  const refUtc = Date.UTC(2026, 8, 3, 0, 0, 0);
  const cycleMs = 28 * 24 * 60 * 60 * 1000;

  // Normalisation UTC de la date fournie
  const nowUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds(),
    now.getUTCMilliseconds()
  );

  const diffMs = nowUtc - refUtc;
  const cycles = Math.floor(diffMs / cycleMs);

  return new Date(refUtc + cycles * cycleMs);
}

/**
 * Valide le format OACI français LFxx (LF suivi de 2 lettres alphabétiques).
 */
function isValidFrenchOaci(code: string): boolean {
  return /^LF[A-Z]{2}$/.test(code);
}

/**
 * Retourne l'URL directe vers la carte VAC au format PDF sur le serveur du SIA.
 *
 * Date de vérification du format : 7 septembre 2026.
 * Format : https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_JJ_MMM_AAAA/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.OACI.pdf
 *
 * Raison du calcul AIRAC :
 * Le dossier eAIP change à chaque cycle AIRAC, tous les 28 jours exactement.
 * Le calcul dynamique évite de coder une date en dur et assure la validité des liens.
 *
 * Maintenance :
 * Si le SIA modifie un jour son arborescence ou son format d'URL, une seule
 * modification est nécessaire, exclusivement ici.
 *
 * @param oaci Code OACI de l'aérodrome (ex: 'LFON', 'lfpx')
 * @returns URL du PDF de la carte VAC, ou null si code absent ou format non-LFxx
 */
export function getVacUrl(oaci: string): string | null {
  if (!oaci || typeof oaci !== 'string') return null;

  const codeUpper = oaci.trim().toUpperCase();
  if (!isValidFrenchOaci(codeUpper)) {
    return null;
  }

  const airac = currentAiracDate();
  const day = String(airac.getUTCDate()).padStart(2, '0');
  const month = AIRAC_MONTHS[airac.getUTCMonth()];
  const year = airac.getUTCFullYear();
  const folder = `eAIP_${day}_${month}_${year}`;

  return `https://www.sia.aviation-civile.gouv.fr/media/dvd/${folder}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${codeUpper}.pdf`;
}

/**
 * Vérifie si un identifiant correspond à une plateforme ULM.
 * Format : 'LF' suivi uniquement de chiffres (ex: 'LF7853', 'LF0161').
 *
 * @param code Identifiant à vérifier
 */
export function isUlmIdent(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return /^LF\d+$/i.test(code.trim());
}

/**
 * Retourne l'URL directe vers la fiche terrain ULM sur BASULM (FFPLUM).
 *
 * Date de vérification du format : 8 septembre 2026 sur LF7853 (Thoiry).
 * Format : https://basulm.ffplum.fr/PDF/{IDENT}.pdf
 * Aucun cycle AIRAC n'intervient : l'URL est stable et ne dépend pas de la date.
 *
 * @param ident Identifiant fédéral ULM (ex: 'LF7853', 'lf0161')
 * @returns URL du PDF BASULM, ou null si identifiant non-ULM
 */
export function getUlmSheetUrl(ident: string): string | null {
  if (!isUlmIdent(ident)) return null;
  const clean = ident.trim().toUpperCase();
  return `https://basulm.ffplum.fr/PDF/${clean}.pdf`;
}

export interface VacLinkData {
  url: string;
  label: string;
  title: string;
}

/**
 * Détermine le lien de fiche/carte terrain selon le type de terrain :
 * - Code OACI réel (LF + 2 lettres) : getVacUrl, libellé "Carte VAC (SIA)"
 * - Identifiant ULM (LF + chiffres) : getUlmSheetUrl, libellé "Carte VAC (SIA)"
 * - Ni l'un ni l'autre : null
 *
 * @param code Code OACI ou identifiant ULM
 */
export function getAirfieldVacLink(code?: string | null): VacLinkData | null {
  if (!code || typeof code !== 'string') return null;

  const trimmed = code.trim();
  const vacUrl = getVacUrl(trimmed);
  if (vacUrl) {
    return {
      url: vacUrl,
      label: 'Carte VAC (SIA)',
      title: 'Carte VAC du cycle en cours — vérifier la date sur le document',
    };
  }

  const ulmUrl = getUlmSheetUrl(trimmed);
  if (ulmUrl) {
    return {
      url: ulmUrl,
      label: 'Carte VAC (SIA)',
      title: 'Carte VAC du cycle en cours — vérifier la date sur le document',
    };
  }

  return null;
}

/**
 * Extrait le code OACI ou identifiant ULM français depuis le champ oaci ou name.
 * Exemples gérés :
 * - oaci: "LFPT" -> "LFPT"
 * - oaci: "LF7853" -> "LF7853"
 * - name: "LFPT Pontoise - Cormeilles" -> "LFPT"
 * - name: "LFOI Abbeville" -> "LFOI"
 * - name: "Chavenay" -> trouve "LFPX" dans FRENCH_AERODROMES
 */
export function extractAirfieldCode(name?: string | null, oaci?: string | null): string | null {
  if (oaci && typeof oaci === 'string') {
    const cleanOaci = oaci.trim().toUpperCase();
    if (isValidFrenchOaci(cleanOaci) || isUlmIdent(cleanOaci)) {
      return cleanOaci;
    }
  }

  if (name && typeof name === 'string') {
    const trimmed = name.trim();
    // Recherche d'un code LFxx ou LF+chiffres en début de mot
    const regexMatch = trimmed.match(/\b(LF[A-Z]{2})\b/i) || trimmed.match(/\b(LF\d{2,5})\b/i);
    if (regexMatch) {
      const code = regexMatch[1].toUpperCase();
      if (isValidFrenchOaci(code) || isUlmIdent(code)) {
        return code;
      }
    }

    // Si aucun code explicite dans le texte, chercher dans la base des aérodromes français
    const lower = trimmed.toLowerCase();
    if (lower.length >= 3) {
      const found = FRENCH_AERODROMES.find((a) => {
        if (a.oaci && (lower === a.oaci.toLowerCase() || lower.startsWith(a.oaci.toLowerCase() + ' '))) {
          return true;
        }
        if (
          a.name &&
          (lower === a.name.toLowerCase() ||
            a.name.toLowerCase().includes(lower) ||
            lower.includes(a.name.toLowerCase()))
        ) {
          return true;
        }
        return false;
      });
      if (found && found.oaci) {
        const candidate = found.oaci.toUpperCase();
        if (isValidFrenchOaci(candidate) || isUlmIdent(candidate)) {
          return candidate;
        }
      }
    }
  }

  return null;
}

export interface ResolvedAirfieldVac {
  oaci: string;
  vacLink: VacLinkData;
}

/**
 * Résout le lien de carte VAC ou fiche ULM pour n'importe quel point ou aérodrome.
 * Fonctionne pour les points de départ, d'arrivée et tous les aérodromes en route.
 */
export function resolveAirfieldVac(
  point?: { name?: string | null; oaci?: string | null; type?: string | null } | null
): ResolvedAirfieldVac | null {
  if (!point) return null;
  const oaci = extractAirfieldCode(point.name, point.oaci);
  if (!oaci) return null;
  const vacLink = getAirfieldVacLink(oaci);
  if (!vacLink) return null;
  return { oaci, vacLink };
}
