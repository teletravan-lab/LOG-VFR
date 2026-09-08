import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { FlightPlan } from '../types';

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
 * L'identifiant complet (JJ-MM-XXXXXX) ne change jamais une fois créé.
 */
export async function saveFlightLogToFirestore(
  logId: string,
  flightPlan: FlightPlan,
  existingCreatedAt?: string
): Promise<{ success: boolean; savedAt: Date }> {
  const path = `flightLogs/${logId}`;
  try {
    const now = new Date();
    const docRef = doc(db, 'flightLogs', logId);

    // Sérialisation propre pour éliminer toute valeur `undefined` non acceptée par Firestore
    const cleanFlightPlan = JSON.parse(JSON.stringify(flightPlan));

    await setDoc(
      docRef,
      {
        id: logId,
        flightPlan: cleanFlightPlan,
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
 */
export async function loadFlightLogFromFirestore(
  logId: string
): Promise<{ flightPlan: FlightPlan; createdAt: string } | null> {
  const path = `flightLogs/${logId}`;
  try {
    const docRef = doc(db, 'flightLogs', logId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    if (!data || !data.flightPlan) {
      return null;
    }

    return {
      flightPlan: data.flightPlan as FlightPlan,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

/**
 * Formate l'URL complète avec le protocole, le domaine et le paramètre ?log=JJ-MM-XXXXXX
 */
export function getLogUrl(logId: string): string {
  if (typeof window === 'undefined') return `?log=${logId}`;
  return `${window.location.origin}${window.location.pathname}?log=${encodeURIComponent(logId)}`;
}
