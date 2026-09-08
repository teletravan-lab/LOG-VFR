import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  increment,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

const ANALYTICS_DOC_REF = doc(db, 'analytics', 'global');

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