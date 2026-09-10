import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { FlightPlan } from '../types';

// Domaine court de redirection vers l'application.
// HTTP volontaire : la redirection OVH ne gère pas HTTPS.
// Laisser vide pour utiliser l'adresse courante du navigateur.
export const APP_BASE_URL = 'https://log-vfr.ai.studio';

/**
 * Alphabet de 56 symboles sans les caractères ambigus (0, O, 1, l, I).
 */
export const ID_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const ID_SUFFIX_LENGTH = 6;

/**
 * Génère un identifiant unique de la forme JJ-MM-XXXXXX
 * - JJ : jour de création (2 chiffres)
 * - MM : mois de création (2 chiffres)
 * - XXXXXX : suffixe aléatoire de 6 caractères issu de l'alphabet à 56 symboles
 *
 * Utilise UNIQUEMENT crypto.getRandomValues sans modulo bias (jamais Math.random).
 */
export function generateLogId(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  let suffix = '';
  const randomBytes = new Uint8Array(ID_SUFFIX_LENGTH * 2);

  while (suffix.length < ID_SUFFIX_LENGTH) {
    crypto.getRandomValues(randomBytes);
    for (let i = 0; i < randomBytes.length && suffix.length < ID_SUFFIX_LENGTH; i++) {
      const byte = randomBytes[i];
      // 56 * 4 = 224 : byte < 224 élimine tout biais statistique sur l'alphabet de 56 caractères
      if (byte < 224) {
        suffix += ID_ALPHABET[byte % ID_ALPHABET.length];
      }
    }
  }

  return `${day}-${month}-${suffix}`;
}

/**
 * Calcule l'expiration à +6 mois sous la forme d'un Timestamp Firestore.
 */
export function getSixMonthsExpiry(from: Date = new Date()): Timestamp {
  const expiryDate = new Date(from);
  expiryDate.setMonth(expiryDate.getMonth() + 6);
  return Timestamp.fromDate(expiryDate);
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Enregistre le plan de vol dans Firestore avec merge: true.
 * Supporte le vol aller (outbound) et le vol retour optionnel (return).
 * L'identifiant complet (JJ-MM-XXXXXX) ne change jamais une fois créé.
 */
export async function saveFlightLogToFirestore(
  logId: string,
  outbound: FlightPlan,
  returnPlan: FlightPlan | null = null,
  activeLeg: 'outbound' | 'return' = 'outbound',
  existingCreatedAt?: string
): Promise<{ success: boolean; savedAt: Date }> {
  const path = `flightLogs/${logId}`;
  try {
    const now = new Date();
    const docRef = doc(db, 'flightLogs', logId);

    // Sérialisation propre pour éliminer toute valeur `undefined` non acceptée par Firestore
    const cleanOutbound = JSON.parse(JSON.stringify(outbound));
    const cleanReturn = returnPlan ? JSON.parse(JSON.stringify(returnPlan)) : null;

    await setDoc(
      docRef,
      {
        id: logId,
        outbound: cleanOutbound,
        return: cleanReturn,
        activeLeg,
        flightPlan: cleanOutbound, // Rétrocompatibilité ascendante avec les anciennes versions
        updatedAt: now.toISOString(),
        expiresAt: getSixMonthsExpiry(now),
        createdAt: existingCreatedAt || now.toISOString(),
      },
      { merge: true }
    );

    return { success: true, savedAt: now };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { success: false, savedAt: new Date() };
  }
}

/**
 * Charge un log de vol depuis Firestore à partir de son identifiant JJ-MM-XXXXXX.
 * COMPATIBILITÉ ASCENDANTE OBLIGATOIRE :
 * Si "outbound" est absent et "flightPlan" présent, traite "flightPlan" comme le vol aller et "return" comme null.
 */
export async function loadFlightLogFromFirestore(
  logId: string
): Promise<{
  outbound: FlightPlan;
  returnPlan: FlightPlan | null;
  activeLeg: 'outbound' | 'return';
  createdAt: string;
  flightPlan: FlightPlan;
} | null> {
  const path = `flightLogs/${logId}`;
  try {
    const docRef = doc(db, 'flightLogs', logId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    if (!data) {
      return null;
    }

    // Compatibilité ascendante : support des documents existants sans champ 'outbound'
    const outbound = (data.outbound || data.flightPlan) as FlightPlan | undefined;
    if (!outbound) {
      return null;
    }

    const returnPlan = (data.return || null) as FlightPlan | null;
    const activeLeg = (data.activeLeg === 'return' ? 'return' : 'outbound') as 'outbound' | 'return';

    return {
      outbound,
      returnPlan,
      activeLeg,
      flightPlan: outbound,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Formate l'URL complète avec le protocole, le domaine et le paramètre ?log=JJ-MM-XXXXXX
 * Ajoute optionnellement &v=retour si leg === 'return'
 */
export function getLogUrl(logId: string, leg?: 'outbound' | 'return'): string {
  const base = APP_BASE_URL.trim();
  const vSuffix = leg === 'return' ? '&v=retour' : '';
  if (base !== '') {
    const cleanBase = base.replace(/\/+$/, '');
    return `${cleanBase}/?log=${encodeURIComponent(logId)}${vSuffix}`;
  }

  if (typeof window === 'undefined') return `?log=${encodeURIComponent(logId)}${vSuffix}`;
  return `${window.location.origin}${window.location.pathname}?log=${encodeURIComponent(logId)}${vSuffix}`;
}

/**
 * Retourne l'URL sans le protocole (sans "https://"), pour un affichage plus court à l'écran.
 */
export function getLogUrlForDisplay(logId: string, leg?: 'outbound' | 'return'): string {
  const fullUrl = getLogUrl(logId, leg);
  return fullUrl.replace(/^https?:\/\//, '');
}
