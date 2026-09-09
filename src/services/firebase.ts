import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  increment,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

const ANALYTICS_DOC_REF = doc(db, 'analytics', 'global');

/**
 * Calcule les chaînes AAAA-MM-JJ du jour et d'hier
 * strictement dans le fuseau horaire Europe/Paris.
 */
export function getParisDateStrings(): { today: string; yesterday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  const today = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const yesterdayDate = new Date(Date.UTC(year, month - 1, day - 1));
  const yesterday = yesterdayDate.toISOString().split('T')[0];

  return { today, yesterday };
}

/**
 * Enregistre une visite au chargement de la page via 2 écritures atomiques indépendantes.
 * Utilise exclusivement increment(1) et { merge: true }.
 */
export async function recordVisit(today: string): Promise<void> {
  const pGlobal = setDoc(
    doc(db, 'analytics', 'global'),
    {
      visitCount: increment(1),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  ).catch((error) => {
    console.warn('Failed to increment global visit count:', error);
  });

  const pDaily = setDoc(
    doc(db, 'analytics', `visits-${today}`),
    {
      count: increment(1),
      day: today,
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 3600 * 1000)),
    },
    { merge: true }
  ).catch((error) => {
    console.warn(`Failed to increment daily visit count for ${today}:`, error);
  });

  await Promise.all([pGlobal, pDaily]);
}

/**
 * Écoute en temps réel le compteur total de visiteurs sur analytics/global (LECTURE SEULE).
 * Si le document vient du cache et n'existe pas encore, attend la réponse du serveur.
 */
export function subscribeToVisitorCount(callback: (count: number | null) => void): () => void {
  return onSnapshot(
    ANALYTICS_DOC_REF,
    (snapshot) => {
      if (!snapshot.exists()) {
        // Cache local vide chez un nouveau visiteur : on attend la réponse du serveur
        if ((snapshot as any).metadata?.fromCache) return;
        callback(null);
        return;
      }
      const data = snapshot.data();
      if (typeof data?.visitCount === 'number') {
        callback(data.visitCount);
      } else {
        callback(null);
      }
    },
    (error) => {
      console.warn('Visitor count snapshot error:', error);
    }
  );
}

/**
 * Récupère le nombre de visiteurs de la veille via un unique getDoc sur analytics/visits-<hier>.
 * Renvoie null si le document n'existe pas (affiché '—', jamais 0).
 */
export async function fetchYesterdayVisitorCount(yesterday: string): Promise<number | null> {
  try {
    const yesterdayDocRef = doc(db, 'analytics', `visits-${yesterday}`);
    const snapshot = await getDoc(yesterdayDocRef);
    if (!snapshot.exists()) {
      return null;
    }
    const data = snapshot.data();
    return typeof data?.count === 'number' ? data.count : null;
  } catch (error) {
    console.warn('Failed to fetch yesterday visitor count:', error);
    return null;
  }
}

/**
 * Écoute en temps réel le compteur global de logs créés.
 *
 * Ne fait AUCUNE écriture : un listener ne doit jamais écrire, sinon
 * le premier instantané (qui vient du cache local, vide chez un nouveau
 * visiteur) déclenche une remise à zéro du compteur pour tout le monde.
 */
export function subscribeToAnalytics(callback: (count: number) => void): () => void {
  return onSnapshot(
    ANALYTICS_DOC_REF,
    (snapshot) => {
      if (!snapshot.exists()) {
        // Cache local vide : on attend la réponse du serveur avant de conclure.
        if ((snapshot as any).metadata?.fromCache) return;
        // Le serveur confirme que le document n'existe pas encore.
        callback(0);
        return;
      }
      const data = snapshot.data();
      callback(typeof data?.printCount === 'number' ? data.printCount : 0);
    },
    (error) => {
      console.warn('Analytics snapshot error:', error);
    }
  );
}

/**
 * Incrémente de 1 le compteur global d'impressions.
 *
 * Une seule écriture atomique : increment() est résolu côté serveur,
 * donc deux impressions simultanées ne s'écrasent pas, et merge:true
 * crée le document s'il n'existe pas sans jamais écraser l'existant.
 */
export async function incrementPrintCount(): Promise<void> {
  try {
    await setDoc(
      ANALYTICS_DOC_REF,
      {
        printCount: increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Failed to increment analytics print count:', error);
  }
}